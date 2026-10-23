import type { User } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the requireAuth middleware. */
      user?: User;
    }
  }
}

export {};
