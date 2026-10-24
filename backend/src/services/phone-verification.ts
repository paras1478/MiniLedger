import { OTP_RESEND_COOLDOWN_MS } from '../config/auth.js';
import type { User } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, secondsUntil } from '../lib/errors.js';
import type { OtpProvider } from '../lib/otp-provider.js';
import { prisma } from '../lib/prisma.js';
import { toPublicUser } from './auth.js';
import { issueOtp, redeemOtp } from './otp.js';

// Lets a signed-in user prove a phone number and make it their account's number (or re-verify
// their current one). Every operation is scoped to the authenticated user: codes are stored with
// the requester's id and can only be redeemed by that same user.

export function sendPhoneVerification(provider: OtpProvider, user: User, phone: string) {
  // Deliberately no "is this number taken?" check here: answering that before the requester proves
  // they own the number would let anyone probe which numbers have MiniLedger accounts.
  return issueOtp(provider, { phone, purpose: 'PHONE_CHANGE', userId: user.id });
}

export async function checkPhoneVerification(provider: OtpProvider, user: User, phone: string, code: string) {
  try {
    const updated = await redeemOtp(
      provider,
      { phone, purpose: 'PHONE_CHANGE', userId: user.id },
      code,
      async (tx, now) => {
        // Safe to reveal now: the requester has just proven they hold this number.
        const owner = await tx.user.findUnique({ where: { phone }, select: { id: true } });
        if (owner && owner.id !== user.id) throw phoneInUse();
        return tx.user.update({ where: { id: user.id }, data: { phone, phoneVerifiedAt: now } });
      }
    );
    return { user: toPublicUser(updated), changed: updated.phone !== user.phone };
  } catch (error) {
    // Another account took the number between the check above and the update (unique index).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw phoneInUse();
    throw error;
  }
}

/** The user's verification state plus any phone-change code still waiting to be entered. */
export async function getPhoneVerificationStatus(provider: OtpProvider, user: User) {
  const now = new Date();
  const pending = await prisma.otpCode.findFirst({
    where: { userId: user.id, purpose: 'PHONE_CHANGE', consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
    select: { phone: true, expiresAt: true, createdAt: true },
  });
  const resendAt = pending && new Date(pending.createdAt.getTime() + OTP_RESEND_COOLDOWN_MS);

  return {
    phone: user.phone,
    verified: user.phoneVerifiedAt !== null,
    verifiedAt: user.phoneVerifiedAt,
    pending: pending && {
      phone: pending.phone,
      expiresAt: pending.expiresAt,
      resendAvailableInSeconds: resendAt! > now ? secondsUntil(resendAt!, now) : 0,
    },
    /** False when the server cannot send codes (Twilio not configured). */
    available: provider.kind !== 'unavailable',
  };
}

function phoneInUse() {
  return new AppError(409, 'PHONE_IN_USE', 'This number is already linked to another MiniLedger account.');
}
