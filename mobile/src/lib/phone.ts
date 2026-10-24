import { ApiError } from '@/lib/api-client';

// Helpers shared by the login and phone-verification screens. The server validates and
// normalizes every number again; these checks only give quicker feedback.

/** "98765 43210" -> "+919876543210"; numbers typed with "+" keep their own country code. */
export function toE164(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith('+') ? `+${trimmed.replace(/\D/g, '')}` : `+91${trimmed.replace(/\D/g, '')}`;
}

/** A message for an obviously incomplete number, or null if it is worth sending to the server. */
export function phoneInputError(input: string): string | null {
  const target = toE164(input);
  if (!input.trim().startsWith('+') && target.length !== 13) return 'Enter your 10-digit mobile number.';
  if (target.length < 9) return 'Enter the full number with its country code.';
  return null;
}

/** 75 -> "1:15", 42 -> "42s". */
export function formatCountdown(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`;
}

/** User-facing text for a failed send/verify call. */
export function otpErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (error.code === 'VALIDATION_ERROR') return Object.values(error.fieldErrors)[0] ?? error.message;
  if (error.code === 'OTP_INVALID') {
    const left = Number(error.details?.attemptsRemaining ?? 0);
    return `That code is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`;
  }
  return error.message;
}

/** Seconds to wait before another code may be requested, from a 429 response. */
export function retryAfterSeconds(error: unknown): number {
  return error instanceof ApiError ? Number(error.details?.retryAfterSeconds ?? 0) : 0;
}
