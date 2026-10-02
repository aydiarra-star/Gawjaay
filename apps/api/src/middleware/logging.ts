import type { NextFunction, Request, Response } from 'express';

/**
 * Journalisation légère (sans dépendance externe) adaptée à un hébergeur qui
 * collecte stdout/stderr. N'expose JAMAIS de secret : on ne journalise que la
 * méthode, le chemin, le statut et la durée.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}
