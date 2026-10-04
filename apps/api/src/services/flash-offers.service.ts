import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';
import { resolveUnitPrice } from '@gawjaay/shared';

export type FlashStatus = 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'DISABLED';

function isActiveAt(offer: { status: string; endsAt: Date | null; quantityLimit: number | null; quantitySold: number }, now = new Date()) {
  if (offer.status !== 'ACTIVE') return false;
  if (offer.endsAt && offer.endsAt.getTime() <= now.getTime()) return false;
  if (offer.quantityLimit != null && offer.quantitySold >= offer.quantityLimit) return false;
  return true;
}

export function flashRemaining(offer: { quantityLimit: number | null; quantitySold: number }, realStock: number | null) {
  const limited = offer.quantityLimit == null ? null : Math.max(0, offer.quantityLimit - offer.quantitySold);
  if (realStock == null) return limited;
  return limited == null ? Math.max(0, realStock) : Math.min(Math.max(0, realStock), limited);
}

export async function getActiveFlashOffer(
  tx: Tx,
  storeId: string,
  variantId: string,
  now = new Date(),
) {
  const offers = await tx.flashOffer.findMany({
    where: { storeId, variantId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const offer of offers) {
    if (isActiveAt(offer, now)) return offer;
    const nextStatus: FlashStatus = offer.quantityLimit != null && offer.quantitySold >= offer.quantityLimit ? 'EXHAUSTED' : 'EXPIRED';
    await tx.flashOffer.update({ where: { id: offer.id }, data: { status: nextStatus } });
  }
  return null;
}

export async function effectiveUnitPrice(
  tx: Tx,
  storeId: string,
  variant: { id: string; price: number | null; product: { price: number; promoPrice: number | null } },
  now = new Date(),
) {
  const normal = resolveUnitPrice({
    variantPrice: variant.price,
    productPrice: variant.product.price,
    productPromoPrice: variant.product.promoPrice,
  }).effectivePrice;
  const flash = await getActiveFlashOffer(tx, storeId, variant.id, now);
  if (!flash || flash.flashPrice >= normal) return { price: normal, flash: null };
  return { price: flash.flashPrice, flash };
}

/** Consommation optimiste et portable : aucune transaction concurrente ne peut dépasser la limite. */
export async function consumeFlashOffer(
  tx: Tx,
  offerId: string,
  quantity: number,
) {
  if (quantity <= 0) throw AppError.badRequest('Quantité Flash invalide');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offer = await tx.flashOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.status !== 'ACTIVE' || (offer.endsAt && offer.endsAt.getTime() <= Date.now())) {
      throw AppError.conflict('Offre Flash indisponible. Actualisez le panier.');
    }
    if (offer.quantityLimit != null && offer.quantitySold + quantity > offer.quantityLimit) {
      throw AppError.conflict('Quantité Flash restante insuffisante. Actualisez le panier.', {
        available: Math.max(0, offer.quantityLimit - offer.quantitySold),
      });
    }
    const updated = await tx.flashOffer.updateMany({
      where: {
        id: offer.id,
        status: 'ACTIVE',
        quantitySold: offer.quantitySold,
        ...(offer.endsAt ? { endsAt: { gt: new Date() } } : {}),
      },
      data: { quantitySold: { increment: quantity } },
    });
    if (updated.count === 1) {
      if (offer.quantityLimit != null && offer.quantitySold + quantity >= offer.quantityLimit) {
        await tx.flashOffer.update({ where: { id: offer.id }, data: { status: 'EXHAUSTED' } });
      }
      return;
    }
  }
  throw AppError.conflict('Offre Flash momentanément indisponible. Réessayez.');
}

export async function createFlashOffer(
  tx: Tx,
  orgId: string,
  input: { storeId: string; variantId: string; flashPrice: number; quantityLimit?: number | null; endsAt?: Date | null },
) {
  if (input.flashPrice <= 0) throw AppError.badRequest('Le prix Flash doit être supérieur à zéro.');
  if (input.quantityLimit == null && !input.endsAt) {
    throw AppError.badRequest('Une Offre Flash doit avoir une date de fin ou une quantité limitée.');
  }
  if (input.quantityLimit != null && input.quantityLimit <= 0) {
    throw AppError.badRequest('La quantité Flash doit être supérieure à zéro.');
  }
  if (input.endsAt && input.endsAt.getTime() <= Date.now()) {
    throw AppError.badRequest('La date de fin doit être dans le futur.');
  }

  const variant = await tx.productVariant.findFirst({
    where: { id: input.variantId, isActive: true, product: { organizationId: orgId, isActive: true } },
    include: { product: true, inventories: { where: { storeId: input.storeId } } },
  });
  if (!variant) throw AppError.notFound('Variante introuvable.');
  const inventory = variant.inventories[0];
  if (!inventory) throw AppError.badRequest('Aucun stock réel associé à cette boutique.');
  const normal = resolveUnitPrice({
    variantPrice: variant.price,
    productPrice: variant.product.price,
    productPromoPrice: variant.product.promoPrice,
  }).effectivePrice;
  if (normal <= 0 || input.flashPrice >= normal) {
    throw AppError.badRequest('Le prix Flash doit être strictement inférieur au prix de vente réel.');
  }

  const existing = await getActiveFlashOffer(tx, input.storeId, input.variantId);
  if (existing) throw AppError.conflict('Une Offre Flash est déjà active pour cette variante dans cette boutique.');

  return tx.flashOffer.create({
    data: {
      organizationId: orgId,
      storeId: input.storeId,
      variantId: input.variantId,
      flashPrice: input.flashPrice,
      quantityLimit: input.quantityLimit ?? null,
      endsAt: input.endsAt ?? null,
      status: 'ACTIVE',
    },
  });
}
