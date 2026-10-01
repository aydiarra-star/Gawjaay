/**
 * Les 14 régions administratives du Sénégal (référentiel public, factuel).
 * Utilisé pour l'adresse d'entreprise/boutique et les filtres marketplace.
 */
export interface Region {
  code: string;
  name: string;
}

export const SENEGAL_REGIONS: Region[] = [
  { code: 'DK', name: 'Dakar' },
  { code: 'DB', name: 'Diourbel' },
  { code: 'FK', name: 'Fatick' },
  { code: 'KA', name: 'Kaolack' },
  { code: 'KF', name: 'Kaffrine' },
  { code: 'KE', name: 'Kédougou' },
  { code: 'KD', name: 'Kolda' },
  { code: 'LG', name: 'Louga' },
  { code: 'MT', name: 'Matam' },
  { code: 'SL', name: 'Saint-Louis' },
  { code: 'SE', name: 'Sédhiou' },
  { code: 'TC', name: 'Tambacounda' },
  { code: 'TH', name: 'Thiès' },
  { code: 'ZG', name: 'Ziguinchor' },
];

/** Retourne une région par son nom (insensible à la casse) ou undefined. */
export function findRegionByName(name: string): Region | undefined {
  const normalized = name.trim().toLowerCase();
  return SENEGAL_REGIONS.find((r) => r.name.toLowerCase() === normalized);
}
