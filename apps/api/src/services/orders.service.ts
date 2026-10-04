import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';
import { allowedTransitions, canTransition, isOrderStatus, statusConsumesStock, type OrderStatus } from '@gawjaay/shared';
import { applyStockChange } from './inventory.service.js';
import { effectiveUnitPrice, consumeFlashOffer } from './flash-offers.service.js';

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
  /**
   * Clé d'idempotence fournie par l'acheteur. Si une commande existe déjà pour
   * (storeId, clientRequestId), elle est renvoyée telle quelle au lieu d'en
   * créer une seconde : un double clic ou un retry réseau ne double jamais la
   * commande, et ne décrémente donc jamais le stock deux fois.
   */
  clientRequestId?: string | null;
}

/** Résumé renvoyé par la création d'une commande (identique en rejeu idempotent). */
interface OrderSummary {
  orderId: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  replayed?: boolean;
}

/**
 * Crée une commande en ligne (cahier §26). Les prix viennent du serveur.
 * Le stock n'est PAS décrémenté ici : il l'est à la confirmation (décrément
 * atomique conditionnel — voir applyStockChange). On vérifie toutefois la
 * disponibilité RÉELLE à la création, afin de refuser honnêtement une commande
 * dont le stock est déjà insuffisant, sans jamais réserver ni inventer.
 */
export async function createOrder(tx: Tx, input: CreateOrderInput) {
  if (input.items.length === 0) throw AppError.badRequest('La commande doit contenir au moins un article');

  const store = await tx.store.findUnique({ where: { id: input.storeId } });
  if (!store || !store.isActive) throw AppError.notFound('Boutique introuvable');

  // Idempotence : un rejeu avec la même clé renvoie la commande déjà créée.
  const clientRequestId = input.clientRequestId?.trim() || null;
  if (clientRequestId) {
    const existing = await tx.order.findFirst({ where: { storeId: input.storeId, clientRequestId } });
    if (existing) {
      return {
        orderId: existing.id,
        subtotal: existing.subtotal,
        deliveryFee: existing.deliveryFee,
        total: existing.total,
        replayed: true,
      } satisfies OrderSummary;
    }
  }

  const variantIds = input.items.map((i) => i.variantId);
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, product: { organizationId: store.organizationId, isActive: true }, isActive: true },
    include: { product: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  // Disponibilité réelle par variante dans la boutique (aucune valeur inventée).
  const inventories = await tx.inventory.findMany({
    where: { storeId: store.id, variantId: { in: variantIds } },
    select: { variantId: true, quantity: true },
  });
  const stockById = new Map(inventories.map((i) => [i.variantId, i.quantity]));

  let subtotal = 0;
  const lines = [] as Array<{ variantId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; flashOfferId: string | null }>;
  for (const item of input.items) {
    const variant = byId.get(item.variantId);
    if (!variant) throw AppError.badRequest(`Article indisponible: ${item.variantId}`);
    const quantity = Math.round(item.quantity);
    if (quantity <= 0) throw AppError.badRequest('Quantité invalide');
    const available = stockById.get(variant.id) ?? 0;
    if (available < quantity) {
      throw AppError.conflict('Stock insuffisant', { variantId: variant.id, available, requested: quantity });
    }
    const resolved = await effectiveUnitPrice(tx, input.storeId, variant);
    const unitPrice = resolved.price;
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    lines.push({ variantId: variant.id, name: variant.name, quantity, unitPrice, lineTotal, flashOfferId: resolved.flash?.id ?? null });
  }

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
      clientRequestId,
    },
  });

  for (const line of lines) {
    await tx.orderItem.create({ data: { orderId: order.id, ...line } });
  }
  await tx.orderEvent.create({ data: { orderId: order.id, toStatus: 'PENDING', note: 'Commande créée' } });

  return { orderId: order.id, subtotal, deliveryFee, total } satisfies OrderSummary;
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
    // Confirmation : revalide et consomme chaque Offre Flash avant de décrémenter le stock.
    for (const item of order.items) {
      if (item.flashOfferId) await consumeFlashOffer(tx, item.flashOfferId, item.quantity);
    }
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
