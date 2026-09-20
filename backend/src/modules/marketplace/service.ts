import db from '../../lib/db';

/**
 * LOT C — Recherche avancée marketplace (le serveur reste source de vérité).
 * Filtres : q (nom/description/barcode/sku/référence), catégorie, prix min/max,
 * disponibilité (stock > 0), boutique ouverte, promotion active, tri.
 */

export async function searchProducts(query: string, filters: any) {
  let sql = `SELECT p.*, s.name as storeName, s.latitude, s.longitude, s.slug as storeSlug,
    i.quantity as stockQty, c.slug as categorySlug
    FROM products p
    JOIN stores s ON s.id = p.storeId
    LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    LEFT JOIN categories c ON c.id = p.categoryId
    WHERE p.isActive = 1 AND p.isOnline = 1 AND s.isActive = 1 AND s.digitalStatus = 'OPEN'`;
  const params: any[] = [];
  if (filters.inStock === undefined || filters.inStock === 'true' || filters.inStock === true) {
    sql += ' AND i.quantity > 0';
  }
  if (query) {
    sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)`;
    const like = `%${query}%`;
    params.push(like, like, like, like);
  }
  if (filters.category) { sql += ' AND c.slug = ?'; params.push(filters.category); }
  if (filters.minPrice !== undefined && filters.minPrice !== '') { sql += ' AND p.price >= ?'; params.push(Number(filters.minPrice)); }
  if (filters.maxPrice !== undefined && filters.maxPrice !== '') { sql += ' AND p.price <= ?'; params.push(Number(filters.maxPrice)); }
  if (filters.store) { sql += ' AND s.slug = ?'; params.push(filters.store); }
  if (filters.promo === 'true' || filters.promo === true) {
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
  switch (filters.sort) {
    case 'price_asc': sql += ' ORDER BY p.price ASC'; break;
    case 'price_desc': sql += ' ORDER BY p.price DESC'; break;
    case 'name': sql += ' ORDER BY p.name ASC'; break;
    default: sql += ' ORDER BY p.createdAt DESC';
  }
  sql += ' LIMIT ?';
  params.push(Math.min(filters.take || 50, 100));
  const products = db.prepare(sql).all(...params) as any[];

  const enriched = products.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    description: p.description,
    sku: p.sku,
    barcode: p.barcode,
    category: p.categorySlug,
    storeId: p.storeId,
    store: { id: p.storeId, name: p.storeName, slug: p.storeSlug, latitude: p.latitude, longitude: p.longitude },
    inventories: [{ quantity: p.stockQty }],
    latitude: p.latitude,
    longitude: p.longitude,
  }));

  if (filters.lat && filters.lng) {
    const toRad = (x: number) => x * Math.PI / 180;
    const withDistance = enriched.map((p: any) => {
      if (!p.store.latitude || !p.store.longitude) return { ...p, distance: Infinity };
      const dLat = toRad(p.store.latitude - filters.lat);
      const dLng = toRad(p.store.longitude - filters.lng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(filters.lat)) * Math.cos(toRad(p.store.latitude)) * Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = 6371 * c;
      return { ...p, distance };
    }).filter((p: any) => filters.radiusKm ? p.distance <= filters.radiusKm : true)
      .sort((a: any, b: any) => a.distance - b.distance);
    return withDistance;
  }

  return enriched;
}

export async function searchStores(query: string, take = 50) {
  let sql = 'SELECT * FROM stores WHERE isActive = 1 AND digitalStatus = ?';
  const params: any[] = ['OPEN'];
  if (query) { sql += ' AND name LIKE ?'; params.push(`%${query}%`); }
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(take);
  return db.prepare(sql).all(...params);
}

export async function nearbyStores(lat: number, lng: number, radiusKm = 10) {
  const stores = db.prepare('SELECT * FROM stores WHERE isActive = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL').all() as any[];
  const toRad = (x: number) => x * Math.PI / 180;
  const withDist = stores.map((s) => {
    const dLat = toRad(s.latitude - lat);
    const dLng = toRad(s.longitude - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(s.latitude)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = 6371 * c;
    return { ...s, distance };
  }).filter((s) => s.distance <= radiusKm).sort((a, b) => a.distance - b.distance);
  return withDist;
}
