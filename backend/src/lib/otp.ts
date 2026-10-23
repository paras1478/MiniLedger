import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { OTP_LENGTH } from '../config/auth.js';
import { env } from '../config/env.js';

/** Cryptographically random, zero-padded numeric code, e.g. "042917". */
export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

/**
 * Keyed hash of the code, bound to the phone number. A plain SHA-256 of a 6-digit code could be
 * reversed by trying all 1,000,000 values; the HMAC key (OTP_SECRET) lives outside the database,
 * so a leaked otp_codes table alone does not reveal codes.
 */
export function hashOtp(phone: string, code: string): string {
  return createHmac('sha256', env.OTP_SECRET).update(`${phone}:${code}`).digest('hex');
}

/** Constant-time comparison so response timing does not leak how much of the code matched. */
export function otpMatches(storedHash: string, phone: string, code: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashOtp(phone, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
