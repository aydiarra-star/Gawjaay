/**
 * Géolocalisation — calculs RÉELS (formule de Haversine), jamais de distance inventée.
 *
 * Utilisé par la marketplace (« Acheter près de moi ») et la vitrine : la distance renvoyée au
 * client est toujours calculée à partir des coordonnées GPS déclarées par la boutique et de la
 * position fournie par l'utilisateur. Si l'une des deux manque, aucune distance n'est produite.
 */

export const EARTH_RADIUS_KM = 6371;

/** Distance orthodromique en kilomètres entre deux points (lat/lng en degrés décimaux). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/** Arrondi lisible (2 décimales) sans altérer le calcul source. */
export function roundKm(km: number): number {
  return Math.round(km * 100) / 100;
}

/**
 * Boîte englobante (bounding box) autour d'un point : pré-filtre SQL grossier AVANT le calcul
 * Haversine exact, pour ne pas charger toutes les boutiques du pays en mémoire.
 */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32; // ≈ km par degré de latitude
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
  const dLng = radiusKm / (111.32 * cos);
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}

export interface GeoQuery { lat: number; lng: number; radiusKm: number }

/**
 * Lit et valide lat/lng/radiusKm depuis une query string.
 * - lat/lng absents → `null` (pas de filtre géographique) ;
 * - valeurs non numériques ou hors plage → erreur 400 (jamais de calcul sur des données fausses).
 */
export function parseGeoQuery(query: any, defaultRadiusKm = 10, maxRadiusKm = 100): GeoQuery | null {
  const rawLat = query?.lat;
  const rawLng = query?.lng;
  if ((rawLat === undefined || rawLat === '') && (rawLng === undefined || rawLng === '')) return null;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw Object.assign(new Error('Coordonnées invalides (lat ∈ [-90,90], lng ∈ [-180,180])'), { status: 400 });
  }
  let radiusKm = defaultRadiusKm;
  if (query?.radiusKm !== undefined && query.radiusKm !== '') {
    radiusKm = Number(query.radiusKm);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw Object.assign(new Error('radiusKm invalide'), { status: 400 });
    }
    radiusKm = Math.min(radiusKm, maxRadiusKm);
  }
  return { lat, lng, radiusKm };
}
