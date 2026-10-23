import { rateLimit } from 'express-rate-limit';

import { AppError } from '../lib/errors.js';

/**
 * Per-IP limits (in memory, so per server process). These complement the per-phone limits in the
 * auth service: they stop one client from cycling through many phone numbers.
 * If the API runs behind a reverse proxy, set `app.set('trust proxy', 1)` so req.ip is the client.
 */
function ipLimiter(windowMinutes: number, limit: number) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(
        new AppError(429, 'RATE_LIMITED', 'Too many requests from this device. Please try again later.')
      );
    },
  });
}

/** Created per app instance, so each instance (and each test server) has its own counters. */
export function createAuthLimiters() {
  return { sendOtp: ipLimiter(15, 20), verifyOtp: ipLimiter(15, 50) };
}
