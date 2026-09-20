import db, { cuid } from '../../lib/db';

function nowIso() { return new Date().toISOString(); }

/** LOT C — Favoris produits / boutiques du client. */
export function add(user: any, targetType: 'PRODUCT' | 'STORE', targetId: string) {
  if (user.role !== 'CLIENT') throw Object.assign(new Error('Réservé aux clients'), { status: 403 });
  if (!['PRODUCT', 'STORE'].includes(targetType)) throw Object.assign(new Error('Type invalide'), { status: 400 });
  const exists = db.prepare('SELECT id FROM favorites WHERE userId = ? AND targetType = ? AND targetId = ?').get(user.userId, targetType, targetId);
  if (exists) return exists;
  const id = cuid();
  db.prepare('INSERT INTO favorites (id, userId, targetType, targetId, createdAt) VALUES (?,?,?,?,?)').run(id, user.userId, targetType, targetId, nowIso());
  return db.prepare('SELECT * FROM favorites WHERE id = ?').get(id);
}

export function remove(user: any, targetType: 'PRODUCT' | 'STORE', targetId: string) {
  db.prepare('DELETE FROM favorites WHERE userId = ? AND targetType = ? AND targetId = ?').run(user.userId, targetType, targetId);
  return { message: 'Favori supprimé' };
}

export function list(user: any, targetType?: 'PRODUCT' | 'STORE') {
  let sql = 'SELECT * FROM favorites WHERE userId = ?';
  const params: any[] = [user.userId];
  if (targetType) { sql += ' AND targetType = ?'; params.push(targetType); }
  sql += ' ORDER BY createdAt DESC';
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map((f) => {
    if (f.targetType === 'PRODUCT') {
      const p = db.prepare(`SELECT p.id, p.name, p.price, p.slug, s.name as storeName, s.slug as storeSlug,
        (SELECT COALESCE(SUM(quantity),0) FROM inventories WHERE productId = p.id) as stock
        FROM products p JOIN stores s ON s.id = p.storeId WHERE p.id = ?`).get(f.targetId) as any;
      return { ...f, product: p && p.name ? p : null };
    }
    const s = db.prepare('SELECT id, name, slug, category, digitalStatus FROM stores WHERE id = ?').get(f.targetId) as any;
    return { ...f, store: s && s.name ? s : null };
  });
}
