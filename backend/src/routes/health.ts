import { Router } from 'express';

import { prisma } from '../lib/prisma.js';

export const healthRouter = Router();

// Liveness plus a database round-trip, so one request shows whether the API can reach PostgreSQL.
healthRouter.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
});
