import { Router } from 'express';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

const router = Router();

/**
 * Capacités de paiement réellement disponibles (cahier §17).
 * Aucun prestataire (Wave / Orange Money / carte) n'est connecté dans ce dépôt :
 * ces moyens sont donc exposés comme INDISPONIBLES, et l'interface ne doit afficher
 * aucun bouton de paiement en ligne.
 */
router.get('/capabilities', asyncHandler(async (_req, res) => {
  const methods = PAYMENT_METHODS.map((method: PaymentMethod) => ({
    method,
    label: PAYMENT_METHOD_LABELS[method],
    // CASH et CREDIT sont gérés en interne (encaissement manuel / vente à crédit).
    available: method === 'CASH' || method === 'CREDIT',
    provider: null as string | null,
  }));
  res.json({
    onlinePaymentEnabled: false,
    mode: env.PAYMENTS_MODE,
    methods,
  });
}));

/** Tentative de paiement en ligne : refusée tant qu'aucun prestataire n'est configuré. */
router.post('/charge', asyncHandler(async () => {
  throw AppError.unavailable('Aucun prestataire de paiement en ligne n\'est connecté.');
}));

export default router;
