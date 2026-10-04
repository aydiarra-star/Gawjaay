import type { NextFunction, Request, Response } from 'express';

/**
 * Paramètres de requête sensibles : la position GPS de l'acheteur (proximité
 * marketplace) ne doit JAMAIS être conservée dans les journaux.
 */
const SENSITIVE_QUERY_PARAMS = ['lat', 'lng', 'lon', 'latitude', 'longitude'];

/** Retire les coordonnées GPS de l'URL avant journalisation (privacy). */
export function redactUrl(url: string): string {
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return url;
  const path = url.slice(0, qIndex);
  const params = new URLSearchParams(url.slice(qIndex + 1));
  let redacted = false;
  for (const key of SENSITIVE_QUERY_PARAMS) {
    if (params.has(key)) {
      params.set(key, '[redacted]');
      redacted = true;
    }
  }
  if (!redacted) return url;
  return `${path}?${params.toString()}`;
}

/**
 * Journalisation légère (sans dépendance externe) adaptée à un hébergeur qui
 * collecte stdout/stderr. N'expose JAMAIS de secret ni la position de l'acheteur :
 * on ne journalise que la méthode, le chemin (coordonnées redactées), le statut
 * et la durée.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${redactUrl(req.originalUrl)} ${res.statusCode} ${ms}ms`);
  });
  next();
}
