import type { User } from '../generated/prisma/client.js';
import { signAccessToken } from '../lib/jwt.js';
import type { OtpProvider } from '../lib/otp-provider.js';
import { issueOtp, redeemOtp } from './otp.js';

export function toPublicUser(user: User) {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
  };
}

/** Sends a login code to `phone`. Works the same whether or not an account exists for it. */
export function sendOtp(provider: OtpProvider, phone: string) {
  return issueOtp(provider, { phone, purpose: 'LOGIN' });
}

/**
 * Checks a login code. On success the code is consumed, the user is created if this is their
 * first login (with the phone marked verified), and a JWT is issued.
 */
export async function verifyOtp(provider: OtpProvider, phone: string, code: string) {
  const { user, isNewUser } = await redeemOtp(provider, { phone, purpose: 'LOGIN' }, code, async (tx, now) => {
    const existing = await tx.user.findUnique({ where: { phone } });
    if (!existing) return { user: await tx.user.create({ data: { phone, phoneVerifiedAt: now } }), isNewUser: true };
    // Logging in with a code proves the number again.
    const user = await tx.user.update({ where: { id: existing.id }, data: { phoneVerifiedAt: now } });
    return { user, isNewUser: false };
  });

  const { token, expiresAt } = await signAccessToken(user);
  return { token, expiresAt, isNewUser, user: toPublicUser(user) };
}
