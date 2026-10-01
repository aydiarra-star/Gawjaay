import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';
import { allowedTransitions, canTransition, isOrderStatus, statusConsumesStock, type OrderStatus } from '@gawjaay/shared';
import { applyStockChange } from './inventory.service.js';

export interface CreateOrderInput {
  storeId: string;
  customerUserId?: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  deliveryRegion?: string;
  note?: string;
  deliveryFee?: number;
  items: Array<{ variantId: string; quantity: number }>;
}

/**
 * Crée une commande en ligne (cahier §26). Les prix viennent du serveur.
 * Le stock n'est PAS décrémenté ici : il l'est à la confirmation.
 */
export async function createOrder(tx: Tx, input: CreateOrderInput) {
  if (input.items.length === 0) throw AppError.badRequest('La commande doit contenir au moins un article');

  const store = await tx.store.findUnique({ where: { id: input.storeId } });
  if (!store || !store.isActive) throw AppError.notFound('Boutique introuvable');

  const variantIds = input.items.map((i) => i.variantId);
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, product: { organizationId: store.organizationId, isActive: true } },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let subtotal = 0;
  const lines = input.items.map((item) => {
    const variant = byId.get(item.variantId);
    if (!variant) throw AppError.badRequest(`Article indisponible: ${item.variantId}`);
    const quantity = Math.round(item.quantity);
    if (quantity <= 0) throw AppError.badRequest('Quantité invalide');
    const unitPrice = variant.price ?? variant.product.promoPrice ?? variant.product.price;
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    return { variantId: variant.id, name: variant.name, quantity, unitPrice, lineTotal };
  });

  const deliveryFee = Math.max(0, Math.round(input.deliveryFee ?? 0));
  const total = subtotal + deliveryFee;

  // Rattache le profil client de l'organisation si l'utilisateur en ligne existe.
  let customerId: string | null = null;
  if (input.customerUserId) {
    const profile = await tx.customer.findUnique({ where: { userId: input.customerUserId } });
    if (profile && profile.organizationId === store.organizationId) customerId = profile.id;
  }

  const order = await tx.order.create({
    data: {
      organizationId: store.organizationId,
      storeId: store.id,
      customerId,
      customerUserId: input.customerUserId ?? null,
      channel: 'ONLINE',
      status: 'PENDING',
      subtotal,
      deliveryFee,
      total,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryRegion: input.deliveryRegion ?? null,
      note: input.note ?? null,
    },
  });

  for (const line of lines) {
    await tx.orderItem.create({ data: { orderId: order.id, ...line } });
  }
  await tx.orderEvent.create({ data: { orderId: order.id, toStatus: 'PENDING', note: 'Commande créée' } });

  return { orderId: order.id, subtotal, deliveryFee, total };
}

/**
 * Applique une transition de statut (cahier §26, §36) :
 * - valide la transition via la machine à états ;
 * - gère l'effet sur le stock (décrement à la confirmation, restitution si annulation/retour après consommation) ;
 * - historise l'événement.
 */
export async function transitionOrder(
  tx: Tx,
  orgId: string,
  orderId: string,
  to: OrderStatus,
  userId: string | null,
  note?: string,
) {
  if (!isOrderStatus(to)) throw AppError.badRequest('Statut invalide');

  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId: orgId },
    include: { items: true },
  });
  if (!order) throw AppError.notFound('Commande introuvable');

  const from = order.status as OrderStatus;
  if (from === to) throw AppError.badRequest('Statut identique');
  if (!canTransition(from, to)) {
    throw AppError.conflict(`Transition interdite: ${from} → ${to}`, { allowed: allowedTransitions(from) });
  }

  const consumed = statusConsumesStock(from);
  const willConsume = statusConsumesStock(to);

  if (!consumed && willConsume) {
    // Confirmation : décrémente le stock pour chaque ligne.
    for (const item of order.items) {
      await applyStockChange(tx, {
        storeId: order.storeId,
        variantId: item.variantId,
        quantity: item.quantity,
        type: 'ONLINE_ORDER',
        userId,
        reference: order.id,
      });
    }
  } else if (consumed && (to === 'CANCELLED' || to === 'RETURNED')) {
    // Restitution du stock.
    for (const item of order.items) {
      await applyStockChange(tx, {
        storeId: order.storeId,
        variantId: item.variantId,
        quantity: item.quantity,
        type: 'RETURN',
        userId,
        reference: order.id,
      });
    }
  }

  await tx.order.update({ where: { id: order.id }, data: { status: to } });
  await tx.orderEvent.create({
    data: { orderId: order.id, fromStatus: from, toStatus: to, userId, note: note ?? null },
  });

  return { orderId: order.id, from, to };
}
