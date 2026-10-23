import { decodeJwt, errors, jwtVerify, SignJWT } from 'jose';

import { env } from '../config/env.js';
import { AppError } from './errors.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ALGORITHM = 'HS256';
const ISSUER = 'miniledger-api';
const AUDIENCE = 'miniledger-app';

export async function signAccessToken(user: { id: string; phone: string }) {
  const token = await new SignJWT({ phone: user.phone })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);

  const { exp } = decodeJwt(token);
  return { token, expiresAt: new Date((exp ?? 0) * 1000) };
}

/** Returns the user id from a valid token, or throws a 401 AppError. */
export async function verifyAccessToken(token: string): Promise<{ userId: string }> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub) throw new Error('Token has no subject');
    return { userId: payload.sub };
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please log in again.');
    }
    throw new AppError(401, 'TOKEN_INVALID', 'The access token is invalid.');
  }
}
