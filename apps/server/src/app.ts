import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config';
import { authenticate } from './api/middleware/auth';
import { errorHandler } from './api/middleware/errors';
import { adminRouter } from './api/routes/admin';
import { authRouter } from './api/routes/auth';
import { personalRouter } from './api/routes/personal';
import { repositoriesRouter } from './api/routes/repositories';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(authenticate);
  app.use(
    '/api/auth',
    rateLimit({ windowMs: 60_000, limit: 30, skip: () => config.isTest, standardHeaders: 'draft-8', legacyHeaders: false }),
    authRouter,
  );
  app.use('/api/admin', adminRouter);
  // Protects the shared GitHub quota from a single client.
  app.use(
    '/api/repositories',
    rateLimit({ windowMs: 60_000, limit: 60, skip: () => config.isTest, standardHeaders: 'draft-8', legacyHeaders: false }),
    repositoriesRouter,
  );

  app.use('/api', personalRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
  });
  app.use(errorHandler);
  return app;
}
