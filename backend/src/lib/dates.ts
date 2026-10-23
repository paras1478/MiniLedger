// Due dates are calendar dates ("YYYY-MM-DD") with no time of day. They are stored in a DATE
// column and handled as UTC-midnight Date objects inside the server. "Today" is the current
// calendar date in APP_TIMEZONE.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Current calendar date in `timeZone`, e.g. "2026-10-23". */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

/** Parses "YYYY-MM-DD" into a UTC-midnight Date, or null if it is not a real calendar date. */
export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  // Rejects e.g. 2026-02-30, which Date would roll over to March.
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : null;
}

/** Formats a DATE-column value as "YYYY-MM-DD". */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"); positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateOnly(to)!.getTime() - parseDateOnly(from)!.getTime()) / DAY_MS);
}
