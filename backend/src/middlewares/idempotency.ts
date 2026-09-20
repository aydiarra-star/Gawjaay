import { Request, Response, NextFunction } from 'express';
import db from '../lib/db';

function nowIso() { return new Date().toISOString(); }

/**
 * Idempotence des opérations financières (mission readiness §21).
 *
 * Header `Idempotency-Key` (optionnel) sur POST /orders et POST /sales/store/:id :
 * - 1re requête : exécution normale, la réponse (statut + corps) est journalisée ;
 * - requête rejouée avec la même clé (retry réseau, double-tap) : la MÊME réponse est
 *   renvoyée à l'identique — aucune seconde écriture (pas de double stock décrémenté) ;
 * - sans header : comportement strictement inchangé (rétrocompatible V1/V2).
 * Portée utilisateur : la clé est rejouée uniquement pour le MÊME utilisateur.
 */
export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key) return next();
  const endpoint = `${req.method} ${req.baseUrl}${req.route?.path || req.path}`;
  const userId = (req as any).user?.userId || '';

  const existing = db.prepare('SELECT status, responseJson FROM idempotency_keys WHERE key = ? AND endpoint = ? AND userId = ?').get(key, endpoint, userId) as any;
  if (existing) {
    res.status(existing.status).type('application/json').send(existing.responseJson);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    try {
      db.prepare('INSERT INTO idempotency_keys (key, endpoint, userId, status, responseJson, createdAt) VALUES (?,?,?,?,?,?)')
        .run(key, endpoint, userId, res.statusCode, JSON.stringify(body), nowIso());
    } catch { /* course : la clé existe déjà → la prochaine requête rejouera cette réponse */ }
    return originalJson(body);
  };
  next();
}
