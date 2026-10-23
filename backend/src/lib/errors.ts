/**
 * An expected, client-facing error. The error handler turns it into
 * `{ "error": { "code", "message", "details"? } }` with the given HTTP status.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    /** Stable, machine-readable code, e.g. OTP_EXPIRED. Clients should branch on this. */
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    /** Sent as the Retry-After header (seconds) for 429 responses. */
    readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function secondsUntil(date: Date, now = new Date()): number {
  return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1000));
}
