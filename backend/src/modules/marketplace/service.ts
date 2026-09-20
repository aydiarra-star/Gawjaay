import db from '../../lib/db';
import { boundingBox, haversineKm, roundKm } from '../../lib/geo';
import { toPublicStore } from '../stores/service';

/**
 * Marketplace « Acheter près de moi » — le serveur reste l'unique source de vérité.
 *
 * Règles (cahier §17) :
 * - seuls les produits EN LIGNE (`isOnline=1 AND isActive=1`) de boutiques ACTIVES et OUVERTES
 *   numériquement sont visibles ; la disponibilité affichée est le stock réel (`inventories`) ;
 * - filtres : q (nom/description/code-barres/sku), catégorie (slug ou id), prix min/max, promo
 *   active, boutique (slug), zone (région/département/commune), tri, proximité (lat/lng/rayon) ;
 * - la distance est un calcul Haversine RÉEL sur les coordonnées déclarées (lib/geo.ts) ; une
 *   boutique sans coordonnées n'apparaît jamais dans une recherche géographique ;
 * - aucune donnée interne (costPrice, merchantId…) ne sort : projection explicite.
 */

const MAX_TAKE = 50; // PROJECT_RULES : pagination 50 max
const GEO_CANDIDATES = 500; // borne de sécurité du pré-filtre bounding box

export interface ProductSearchFilters {
  category?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  promo?: boolean | string;
  inStock?: boolean | string;
  store?: string;
  region?: string;
  department?: string;
  commune?: string;
  sort?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  take?: number;
}

export interface StoreSearchFilters {
  category?: string;
  region?: string;
  department?: string;
  commune?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  take?: number;
}

function clampTake(take: any, fallback = MAX_TAKE) {
  const n = Number(take);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_TAKE);
}

function isTrue(v: any) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function resolveGeo(f: { lat?: number; lng?: number; radiusKm?: number }): { lat: number; lng: number; radiusKm: number } | null {
  if (!Number.isFinite(f.lat as number) || !Number.isFinite(f.lng as number)) return null;
  const radiusKm = Number.isFinite(f.radiusKm as number) && (f.radiusKm as number) > 0 ? (f.radiusKm as number) : 10;
  return { lat: f.lat as number, lng: f.lng as number, radiusKm };
}

/** Ajoute les filtres de zone géographique déclarée (région / département / commune de la boutique). */
function pushZoneFilters(sql: string, params: any[], f: { region?: string; department?: string; commune?: string }, alias = 's') {
  if (f.region) { sql += ` AND ${alias}.regionId = ?`; params.push(f.region); }
  if (f.department) { sql += ` AND ${alias}.departmentId = ?`; params.push(f.department); }
  if (f.commune) { sql += ` AND ${alias}.communeId = ?`; params.push(f.commune); }
  return sql;
}

/** Pré-filtre SQL grossier (boîte englobante) : le calcul exact est fait ensuite en Haversine. */
function pushBoundingBox(sql: string, params: any[], lat: number, lng: number, radiusKm: number, alias = 's') {
  const box = boundingBox(lat, lng, radiusKm);
  sql += ` AND ${alias}.latitude IS NOT NULL AND ${alias}.longitude IS NOT NULL
    AND ${alias}.latitude BETWEEN ? AND ? AND ${alias}.longitude BETWEEN ? AND ?`;
  params.push(box.minLat, box.maxLat, box.minLng, box.maxLng);
  return sql;
}

function toPublicProductHit(p: any) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    description: p.description,
    sku: p.sku,
    barcode: p.barcode,
    unit: p.unit,
    images: p.images,
    category: p.categorySlug,
    categoryId: p.categoryId,
    categoryName: p.categoryName,
    storeId: p.storeId,
    store: {
      id: p.storeId,
      name: p.storeName,
      slug: p.storeSlug,
      category: p.storeCategory,
      quartier: p.storeQuartier,
      latitude: p.latitude,
      longitude: p.longitude,
    },
    inventories: [{ quantity: p.stockQty ?? 0 }],
    inStock: (p.stockQty ?? 0) > 0,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

