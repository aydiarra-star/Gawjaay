/**
 * Découverte publique (Marketplace M3) — helpers PURS partagés serveur/web.
 *
 * Règle GawJaay : « GawJaay donne l'information. L'acheteur décide. »
 * Aucun classement, aucun score, aucune note, aucun « meilleur vendeur ».
 *
 * Ce module ne contient que de la normalisation et du calcul géométrique. Il ne
 * connaît ni la base ni les routes, et n'expose jamais de coordonnée GPS.
 */

/** Rayons de proximité autorisés (km). Aucun autre rayon n'est accepté. */
export const DISCOVERY_RADII_KM = [1, 3, 5, 10, 25] as const;

/** Taille de page par défaut et maximale de la découverte publique. */
export const DISCOVERY_DEFAULT_PAGE_SIZE = 20;
export const DISCOVERY_MAX_PAGE_SIZE = 50;

/**
 * Normalise une chaîne pour la recherche : minuscules + suppression des accents.
 * Le stockage (`Product.searchName`) et la requête utilisent la MÊME fonction,
 * ce qui rend la recherche insensible à la casse ET aux accents, de façon
 * déterministe, sans extension PostgreSQL.
 *
 * NFD sépare les diacritiques combinants, que l'on retire ensuite (U+0300–U+036F).
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Normalise un terme de recherche saisi par l'utilisateur. Renvoie une chaîne
 * vide si le terme est vide/absent, ce qui désactive la recherche.
 */
export function normalizeSearchTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  return normalizeForSearch(value).slice(0, 80);
}

/** Chaîne de recherche d'un produit : nom + description + marque/format publics. */
export function buildProductSearchText(parts: Array<string | null | undefined>): string {
  return normalizeForSearch(parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' '));
}

/** Distance Haversine en km entre deux points (résultat non arrondi). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Arrondit une distance en km à 0,1 km près (affichage honnête). */
export function roundDistanceKm(km: number): number {
  return Math.round(km * 10) / 10;
}

/**
 * Bounding box approximative autour d'un point pour un rayon donné (km).
 * Sert de pré-filtre SQL bon marché AVANT le calcul Haversine exact, afin que la
 * proximité soit appliquée avant la pagination sans balayer toute la table.
 * `dlat`/`dlng` sont volontairement majorants (le cos est minoré), donc la boîte
 * contient toujours le disque : aucun point réel du rayon n'est exclu à tort.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} {
  const dLat = radiusKm / 111.32;
  // On prend le cosinus à la latitude la plus éloignée de l'équateur (cos le plus
  // petit) pour que la largeur en longitude soit majorante : la boîte contient
  // ainsi TOUJOURS le disque, aucun point réel du rayon n'est exclu à tort.
  const maxAbsLat = Math.min(89.9, Math.max(Math.abs(lat - dLat), Math.abs(lat + dLat)));
  const cosLat = Math.max(Math.cos((maxAbsLat * Math.PI) / 180), 0.01);
  const dLng = radiusKm / (111.32 * cosLat);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

/** Un rayon est exploitable uniquement s'il fait partie de la liste autorisée. */
export function isAllowedRadiusKm(value: unknown): value is number {
  return typeof value === 'number' && (DISCOVERY_RADII_KM as readonly number[]).includes(value);
}

/** Coordonnée GPS exploitable (finie et dans les bornes terrestres). */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
