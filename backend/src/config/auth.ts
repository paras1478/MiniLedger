import { env } from './env.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const OTP_LENGTH = 6;
/** A code is valid for 5 minutes after it is sent. */
export const OTP_TTL_MS = 5 * MINUTE;
/** Verification tries per code (including the successful one). After that a new code is needed. */
export const OTP_MAX_VERIFY_ATTEMPTS = 5;
/** Minimum gap between two codes for the same phone (OTP_RESEND_COOLDOWN_SECONDS, default 60). */
export const OTP_RESEND_COOLDOWN_MS = env.OTP_RESEND_COOLDOWN_SECONDS * SECOND;
/** At most this many codes per phone within OTP_SEND_WINDOW_MS (OTP_MAX_SENDS_PER_HOUR, default 5). */
export const OTP_MAX_SENDS_PER_WINDOW = env.OTP_MAX_SENDS_PER_HOUR;
export const OTP_SEND_WINDOW_MS = HOUR;
/** OTP rows older than this are purged. Must be longer than OTP_SEND_WINDOW_MS. */
export const OTP_RETENTION_MS = 24 * HOUR;
