import { ZodError, type ZodIssue } from 'zod';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { isProd } from '../config/env.js';

/**
 * Messages de repli par code d'erreur de validation. Les schémas portent leurs
 * propres messages métier (en français) ; ce repli évite qu'un message anglais
 * par défaut (ex. « Required ») parvienne à l'utilisateur.
 */
const FALLBACK_MESSAGES: Partial<Record<ZodIssue['code'], string>> = {
  invalid_type: 'Champ obligatoire manquant',
  too_small: 'Valeur trop courte',
  too_big: 'Valeur trop longue',
  invalid_string: 'Format invalide',
  invalid_enum_value: 'Valeur non autorisée',
  unrecognized_keys: 'Champ non reconnu',
  invalid_union: 'Valeur invalide',
  custom: 'Valeur invalide',
};

/** Messages génériques (anglais) produits par zod lorsqu'aucun message n'est fourni. */
const GENERIC_MESSAGE = /^(Required|Invalid|Expected|String must|Number must|Array must|Unrecognized key)/i;

function validationMessage(issue: ZodIssue): string {
  if (typeof issue.message === 'string' && issue.message && !GENERIC_MESSAGE.test(issue.message)) {
    return issue.message;
  }
  const label = issue.path.join('.');
  const fallback = FALLBACK_MESSAGES[issue.code] ?? 'Valeur invalide';
  return label ? `${fallback} (${label})` : fallback;
}

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
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: validationMessage(i) }));
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        // Message exploitable tel quel par l'utilisateur (« Le mot de passe doit
        // contenir au moins 8 caractères ») plutôt qu'un « Données invalides »
        // qui ne lui dit pas quoi corriger.
        message: details.length > 0 ? details.map((d) => d.message).join(' ') : 'Données invalides',
        details,
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

  // Journaux serveur : toujours exploitables (l'hébergeur collecte stdout/stderr),
  // jamais renvoyés au client en production.
  // eslint-disable-next-line no-console
  console.error('[error]', (err as Error)?.message, (err as Error)?.stack);

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Une erreur interne est survenue',
      ...(isProd ? {} : { details: (err as Error)?.message }),
    },
  });
};
