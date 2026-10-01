/**
 * Machine à états des commandes (cahier des charges §26).
 * Les transitions importantes sont historisées (table OrderEvent).
 */
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  RETURN_REQUESTED: 'Retour demandé',
  RETURNED: 'Retournée',
};

/** Statuts terminaux (aucune transition sortante). */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED', 'RETURNED'];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED'],
  RETURNED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Le stock est décrémenté à la confirmation ; il est restitué si la commande est annulée après confirmation. */
export function statusConsumesStock(status: OrderStatus): boolean {
  return status === 'CONFIRMED' || status === 'PREPARING' || status === 'READY' || status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED' || status === 'RETURN_REQUESTED' || status === 'RETURNED';
}

/** Statuts où une annulation cliente/marchand est autorisée. */
export function isCancellable(status: OrderStatus): boolean {
  return status === 'PENDING' || status === 'CONFIRMED' || status === 'PREPARING';
}
