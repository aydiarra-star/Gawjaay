import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { env } from '../config/env';

/**
 * Observabilité production (mission §12) :
 * - les erreurs 5xx sont envoyées à Sentry SI SENTRY_DSN est configuré (no-op sinon) ;
 * - les 4xx (validation, auth, tenant, permissions) ne sont PAS envoyées : bruit inutile,
 *   aucune donnée personnelle collectée (sendDefaultPii: false) ;
 * - les réponses d'erreur ne contiennent jamais de stack en production.
 *
 * V3 : les 4xx attendues sont journalisées sur UNE ligne (sans pile d'appels) — BACKLOG_V3 §7
 * « Journalisation » ; les 5xx conservent la pile complète. Les erreurs de validation (Zod ou
 * `lib/validate.ts`) renvoient un `details` structuré exploitable par le frontend.
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (err?.name === 'ZodError') {
    logExpected(req, 400, 'Validation échouée');
    return res.status(400).json({ error: 'Validation échouée', details: err.errors });
  }
  if (err?.type === 'entity.parse.failed') {
    logExpected(req, 400, 'JSON invalide');
    return res.status(400).json({ error: 'Corps de requête JSON invalide' });
  }
  if (err?.type === 'entity.too.large') {
    logExpected(req, 413, 'Corps trop volumineux');
    return res.status(413).json({ error: 'Corps de requête trop volumineux' });
  }
  const status = Number(err?.status) >= 400 && Number(err?.status) < 600 ? Number(err.status) : 500;
  // 501/503 EXPLICITES = indisponibilité fonctionnelle assumée (ex. fournisseur de paiement non
  // connecté, PAYMENTS_MODE=disabled) : ce n'est pas une panne interne → statut et message conservés,
  // pas de pile, pas de Sentry (vérifié en production : renvoyait un 500 « Erreur interne serveur »).
  if (status === 501 || status === 503) {
    logExpected(req, status, err?.message);
    return res.status(status).json({ error: err?.message || 'Service indisponible', code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'NOT_IMPLEMENTED' });
  }
  if (status >= 500) {
    console.error(err);
    if (env.SENTRY_DSN) Sentry.captureException(err);
    // jamais de message interne (SQL, chemins, pile) vers le client en production
    const message = env.NODE_ENV === 'production' ? 'Erreur interne serveur' : err?.message || 'Erreur interne serveur';
    return res.status(500).json({ error: message });
  }
  logExpected(req, status, err?.message);
  const body: any = { error: err?.message || 'Requête invalide' };
  if (err?.details) body.details = err.details;
  res.status(status).json(body);
}

function logExpected(req: Request, status: number, message?: string) {
  if (env.NODE_ENV === 'test') return;
  console.warn(`[http ${status}] ${req.method} ${req.originalUrl} — ${message || ''}`);
}
