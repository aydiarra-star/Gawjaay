import db, { cuid } from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT B — Codes-barres.
 * Unicité par boutique (index unique migration 002).
 * Scan → produit + stock réel. Utilisé par : vente rapide, entrée stock, inventaire.
 */

export function findByBarcode(storeId: string | null, code: string, user: any) {
  const norm = String(code || '').trim();
  if (!norm) throw Object.assign(new Error('Code vide'), { status: 400 });
  let sql = `SELECT p.*, i.quantity as stockQty FROM products p
    LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    WHERE p.isActive = 1 AND (p.barcode = ? OR p.sku = ?)`;
  const params: any[] = [norm, norm];
  if (storeId) {
    sql += ' AND p.storeId = ?';
    params.push(storeId);
  }
  const rows = db.prepare(sql).all(...params) as any[];
  if (!rows.length) return null;
  if (storeId) {
    assertStoreAccess(storeId, user);
    return rows[0];
  }
  // sans boutique : infos publiques multi-boutiques (recherche marketplace)
  return rows.map((r) => ({
    id: r.id, storeId: r.storeId, name: r.name, price: r.price, sku: r.sku,
    barcode: r.barcode, stockQty: r.stockQty, storeName: (db.prepare('SELECT name FROM stores WHERE id = ?').get(r.storeId) as any)?.name,
  }));
}

export function assignBarcode(user: any, productId: string, barcode: string) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
  if (!product) throw Object.assign(new Error('Produit introuvable'), { status: 404 });
  assertStoreAccess(product.storeId, user);
  const norm = String(barcode || '').trim();
  if (!norm) throw Object.assign(new Error('Code vide'), { status: 400 });
  const existing = db.prepare('SELECT id, name FROM products WHERE storeId = ? AND barcode = ? AND id != ?').get(product.storeId, norm, productId);
  if (existing) throw Object.assign(new Error(`Code déjà attribué au produit ${existing.name}`), { status: 400 });
  db.prepare('UPDATE products SET barcode = ?, updatedAt = ? WHERE id = ?').run(norm, nowIso(), productId);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'BARCODE_ASSIGN', 'Product', productId, JSON.stringify({ barcode: norm }), nowIso());
  return db.prepare('SELECT id, name, barcode, sku, storeId FROM products WHERE id = ?').get(productId);
}
