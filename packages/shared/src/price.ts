/**
 * Coffre-fort de Confiance — résolution UNIQUE du prix applicable.
 *
 * Règle unique (cahier Marketplace §12, §24 ; audit M1 §7) :
 *   - Si la VARIANTE porte un prix propre (`variant.price != null`), ce prix est
 *     AUTORITAIRE. Le prix promo du produit ne s'y applique JAMAIS : une variante
 *     qui fixe son prix contourne volontairement la promo produit.
 *   - Sinon, le prix du PRODUIT s'applique, promo comprise : `promoPrice` s'il est
 *     défini, sinon `price`.
 *
 * Cette fonction est la SEULE source de résolution du prix commercial. POS, vente
 * rapide, commande en ligne, marketplace et vitrine DOIVENT l'utiliser, afin qu'un
 * même produit + variante produise toujours le même prix applicable.
 *
 * Elle est volontairement pure et sans dépendance : elle sera étendue plus tard
 * (ex. Offre Flash) sans toucher aux appelants.
 */

export type PriceSource = 'variant' | 'promo' | 'base';

export interface PriceResolution {
  /** Prix normal (sans promotion) : prix de variante sinon prix produit. */
  basePrice: number;
  /** Prix promotionnel actif, ou null. */
  promoPrice: number | null;
  /** Prix réellement applicable (entier FCFA). */
  effectivePrice: number;
  /** Origine du prix applicable. */
  source: PriceSource;
}

export interface PriceInput {
  /** Prix propre de la variante (null/undefined = non défini). */
  variantPrice?: number | null;
  /** Prix de vente normal du produit. */
  productPrice: number;
  /** Prix promotionnel du produit (null/undefined = aucun). */
  productPromoPrice?: number | null;
}

/** Un prix est exploitable s'il est fini et strictement positif. */
function isUsable(price: number | null | undefined): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

export function resolveUnitPrice(input: PriceInput): PriceResolution {
  const { variantPrice, productPrice, productPromoPrice } = input;

  // 1. Prix propre à la variante : autoritaire, hors promo produit.
  if (isUsable(variantPrice)) {
    return { basePrice: variantPrice, promoPrice: null, effectivePrice: variantPrice, source: 'variant' };
  }

  // 2. Prix produit, promo comprise. Une promo n'est retenue que si elle est
  //    strictement inférieure au prix normal (cohérent avec la validation serveur).
  const base = productPrice;
  const promo = isUsable(productPromoPrice) && isUsable(base) && productPromoPrice < base ? productPromoPrice : null;
  if (promo != null) {
    return { basePrice: base, promoPrice: promo, effectivePrice: promo, source: 'promo' };
  }

  return { basePrice: base, promoPrice: null, effectivePrice: base, source: 'base' };
}

/**
 * Prix normal affichable (prix barré) : non nul UNIQUEMENT lorsqu'une promotion
 * est réellement active et strictement inférieure. Sinon null — aucune fausse
 * promotion, aucun ancien prix inventé.
 */
export function displayedOriginalPrice(input: PriceInput): number | null {
  const { promoPrice, basePrice } = resolveUnitPrice(input);
  return promoPrice != null && basePrice > promoPrice ? basePrice : null;
}
