import { Router } from 'express';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, isManualSettlementMethod, type PaymentMethod } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';

const router = Router();

/**
 * Capacités de paiement réellement disponibles (cahier §17).
 *
 * - Espèces, Wave, Orange Money, Free Money, Wizall et crédit sont **encaissables
 *   dès maintenant** : le commerçant reçoit le paiement (mobile money sur son
 *   téléphone) puis l'enregistre ; GawJaay tient la caisse et la créance.
 * - Carte bancaire en ligne : nécessite un prestataire (PSP) qui n'est pas connecté
 *   dans ce dépôt — elle est donc exposée comme indisponible, et l'API ne prétend
 *   pas encaisser en ligne.
 */
router.get('/capabilities', asyncHandler(async (_req, res) => {
  const methods = PAYMENT_METHODS.map((method: PaymentMethod) => ({
    method,
    label: PAYMENT_METHOD_LABELS[method],
    available: isManualSettlementMethod(method),
    mode: isManualSettlementMethod(method) ? ('manual' as const) : ('online' as const),
    provider: null as string | null,
  }));
  res.json({
    onlinePaymentEnabled: false,
    mode: env.PAYMENTS_MODE,
    notice:
      'Espèces, Wave, Orange Money, Free Money, Wizall et crédit sont encaissables immédiatement ' +
      '(encaissement puis saisie dans GawJaay). Le paiement par carte en ligne nécessite un prestataire, non connecté.',
    methods,
  });
}));

/** Tentative de paiement par carte en ligne : refusée tant qu'aucun prestataire n'est configuré. */
router.post('/charge', asyncHandler(async () => {
  throw AppError.unavailable('Le paiement par carte en ligne n\'est pas connecté. Encaissez via Wave / Orange Money / Free Money / Wizall ou espèces, puis saisissez le règlement.');
}));

export default router;
