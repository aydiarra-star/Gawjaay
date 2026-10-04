/**
 * Annonce Marketplace (audit M1 §5, M2 §7).
 *
 * Une annonce n'est JAMAIS un second produit, un second stock ni un second prix.
 *
 *  - Vendeur MERCHANT/BUSINESS : l'annonce RÉFÉRENCE un Product (et
 *    éventuellement une ProductVariant) existant. Le prix et la disponibilité
 *    proviennent des sources commerciales existantes (resolveUnitPrice + stock
 *    réel) ; les champs `price`/`quantity` de l'annonce restent nuls.
 *  - Vendeur INDIVIDUAL : l'annonce peut décrire un article hors catalogue ;
 *    `price` et `quantity` sont alors explicites et portés par l'annonce.
 */
export const LISTING_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const LISTING_CONDITIONS = ['NEW', 'USED'] as const;
export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const LISTING_CONDITION_LABELS: Record<ListingCondition, string> = {
  NEW: 'Neuf',
  USED: 'Occasion',
};

export const FULFILLMENT_MODES = ['PICKUP', 'DELIVERY', 'BOTH'] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export const FULFILLMENT_LABELS: Record<FulfillmentMode, string> = {
  PICKUP: 'Retrait',
  DELIVERY: 'Livraison',
  BOTH: 'Retrait ou livraison',
};

export function isListingStatus(value: unknown): value is ListingStatus {
  return typeof value === 'string' && (LISTING_STATUSES as readonly string[]).includes(value);
}

export function isListingCondition(value: unknown): value is ListingCondition {
  return typeof value === 'string' && (LISTING_CONDITIONS as readonly string[]).includes(value);
}

export function isFulfillmentMode(value: unknown): value is FulfillmentMode {
  return typeof value === 'string' && (FULFILLMENT_MODES as readonly string[]).includes(value);
}

/** Une annonce de commerçant doit référencer un produit réel du catalogue. */
export function listingRequiresProduct(isMerchantLike: boolean): boolean {
  return isMerchantLike;
}
