import db, { cuid } from '../../lib/db';
import { withoutCostPrice } from '../../lib/publicPayload';
import { canViewInternalFields } from '../../middlewares/optionalAuth';
import { slugify } from '../../utils/slug';

function nowIso() { return new Date().toISOString(); }

export async function createStore(user: any, data: any) {
  if (!user) throw new Error('Non auth');
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
  const baseSlug = slugify(data.name);
  let slug = baseSlug;
  let i = 1;
  while (db.prepare('SELECT id FROM stores WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${i++}`;
  }
  const id = cuid();
  db.prepare(`INSERT INTO stores (id, merchantId, name, slug, description, category, phone, whatsapp, addressText, quartier, latitude, longitude, deliveryFees, allowPickup, allowDelivery, paymentMethods, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, merchantId, data.name, slug, data.description || null, data.category || null, data.phone || null, data.whatsapp || null,
      data.addressText || null, data.quartier || null, data.latitude || null, data.longitude || null,
      data.deliveryFees || 0, data.allowPickup ? 1 : 1, data.allowDelivery ? 1 : 1,
      JSON.stringify(['CASH','WAVE','ORANGE_MONEY']), nowIso(), nowIso()
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

export async function getStoreBySlug(slug: string, viewer?: any) {
  const store = db.prepare('SELECT * FROM stores WHERE slug = ?').get(slug) as any;
  if (!store) return null;
  const products = db.prepare('SELECT * FROM products WHERE storeId = ? AND isActive = 1 AND isOnline = 1 LIMIT 100').all(store.id) as any[];
  // SÉCURITÉ (audit pilote) : la vitrine est PUBLIQUE — `costPrice` (prix d'achat du marchand)
  // ne doit jamais sortir vers un anonyme. Le propriétaire (merchant/employé) et l'ADMIN le voient.
  const canSeeCost = canViewInternalFields(viewer, store.id);
  const safeProducts = canSeeCost ? products : withoutCostPrice(products);
  return { ...store, products: safeProducts };
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
  return store;
}

export async function updateStore(user: any, storeId: string, data: any) {
  await getStoreById(storeId, user);
  const fields: string[] = [];
  const values: any[] = [];
  const allowed = ['name','description','phone','whatsapp','addressText','quartier','physicalStatus','digitalStatus','deliveryFees','allowPickup','allowDelivery','openingHours'];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      let v = data[k];
      if (k === 'openingHours' && typeof v === 'object') v = JSON.stringify(v);
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
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(filters.take || 50);
  return db.prepare(sql).all(...params);
}
