import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';

// Observabilité production : Sentry UNIQUEMENT si SENTRY_DSN est défini (no-op sinon).
// Aucune donnée personnelle superflue : erreurs serveur seulement (5xx), pas de tracing req/res.
import * as Sentry from '@sentry/node';
if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, sendDefaultPii: false });
}
import { bootstrap } from './lib/bootstrap';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';

/**
 * Fabrique l'application Express (sans écouter).
 * Permet aux tests API E2E de monter un serveur éphémère sans toucher à V1.
 * Applique le schéma V1 (initDb) puis les migrations versionnées V2 (idempotent).
 */
export function buildApp() {
  bootstrap();

  const app = express();

  // CORS : FRONTEND_URL toujours autorisé ; localhost/e2b uniquement hors production.
  const corsOrigins: any = [env.FRONTEND_URL];
  if (env.NODE_ENV !== 'production') {
    corsOrigins.push('http://localhost:5173', 'https://*.e2b.app');
  }
  app.use(helmet());
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const globalLimiter = rateLimit({ windowMs: 60*1000, max: 500, message: { error: 'Trop de requêtes' } });
  app.use('/api/', globalLimiter);

  app.use('/api/v1', routes);

  app.get('/', (req, res) => {
    res.json({ message: 'GawJaay API - Vendre vite. Gérer mieux.', docs: '/api/v1/health' });
  });

  app.use(errorHandler);
  return app;
}
