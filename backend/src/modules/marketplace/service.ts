import db from '../../lib/db';

export async function searchProducts(query: string, filters: any) {
  let sql = `SELECT p.*, s.name as storeName, s.latitude, s.longitude, s.slug as storeSlug, i.quantity as stockQty
    FROM products p
    JOIN stores s ON s.id = p.storeId
    LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    WHERE p.isActive = 1 AND p.isOnline = 1 AND s.isActive = 1 AND s.digitalStatus = 'OPEN' AND i.quantity > 0`;
  const params: any[] = [];
  if (query) { sql += ' AND p.name LIKE ?'; params.push(`%${query}%`); }
  if (filters.category) { sql += ' AND p.categoryId = (SELECT id FROM categories WHERE slug = ?)'; params.push(filters.category); }
  sql += ' ORDER BY p.createdAt DESC LIMIT ?';
  params.push(filters.take || 50);
  const products = db.prepare(sql).all(...params) as any[];

  const enriched = products.map(p=>({
    id: p.id,
    name: p.name,
    price: p.price,
    description: p.description,
    storeId: p.storeId,
    store: { id: p.storeId, name: p.storeName, slug: p.storeSlug, latitude: p.latitude, longitude: p.longitude },
    inventories: [{ quantity: p.stockQty }],
    latitude: p.latitude,
    longitude: p.longitude,
  }));

  if (filters.lat && filters.lng) {
    const toRad = (x:number)=>x*Math.PI/180;
    const withDistance = enriched.map((p:any)=>{
      if (!p.store.latitude || !p.store.longitude) return { ...p, distance: Infinity };
      const dLat = toRad(p.store.latitude - filters.lat);
      const dLng = toRad(p.store.longitude - filters.lng);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(filters.lat))*Math.cos(toRad(p.store.latitude))*Math.sin(dLng/2)**2;
      const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = 6371*c;
      return { ...p, distance };
    }).filter((p:any)=> filters.radiusKm ? p.distance <= filters.radiusKm : true)
      .sort((a:any,b:any)=>a.distance-b.distance);
    return withDistance;
  }

  return enriched;
}

export async function searchStores(query: string, take=50) {
  let sql = 'SELECT * FROM stores WHERE isActive = 1 AND digitalStatus = ?';
  const params: any[] = ['OPEN'];
  if (query) { sql += ' AND name LIKE ?'; params.push(`%${query}%`); }
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(take);
  return db.prepare(sql).all(...params);
}

export async function nearbyStores(lat: number, lng: number, radiusKm=10) {
  const stores = db.prepare('SELECT * FROM stores WHERE isActive = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL').all() as any[];
  const toRad = (x:number)=>x*Math.PI/180;
  const withDist = stores.map(s=>{
    const dLat = toRad(s.latitude - lat);
    const dLng = toRad(s.longitude - lng);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat))*Math.cos(toRad(s.latitude))*Math.sin(dLng/2)**2;
    const c = 2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = 6371*c;
    return { ...s, distance };
  }).filter(s=>s.distance<=radiusKm).sort((a,b)=>a.distance-b.distance);
  return withDist;
}
