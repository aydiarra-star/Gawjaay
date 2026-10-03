import type { Tx } from '../lib/prisma.js';

export type PriceField = 'purchasePrice' | 'price';

interface PriceChangeInput {
  organizationId: string;
  productId: string;
  userId?: string | null;
  field: PriceField;
  oldValue: number | null;
  newValue: number;
}

/**
 * Enregistre un changement de prix dans l'historique (append-only).
 * Ne réécrit jamais les ventes déjà réalisées : celles-ci conservent leurs
 * propres instantanés (SaleItem.unitPrice / SaleItem.unitCost).
 */
export async function recordPriceChange(tx: Tx, input: PriceChangeInput): Promise<void> {
  if (input.oldValue === input.newValue) return;
  await tx.priceHistory.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      userId: input.userId ?? null,
      field: input.field,
      oldValue: input.oldValue,
      newValue: input.newValue,
    },
  });
}
