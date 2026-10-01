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

/** Moyens de paiement. CASH est le seul réellement encaissable sans prestataire externe. */
export const PAYMENT_METHODS = ['CASH', 'WAVE', 'ORANGE_MONEY', 'CARD', 'CREDIT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Espèces',
  WAVE: 'Wave',
  ORANGE_MONEY: 'Orange Money',
  CARD: 'Carte bancaire',
  CREDIT: 'Crédit (à terme)',
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value);
}
