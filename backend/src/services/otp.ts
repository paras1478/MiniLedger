import {
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_RETENTION_MS,
  OTP_SEND_WINDOW_MS,
  OTP_TTL_MS,
} from '../config/auth.js';
import type { OtpPurpose, Prisma } from '../generated/prisma/client.js';
import { AppError, secondsUntil } from '../lib/errors.js';
import { generateOtp, hashOtp, otpMatches } from '../lib/otp.js';
import type { OtpProvider } from '../lib/otp-provider.js';
import { prisma } from '../lib/prisma.js';

/** Who a code is for: a phone number, the reason, and (for PHONE_CHANGE) the requesting user. */
export interface OtpTarget {
  phone: string;
  purpose: OtpPurpose;
  userId?: string;
}

/**
 * Creates a code for `target` and delivers it. Enforces a per-phone resend cooldown and a cap on
 * sends per hour, shared by every purpose (they all text the same phone). With Twilio Verify the
 * code is generated and texted by Twilio and no code or hash is stored here.
 */
export async function issueOtp(provider: OtpProvider, target: OtpTarget) {
  if (provider.kind === 'unavailable') {
    console.error(`[otp] cannot send a code: delivery ${provider.label}`);
    throw new AppError(
      503,
      'OTP_PROVIDER_NOT_CONFIGURED',
      'Phone verification is not available: SMS delivery is not configured on the server.'
    );
  }

  const { phone, purpose, userId } = target;
  const now = new Date();
  // Generated here unless Twilio Verify generates it; only its HMAC is stored.
  const localCode = provider.kind === 'twilio-verify' ? null : generateOtp();

  const row = await prisma.$transaction(async (tx) => {
    // Serialize sends for this phone so two concurrent requests cannot both pass the limits.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;

    const latest = await tx.otpCode.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (latest) {
      const resendAt = new Date(latest.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS);
      if (resendAt > now) {
        const retryAfterSeconds = secondsUntil(resendAt, now);
        throw new AppError(
          429,
          'OTP_RESEND_COOLDOWN',
          `Please wait ${retryAfterSeconds} seconds before requesting another code.`,
          { retryAfterSeconds },
          retryAfterSeconds
        );
      }
    }

    const windowStart = new Date(now.getTime() - OTP_SEND_WINDOW_MS);
    const recent = await tx.otpCode.findMany({
      where: { phone, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (recent.length >= OTP_MAX_SENDS_PER_WINDOW) {
      // The oldest send in the window is the next one to drop out of it.
      const freesAt = new Date(recent[0]!.createdAt.getTime() + OTP_SEND_WINDOW_MS);
      const retryAfterSeconds = secondsUntil(freesAt, now);
      throw new AppError(
        429,
        'OTP_SEND_LIMIT_REACHED',
        `Too many codes requested for this number. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
        { retryAfterSeconds },
        retryAfterSeconds
      );
    }

    return tx.otpCode.create({
      data: {
        phone,
        purpose,
        userId: userId ?? null,
        codeHash: localCode ? hashOtp(phone, localCode) : null,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        createdAt: now,
      },
      select: { id: true },
    });
  });

  if (provider.kind === 'local') {
    provider.deliver(phone, localCode!);
  } else {
    try {
      const receipt =
        provider.kind === 'twilio-sms' ? await provider.deliver(phone, localCode!) : await provider.send(phone);
      await prisma.otpCode.update({ where: { id: row.id }, data: { providerSid: receipt.sid } });
    } catch (error) {
      // Nothing was sent, so this attempt must not start a cooldown or count toward the hourly cap.
      await prisma.otpCode.delete({ where: { id: row.id } }).catch(() => undefined);
      throw error;
    }
  }

  // Housekeeping; failure here must not fail the request.
  prisma.otpCode
    .deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - OTP_RETENTION_MS) } } })
    .catch((error: unknown) => console.error('OTP cleanup failed:', error));

  return {
    expiresInSeconds: OTP_TTL_MS / 1000,
    resendAvailableInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    /** How the code reaches the user: by SMS, or (development) only in the server log. */
    delivery: provider.kind === 'local' ? ('log' as const) : ('sms' as const),
  };
}

/** The `message` returned for a send request. Twilio accepting a request is not delivery. */
export function sentMessage(delivery: 'sms' | 'log'): string {
  return delivery === 'sms'
    ? 'Verification code requested. It should arrive by SMS within a minute.'
    : 'Development mode: no SMS was sent. The code is printed in the API server log.';
}

/**
 * Checks `code` against the newest code for `target` (same phone, purpose and user). On success
 * the code is consumed and `onVerified` runs in the same transaction, so the code is never
 * consumed without its effect (or the reverse).
 */
export async function redeemOtp<T>(
  provider: OtpProvider,
  target: OtpTarget,
  code: string,
  onVerified: (tx: Prisma.TransactionClient, verifiedAt: Date) => Promise<T>
): Promise<T> {
  const { phone, purpose, userId } = target;
  const now = new Date();

  const otp = await prisma.otpCode.findFirst({
    where: { phone, purpose, userId: userId ?? null },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) {
    throw new AppError(400, 'OTP_NOT_FOUND', 'No code was requested for this number. Request a new code.');
  }
  if (otp.consumedAt) {
    throw new AppError(400, 'OTP_ALREADY_USED', 'This code has already been used. Request a new code.');
  }
  if (otp.expiresAt <= now) throw expired();

  // Reserve an attempt atomically *before* comparing, so parallel guesses cannot exceed the limit.
  const reserved = await prisma.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_MAX_VERIFY_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) throw tooManyAttempts();
  const attemptsRemaining = OTP_MAX_VERIFY_ATTEMPTS - (otp.attempts + 1);

  let result: 'approved' | 'incorrect' | 'expired' | 'locked';
  if (otp.codeHash) {
    result = otpMatches(otp.codeHash, phone, code) ? 'approved' : 'incorrect';
  } else if (provider.kind === 'twilio-verify') {
    try {
      result = await provider.check(phone, code);
    } catch (error) {
      // The provider could not answer, so this guess was never judged: give the attempt back.
      await prisma.otpCode.updateMany({ where: { id: otp.id }, data: { attempts: { decrement: 1 } } });
      throw error;
    }
  } else {
    // Sent by Twilio, but the server is no longer configured for it (e.g. after a config change).
    result = 'expired';
  }

  if (result === 'expired') throw expired();
  if (result === 'locked') throw tooManyAttempts();
  if (result === 'incorrect') {
    if (attemptsRemaining <= 0) throw tooManyAttempts();
    throw new AppError(400, 'OTP_INVALID', 'The code is incorrect.', { attemptsRemaining });
  }

  return prisma.$transaction(async (tx) => {
    // Consume exactly once: a concurrent request with the same code gets count === 0.
    const consumed = await tx.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) {
      throw new AppError(400, 'OTP_ALREADY_USED', 'This code has already been used. Request a new code.');
    }
    return onVerified(tx, now);
  });
}

function expired() {
  return new AppError(400, 'OTP_EXPIRED', 'This code has expired. Request a new code.');
}

function tooManyAttempts() {
  return new AppError(
    429,
    'OTP_ATTEMPTS_EXCEEDED',
    'Too many incorrect attempts for this code. Request a new code.'
  );
}
