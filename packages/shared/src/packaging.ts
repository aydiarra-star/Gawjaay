/**
 * Conditionnements et unités du commerce de proximité sénégalais.
 *
 * Un produit n'est pas seulement un nom : c'est aussi « comment il est vendu »
 * (un sac, un carton, un bidon…). Ces listes sont fermées et validées côté serveur
 * comme côté interface, afin de rester cohérentes partout (Gestion, Stock, POS, Boutique).
 */

export const PACKAGING_TYPES = [
  'unite',
  'piece',
  'sac',
  'carton',
  'paquet',
  'bouteille',
  'bidon',
  'boite',
  'sachet',
  'botte',
  'kilo',
  'gramme',
  'litre',
  'millilitre',
] as const;

export type PackagingType = (typeof PACKAGING_TYPES)[number];

/** Libellé singulier / pluriel affiché dans l'interface. */
export const PACKAGING_LABELS: Record<PackagingType, { singular: string; plural: string }> = {
  unite: { singular: 'unité', plural: 'unités' },
  piece: { singular: 'pièce', plural: 'pièces' },
  sac: { singular: 'sac', plural: 'sacs' },
  carton: { singular: 'carton', plural: 'cartons' },
  paquet: { singular: 'paquet', plural: 'paquets' },
  bouteille: { singular: 'bouteille', plural: 'bouteilles' },
  bidon: { singular: 'bidon', plural: 'bidons' },
  boite: { singular: 'boîte', plural: 'boîtes' },
  sachet: { singular: 'sachet', plural: 'sachets' },
  botte: { singular: 'botte', plural: 'bottes' },
  kilo: { singular: 'kilo', plural: 'kilos' },
  gramme: { singular: 'gramme', plural: 'grammes' },
  litre: { singular: 'litre', plural: 'litres' },
  millilitre: { singular: 'millilitre', plural: 'millilitres' },
};

export function isPackagingType(value: unknown): value is PackagingType {
  return typeof value === 'string' && (PACKAGING_TYPES as readonly string[]).includes(value);
}

/**
 * Conditionnements proposés en premier dans l'interface (les plus courants au
 * Sénégal). Les autres restent accessibles derrière « Autre unité ».
 */
export const COMMON_PACKAGING: PackagingType[] = [
  'unite',
  'piece',
  'sac',
  'carton',
  'paquet',
  'bouteille',
  'bidon',
  'boite',
  'sachet',
  'botte',
];

/** Formate une quantité avec son conditionnement : « 10 sacs », « 1 sac ». */
export function formatPackaging(quantity: number, packaging: string | null | undefined): string {
  const qty = Math.round(quantity);
  const key = isPackagingType(packaging) ? packaging : 'unite';
  const label = PACKAGING_LABELS[key];
  return `${qty} ${qty === 1 ? label.singular : label.plural}`;
}
