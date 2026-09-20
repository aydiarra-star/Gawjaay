import db, { cuid } from '../../lib/db';
import { withoutCostPrice } from '../../lib/publicPayload';
import { canViewInternalFields } from '../../middlewares/optionalAuth';
import { slugify } from '../../utils/slug';
import { parseOrThrow } from '../../lib/validate';
import { storeCreateSchema, storeUpdateSchema } from '../../utils/validators';

function nowIso() { return new Date().toISOString(); }

/**
 * Cohérence géographique (cahier §7/§29) : une commune doit appartenir au département indiqué,
 * lui-même à la région indiquée. Les identifiants inconnus sont refusés (400), jamais devinés.
 */
function assertGeoConsistency(data: any) {
  if (data.regionId) {
    const r = db.prepare('SELECT id FROM regions WHERE id = ?').get(data.regionId);
    if (!r) throw Object.assign(new Error('Région inconnue'), { status: 400 });
  }
  if (data.departmentId) {
    const d = db.prepare('SELECT id, regionId FROM departments WHERE id = ?').get(data.departmentId) as any;
    if (!d) throw Object.assign(new Error('Département inconnu'), { status: 400 });
    if (data.regionId && d.regionId !== data.regionId) throw Object.assign(new Error('Le département n appartient pas à cette région'), { status: 400 });
  }
  if (data.communeId) {
    const c = db.prepare('SELECT id, departmentId FROM communes WHERE id = ?').get(data.communeId) as any;
    if (!c) throw Object.assign(new Error('Commune inconnue'), { status: 400 });
    if (data.departmentId && c.departmentId !== data.departmentId) throw Object.assign(new Error('La commune n appartient pas à ce département'), { status: 400 });
  }
}

