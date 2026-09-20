/**
 * Champs internes à ne JAMAIS exposer publiquement.
 *
 * `costPrice` = prix d'achat du marchand : c'est une donnée commerciale confidentielle
 * (elle révèle ses marges). Les vitrines publiques (boutique par slug, catalogue, fiche produit)
 * la retirent côté serveur ; le propriétaire (marchand/employé) et l'ADMIN la conservent.
 *
 * Règle unique et auditable : un seul endroit décide de ce qui sort publiquement.
 */
const INTERNAL_PRODUCT_FIELDS = ['costPrice'] as const;

export function withoutCostPrice<T extends Record<string, any>>(product: T): Omit<T, 'costPrice'>;
export function withoutCostPrice<T extends Record<string, any>>(products: T[]): Omit<T, 'costPrice'>[];
export function withoutCostPrice(input: any): any {
  if (Array.isArray(input)) return input.map((row) => withoutCostPrice(row));
  if (!input || typeof input !== 'object') return input;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    if ((INTERNAL_PRODUCT_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return out;
}
