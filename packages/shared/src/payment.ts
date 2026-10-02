/** Statuts de paiement (cahier des charges §17). */
export const PAYMENT_STATUSES = ['PENDING', 'SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'En attente',
  SUCCESSFUL: 'Réussi',
  FAILED: 'Échoué',
  CANCELLED: 'Annulé',
  REFUNDED: 'Remboursé',
};

/**
 * Moyens de paiement pertinents pour le Sénégal.
 *
 * Tous ces moyens sont **encaissables dès maintenant** : le commerçant encaisse
 * (espèces, ou confirmation Wave / Orange Money / Free Money / Wizall reçue sur son
 * téléphone) puis l'enregistre dans GawJaay, qui tient la comptabilité et la créance.
 * `CARD` désigne une carte bancaire en ligne et nécessite un prestataire (PSP).
 */
export const PAYMENT_METHODS = ['CASH', 'WAVE', 'ORANGE_MONEY', 'FREE_MONEY', 'WIZALL', 'CARD', 'CREDIT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  FREE_MONEY: 'Free Money',
  WIZALL: 'Wizall Money',
  CARD: 'Carte bancaire (en ligne)',
  CREDIT: 'Crédit (à terme)',
};

/**
 * Moyens encaissables sans prestataire en ligne : le commerçant les encaisse
 * directement (mobile money reçu, espèces) et les enregistre comme règlement.
 */
export const MANUAL_SETTLEMENT_METHODS = ['CASH', 'WAVE', 'ORANGE_MONEY', 'FREE_MONEY', 'WIZALL', 'CREDIT'] as const;

export function isManualSettlementMethod(method: PaymentMethod): boolean {
  return (MANUAL_SETTLEMENT_METHODS as readonly string[]).includes(method);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value);
}