export async function createStore(user: any, rawData: any) {
  if (!user) throw Object.assign(new Error('Non authentifié'), { status: 401 });
  const data = parseOrThrow(storeCreateSchema, rawData);
  let merchantId = user.merchantId;
  if (!merchantId) {
    if (user.role === 'MERCHANT') {
      const existing = db.prepare('SELECT id FROM merchants WHERE userId = ?').get(user.userId) as any;
      if (existing) merchantId = existing.id;
      else {
        merchantId = cuid();
        db.prepare('INSERT INTO merchants (id, userId, createdAt, updatedAt) VALUES (?,?,?,?)').run(merchantId, user.userId, nowIso(), nowIso());
      }
    } else throw Object.assign(new Error('Seul un commerçant peut créer une boutique'), { status: 403 });
  }
  assertGeoConsistency(data);
  const baseSlug = slugify(data.name) || 'boutique';
  let slug = baseSlug;
  let i = 1;
  while (db.prepare('SELECT id FROM stores WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${i++}`;
  }
  const id = cuid();
  const openingHours = data.openingHours === undefined ? null : (typeof data.openingHours === 'string' ? data.openingHours : JSON.stringify(data.openingHours));
  const deliveryZones = data.deliveryZones === undefined ? null : (typeof data.deliveryZones === 'string' ? data.deliveryZones : JSON.stringify(data.deliveryZones));
  db.prepare(`INSERT INTO stores (id, merchantId, name, slug, description, logoUrl, category, phone, whatsapp, email, addressText, regionId, departmentId, communeId, quartier, latitude, longitude,
      deliveryFees, deliveryDelayMinutes, deliveryZones, allowPickup, allowDelivery, paymentMethods, openingHours, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, merchantId, data.name, slug, data.description ?? null, data.logoUrl ?? null, data.category ?? null, data.phone ?? null, data.whatsapp ?? null, data.email ?? null,
      data.addressText ?? null, data.regionId ?? null, data.departmentId ?? null, data.communeId ?? null, data.quartier ?? null, data.latitude ?? null, data.longitude ?? null,
      data.deliveryFees ?? 0, data.deliveryDelayMinutes ?? 60, deliveryZones,
      data.allowPickup === false ? 0 : 1, data.allowDelivery === false ? 0 : 1,
      JSON.stringify(['CASH','WAVE','ORANGE_MONEY']), openingHours, nowIso(), nowIso()
  );
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)').run(cuid(), user.userId, 'STORE_CREATE', 'Store', id, nowIso());
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
}

export async function listMyStores(user: any) {
  if (!user) return [];
  if (user.role === 'ADMIN') return db.prepare('SELECT * FROM stores LIMIT 100').all();
  if (user.role === 'MERCHANT' && user.merchantId) {
    return db.prepare('SELECT * FROM stores WHERE merchantId = ?').all(user.merchantId);
  }
  if (user.role === 'EMPLOYEE') {
    if (!user.storeIds?.length) return [];
    const placeholders = user.storeIds.map(()=>'?').join(',');
    return db.prepare(`SELECT * FROM stores WHERE id IN (${placeholders})`).all(...user.storeIds);
  }
  return [];
}

/** Colonnes publiques d'une boutique (vitrine, marketplace) — aucune donnée interne. */
export const PUBLIC_STORE_COLUMNS = [
  'id','name','slug','description','logoUrl','category','phone','whatsapp','email','addressText',
  'regionId','departmentId','communeId','quartier','latitude','longitude','physicalStatus','digitalStatus',
  'deliveryFees','deliveryDelayMinutes','deliveryZones','allowPickup','allowDelivery','paymentMethods',
  'openingHours','isVerified','loyaltyEnabled','createdAt',
] as const;

export function toPublicStore(store: any) {
  if (!store) return store;
  const out: any = {};
  for (const k of PUBLIC_STORE_COLUMNS) if (k in store) out[k] = store[k];
  return out;
}

export async function getStoreBySlug(slug: string, viewer?: any) {
  const store = db.prepare('SELECT * FROM stores WHERE slug = ?').get(slug) as any;
  if (!store) return null;
  const products = db.prepare(`SELECT p.*, i.quantity AS stockQty, c.name AS categoryName, c.slug AS categorySlug
    FROM products p
    LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    LEFT JOIN categories c ON c.id = p.categoryId
    WHERE p.storeId = ? AND p.isActive = 1 AND p.isOnline = 1 ORDER BY p.name ASC LIMIT 200`).all(store.id) as any[];
  // SÉCURITÉ (audit pilote) : la vitrine est PUBLIQUE — `costPrice` (prix d'achat du marchand)
  // ne doit jamais sortir vers un anonyme. Le propriétaire (merchant/employé) et l'ADMIN le voient.
  const canSeeCost = canViewInternalFields(viewer, store.id);
  const withAvailability = products.map((p) => ({ ...p, inStock: (p.stockQty || 0) > 0, inventories: [{ quantity: p.stockQty || 0 }] }));
  const safeProducts = canSeeCost ? withAvailability : withoutCostPrice(withAvailability);
  const base = canSeeCost ? store : toPublicStore(store);
  // Catégories réellement présentes dans le catalogue en ligne (jamais inventées)
  const categories = db.prepare(`SELECT DISTINCT c.id, c.name, c.slug FROM products p JOIN categories c ON c.id = p.categoryId
    WHERE p.storeId = ? AND p.isActive = 1 AND p.isOnline = 1 ORDER BY c.name`).all(store.id);
  return { ...base, products: safeProducts, categories };
}

export async function getStoreById(id: string, user?: any) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id) as any;
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });
  if (user && ['MERCHANT','EMPLOYEE'].includes(user.role)) {
    if (user.role === 'MERCHANT' && store.merchantId !== user.merchantId && user.role !== 'ADMIN') {
      // check if employee store?
      if (!user.storeIds?.includes(id)) throw Object.assign(new Error('Accès refusé à cette boutique'), { status: 403 });
    }
    if (user.role === 'EMPLOYEE' && !user.storeIds?.includes(id)) throw Object.assign(new Error('Accès refusé'), { status: 403 });
  }
  // Un CLIENT (ou un anonyme) ne reçoit que la projection publique.
  if (!user || user.role === 'CLIENT') return toPublicStore(store);
  return store;
}

export async function updateStore(user: any, storeId: string, rawData: any) {
  await getStoreById(storeId, user);
  const data = parseOrThrow(storeUpdateSchema, rawData);
  assertGeoConsistency(data);
  const fields: string[] = [];
  const values: any[] = [];
  const allowed = ['name','description','logoUrl','category','phone','whatsapp','email','addressText','regionId','departmentId','communeId','quartier',
    'latitude','longitude','physicalStatus','digitalStatus','deliveryFees','deliveryDelayMinutes','deliveryZones','allowPickup','allowDelivery','paymentMethods','openingHours'];
  for (const k of allowed) {
    if ((data as any)[k] !== undefined) {
      fields.push(`${k} = ?`);
      let v: any = (data as any)[k];
      if ((k === 'openingHours' || k === 'deliveryZones' || k === 'paymentMethods') && v !== null && typeof v === 'object') v = JSON.stringify(v);
      if (k === 'allowPickup' || k === 'allowDelivery') v = v ? 1 : 0;
      values.push(v);
    }
  }
  if (fields.length) {
    fields.push('updatedAt = ?');
    values.push(nowIso());
    values.push(storeId);
    db.prepare(`UPDATE stores SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user?.userId, 'STORE_UPDATE', 'Store', storeId, JSON.stringify(data), nowIso());
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
}

export async function publicList(filters: { search?: string; region?: string; category?: string; take?: number }) {
  let sql = 'SELECT * FROM stores WHERE isActive = 1 AND digitalStatus = ?';
  const params: any[] = ['OPEN'];
  if (filters.search) { sql += ' AND name LIKE ?'; params.push(`%${filters.search}%`); }
  if (filters.category) { sql += ' AND category = ?'; params.push(filters.category); }
  if (filters.region) { sql += ' AND regionId = ?'; params.push(filters.region); }
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(Math.min(Math.max(filters.take || 50, 1), 100));
  return (db.prepare(sql).all(...params) as any[]).map(toPublicStore);
}
