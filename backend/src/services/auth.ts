import {
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_RETENTION_MS,
  OTP_SEND_WINDOW_MS,
  OTP_TTL_MS,
} from '../config/auth.js';
import type { User } from '../generated/prisma/client.js';
import { AppError, secondsUntil } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { generateOtp, hashOtp, otpMatches } from '../lib/otp.js';
import { prisma } from '../lib/prisma.js';

export function toPublicUser(user: User) {
  return { id: user.id, phone: user.phone, name: user.name, createdAt: user.createdAt };
}

/**
 * Creates a new code for `phone` (superseding any earlier one) and logs it.
 * Enforces a per-phone resend cooldown and a cap on sends per window.
 */
export async function sendOtp(phone: string) {
  const now = new Date();
  const code = generateOtp();

  await prisma.$transaction(async (tx) => {
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

    await tx.otpCode.create({
      data: {
        phone,
        codeHash: hashOtp(phone, code),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        createdAt: now,
      },
    });
  });

  // No SMS provider yet: the code goes to the server log only, never to the API response.
  console.info(`[OTP] ${phone} -> ${code} (valid for ${OTP_TTL_MS / 60_000} minutes)`);

  // Housekeeping; failure here must not fail the request.
  prisma.otpCode
    .deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - OTP_RETENTION_MS) } } })
    .catch((error: unknown) => console.error('OTP cleanup failed:', error));

  return {
    expiresInSeconds: OTP_TTL_MS / 1000,
    resendAvailableInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
  };
}

/**
 * Checks `code` against the newest code for `phone`. On success the code is consumed, the user is
 * created if this is their first login, and a JWT is issued.
 */
export async function verifyOtp(phone: string, code: string) {
  const now = new Date();

  const otp = await prisma.otpCode.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
  });
  if (!otp) {
    throw new AppError(400, 'OTP_NOT_FOUND', 'No code was requested for this number. Request a new code.');
  }
  if (otp.consumedAt) {
    throw new AppError(400, 'OTP_ALREADY_USED', 'This code has already been used. Request a new code.');
  }
  if (otp.expiresAt <= now) {
    throw new AppError(400, 'OTP_EXPIRED', 'This code has expired. Request a new code.');
  }

  // Reserve an attempt atomically *before* comparing, so parallel guesses cannot exceed the limit.
  const reserved = await prisma.otpCode.updateMany({
    where: { id: otp.id, consumedAt: null, attempts: { lt: OTP_MAX_VERIFY_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    throw tooManyAttempts();
  }
  const attemptsUsed = otp.attempts + 1;

  if (!otpMatches(otp.codeHash, phone, code)) {
    const attemptsRemaining = OTP_MAX_VERIFY_ATTEMPTS - attemptsUsed;
    if (attemptsRemaining <= 0) throw tooManyAttempts();
    throw new AppError(400, 'OTP_INVALID', 'The code is incorrect.', { attemptsRemaining });
  }

  const { user, isNewUser } = await prisma.$transaction(async (tx) => {
    // Consume exactly once: a concurrent request with the same code gets count === 0.
    const consumed = await tx.otpCode.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) {
      throw new AppError(400, 'OTP_ALREADY_USED', 'This code has already been used. Request a new code.');
    }

    const existing = await tx.user.findUnique({ where: { phone } });
    if (existing) return { user: existing, isNewUser: false };
    return { user: await tx.user.create({ data: { phone } }), isNewUser: true };
  });

  const { token, expiresAt } = await signAccessToken(user);
  return { token, expiresAt, isNewUser, user: toPublicUser(user) };
}

function tooManyAttempts() {
  return new AppError(
    429,
    'OTP_ATTEMPTS_EXCEEDED',
    'Too many incorrect attempts for this code. Request a new code.'
  );
}
