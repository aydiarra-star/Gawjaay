import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { env } from '../config/env';

/**
 * Observabilité production (mission §12) :
 * - les erreurs 5xx sont envoyées à Sentry SI SENTRY_DSN est configuré (no-op sinon) ;
 * - les 4xx (validation, auth, tenant, permissions) ne sont PAS envoyées : bruit inutile,
 *   aucune donnée personnelle collectée (sendDefaultPii: false) ;
 * - les réponses d'erreur ne contiennent jamais de stack en production.
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  console.error(err);
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation échouée', details: err.errors });
  }
  const status = err.status || 500;
  if (status >= 500 && env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  res.status(status).json({ error: err.message || 'Erreur interne serveur' });
}
