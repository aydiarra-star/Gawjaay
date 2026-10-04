import type { Tx } from '../lib/prisma.js';

export type PriceField = 'purchasePrice' | 'price' | 'promoPrice';

interface PriceChangeInput {
  organizationId: string;
  productId: string;
  userId?: string | null;
  field: PriceField;
  oldValue: number | null;
  /** Nouvelle valeur ; `null` = suppression du prix (ex. retrait d'une promo). */
  newValue: number | null;
}

/**
 * Enregistre un changement de prix dans l'historique (append-only).
 * Ne réécrit jamais les ventes déjà réalisées : celles-ci conservent leurs
 * propres instantanés (SaleItem.unitPrice / SaleItem.unitCost).
 *
 * Un changement vers/depuis `null` (retrait d'un prix) est historisé : la ligne
 * existe, mais aucune valeur n'est inventée.
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
