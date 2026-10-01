import type { MovementType } from '@gawjaay/shared';
import { movementSign } from '@gawjaay/shared';
import { AppError } from '../lib/errors.js';
import type { Tx } from '../lib/prisma.js';

interface StockChange {
  storeId: string;
  variantId: string;
  /** Quantité positive. Le signe est déterminé par `type`. */
  quantity: number;
  type: MovementType;
  userId?: string | null;
  reference?: string;
  note?: string;
  /**
   * Si true, refuse l'opération quand le stock deviendrait négatif.
   * Les ajustements d'inventaire peuvent autoriser le négatif via `allowNegative`.
   */
  allowNegative?: boolean;
}

/**
 * Applique un mouvement de stock de façon atomique et historisée (cahier §15, §36).
 * - met à jour `Inventory.quantity` ;
 * - crée une ligne `InventoryMovement` ;
 * - refuse le stock négatif sauf `allowNegative`.
 *
 * DOIT être appelée dans une transaction Prisma (`prisma.$transaction`).
 */
export async function applyStockChange(tx: Tx, change: StockChange): Promise<number> {
  const qty = Math.abs(Math.round(change.quantity));
  const signed = change.type === 'ADJUSTMENT' || change.type === 'COUNT'
    ? Math.round(change.quantity) // signe porté par la quantité
    : movementSign(change.type) * qty;

  const existing = await tx.inventory.findUnique({
    where: { storeId_variantId: { storeId: change.storeId, variantId: change.variantId } },
  });

  const current = existing?.quantity ?? 0;
  const next = current + signed;
  if (next < 0 && !change.allowNegative) {
    throw AppError.conflict('Stock insuffisant', { storeId: change.storeId, variantId: change.variantId, available: current, requested: qty });
  }

  if (existing) {
    await tx.inventory.update({ where: { id: existing.id }, data: { quantity: next } });
  } else {
    await tx.inventory.create({
      data: { storeId: change.storeId, variantId: change.variantId, quantity: next },
    });
  }

  await tx.inventoryMovement.create({
    data: {
      storeId: change.storeId,
      variantId: change.variantId,
      type: change.type,
      quantity: signed,
      userId: change.userId ?? null,
      reference: change.reference ?? null,
      note: change.note ?? null,
    },
  });

  return next;
}

/** Lit la quantité disponible pour une variante dans une boutique. */
export async function availableQuantity(tx: Tx, storeId: string, variantId: string): Promise<number> {
  const inv = await tx.inventory.findUnique({
    where: { storeId_variantId: { storeId, variantId } },
    select: { quantity: true },
  });
  return inv?.quantity ?? 0;
}
