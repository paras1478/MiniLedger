import type { Request, RequestHandler } from 'express';

import type { User } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

/**
 * Requires `Authorization: Bearer <jwt>`. Loads the user so a token for a deleted account
 * stops working immediately, and attaches it as `req.user`.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication required. Send "Authorization: Bearer <token>".');
  }

  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    throw new AppError(401, 'AUTH_HEADER_INVALID', 'Authorization header must be "Bearer <token>".');
  }

  const { userId } = await verifyAccessToken(token);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(401, 'USER_NOT_FOUND', 'The account for this token no longer exists.');
  }

  req.user = user;
  next();
};

/** The authenticated user; only valid in handlers behind `requireAuth`. */
export function getAuthUser(req: Request): User {
  if (!req.user) throw new Error('getAuthUser called without requireAuth');
  return req.user;
}
