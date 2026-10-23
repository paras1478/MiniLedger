import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { createAuthRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { loansRouter } from './routes/loans.js';

export function createApp() {
  const app = express();

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : undefined));
  app.use(express.json({ limit: '10kb' }));

  app.use('/health', healthRouter);
  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/loans', loansRouter);
  app.use('/api/v1/dashboard', dashboardRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
