import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middlewares/errorHandler';

/**
 * Fabrique l'application Express (sans écouter).
 * Permet aux tests API E2E de monter un serveur éphémère sans toucher à V1.
 */
export function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'https://*.e2b.app'],
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
