/**
 * Profil vendeur Marketplace (audit M1 §4, M2 §6).
 *
 * `sellerType` est DÉCLARATIF : il décrit ce que le vendeur a choisi d'être.
 * Aucune vérification officielle n'existe dans ce dépôt ; aucun libellé
 * « vendeur vérifié » / « boutique certifiée » ne doit jamais être dérivé de
 * ces valeurs. La vérification réelle sera un processus séparé, plus tard.
 */
export const SELLER_TYPES = ['INDIVIDUAL', 'MERCHANT', 'BUSINESS'] as const;
export type SellerType = (typeof SELLER_TYPES)[number];

export const SELLER_TYPE_LABELS: Record<SellerType, string> = {
  INDIVIDUAL: 'Particulier',
  MERCHANT: 'Commerçant',
  BUSINESS: 'Entreprise',
};

/** ACTIVE = profil utilisable ; SUSPENDED = profil neutralisé (aucune publication). */
export const SELLER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export function isSellerType(value: unknown): value is SellerType {
  return typeof value === 'string' && (SELLER_TYPES as readonly string[]).includes(value);
}

export function isSellerStatus(value: unknown): value is SellerStatus {
  return typeof value === 'string' && (SELLER_STATUSES as readonly string[]).includes(value);
}

/**
 * Un vendeur MERCHANT/BUSINESS est rattaché à une Organization existante (la
 * Gestion reste sa source opérationnelle). Un INDIVIDUAL peut exister sans
 * Organization. Cette distinction pilote les règles de sécurité.
 */
export function requiresOrganization(sellerType: SellerType): boolean {
  return sellerType === 'MERCHANT' || sellerType === 'BUSINESS';
}
