import { ZodError } from 'zod';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { isProd } from '../config/env.js';

/** 404 par défaut pour toute route non trouvée. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
};

/**
 * Gestionnaire d'erreurs centralisé.
 * N'expose jamais de détails sensibles en production.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  // Erreurs Prisma connues
  const anyErr = err as { code?: string };
  if (anyErr?.code === 'P2002') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'Cette valeur existe déjà (contrainte d\'unicité).' } });
    return;
  }
  if (anyErr?.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ressource introuvable' } });
    return;
  }

  if (!isProd) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue',
      ...(isProd ? {} : { details: (err as Error)?.message }),
    },
  });
};