export async function searchProducts(query: string, filters: ProductSearchFilters = {}) {
  const geo = resolveGeo(filters);
  const take = clampTake(filters.take);

  let sql = `SELECT p.*, s.name as storeName, s.latitude, s.longitude, s.slug as storeSlug,
    s.category as storeCategory, s.quartier as storeQuartier,
    i.quantity as stockQty, c.slug as categorySlug, c.name as categoryName
    FROM products p
    JOIN stores s ON s.id = p.storeId
    LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    LEFT JOIN categories c ON c.id = p.categoryId
    WHERE p.isActive = 1 AND p.isOnline = 1 AND s.isActive = 1 AND s.digitalStatus = 'OPEN'`;
  const params: any[] = [];

  // Disponibilité réelle : par défaut seuls les produits en stock sont proposés (cahier §17).
  if (filters.inStock === undefined || isTrue(filters.inStock)) sql += ' AND i.quantity > 0';

  if (query) {
    sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)`;
    const like = `%${query}%`;
    params.push(like, like, like, like);
  }
  if (filters.category) { sql += ' AND (c.slug = ? OR c.id = ?)'; params.push(filters.category, filters.category); }
  if (filters.minPrice !== undefined && filters.minPrice !== '') {
    const v = Number(filters.minPrice);
    if (Number.isFinite(v)) { sql += ' AND p.price >= ?'; params.push(v); }
  }
  if (filters.maxPrice !== undefined && filters.maxPrice !== '') {
    const v = Number(filters.maxPrice);
    if (Number.isFinite(v)) { sql += ' AND p.price <= ?'; params.push(v); }
  }
  if (filters.store) { sql += ' AND s.slug = ?'; params.push(filters.store); }
  sql = pushZoneFilters(sql, params, filters);
  if (isTrue(filters.promo)) {
    // dates comparées côté SQL avec des ISO passés en paramètre (jamais datetime('now') : formats mixtes)
    const nowIso = new Date().toISOString();
    sql += ` AND EXISTS (
      SELECT 1 FROM promotions pr
      WHERE pr.storeId = p.storeId AND pr.status = 'ACTIVE'
        AND pr.dateStart <= ? AND (pr.dateEnd IS NULL OR pr.dateEnd >= ?)
        AND (NOT EXISTS (SELECT 1 FROM promotion_products pp WHERE pp.promotionId = pr.id)
             OR EXISTS (SELECT 1 FROM promotion_products pp WHERE pp.promotionId = pr.id AND pp.productId = p.id))
    )`;
    params.push(nowIso, nowIso);
  }
  if (geo) sql = pushBoundingBox(sql, params, geo.lat, geo.lng, geo.radiusKm);

  switch (filters.sort) {
    case 'price_asc': sql += ' ORDER BY p.price ASC'; break;
    case 'price_desc': sql += ' ORDER BY p.price DESC'; break;
    case 'name': sql += ' ORDER BY p.name ASC'; break;
    default: sql += ' ORDER BY p.createdAt DESC';
  }
  sql += ' LIMIT ?';
  params.push(geo ? GEO_CANDIDATES : take);

  const rows = db.prepare(sql).all(...params) as any[];
  const enriched = rows.map(toPublicProductHit);

  if (!geo) return enriched;

  // Distance exacte (Haversine) sur les candidats de la boîte englobante, puis rayon + tri.
  return enriched
    .map((p) => ({ ...p, distance: roundKm(haversineKm(geo.lat, geo.lng, p.store.latitude, p.store.longitude)) }))
    .filter((p) => p.distance <= geo.radiusKm)
    .sort((a, b) => (filters.sort && filters.sort !== 'distance' ? 0 : a.distance - b.distance))
    .slice(0, take);
}

/**
 * Recherche de boutiques (publique). `filtersOrTake` accepte encore un simple `take` numérique
 * (compatibilité V1) ou un objet de filtres (catégorie, zone, proximité).
 */
export async function searchStores(query: string, filtersOrTake: number | StoreSearchFilters = {}) {
  const filters: StoreSearchFilters = typeof filtersOrTake === 'number' ? { take: filtersOrTake } : (filtersOrTake || {});
  const geo = resolveGeo(filters);
  const take = clampTake(filters.take);

  let sql = `SELECT s.*,
      (SELECT COUNT(*) FROM products p WHERE p.storeId = s.id AND p.isActive = 1 AND p.isOnline = 1) AS onlineProductCount
    FROM stores s WHERE s.isActive = 1 AND s.digitalStatus = ?`;
  const params: any[] = ['OPEN'];
  if (query) { sql += ' AND (s.name LIKE ? OR s.description LIKE ? OR s.quartier LIKE ?)'; params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
  if (filters.category) { sql += ' AND s.category = ?'; params.push(filters.category); }
  sql = pushZoneFilters(sql, params, filters);
  if (geo) sql = pushBoundingBox(sql, params, geo.lat, geo.lng, geo.radiusKm);
  sql += ' ORDER BY s.createdAt DESC LIMIT ?';
  params.push(geo ? GEO_CANDIDATES : take);

  const rows = db.prepare(sql).all(...params) as any[];
  const publicRows = rows.map((s) => ({ ...toPublicStore(s), onlineProductCount: Number(s.onlineProductCount || 0) }));
  if (!geo) return publicRows;
  return publicRows
    .map((s) => ({ ...s, distance: roundKm(haversineKm(geo.lat, geo.lng, s.latitude, s.longitude)) }))
    .filter((s) => s.distance <= geo.radiusKm)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, take);
}

/** Boutiques autour d'un point (Haversine réel, projection publique, triées par distance). */
export async function nearbyStores(lat: number, lng: number, radiusKm = 10, take = MAX_TAKE) {
  return searchStores('', { lat, lng, radiusKm, take });
}
