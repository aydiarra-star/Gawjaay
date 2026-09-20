import db, { cuid } from '../../lib/db';
import { slugify } from '../../utils/slug';
import { parseOrThrow } from '../../lib/validate';
import { productCreateSchema, productUpdateSchema } from '../../utils/validators';
import { withTransaction } from '../../lib/transaction';
import { toPublicStore } from '../stores/service';

function nowIso() { return new Date().toISOString(); }

function assertCategoryExists(categoryId?: string | null) {
  if (!categoryId) return;
  const c = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!c) throw Object.assign(new Error('Catégorie inconnue'), { status: 400 });
}

export async function createProduct(storeId: string, rawData: any, userId: string) {
  const store = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });
  const data = parseOrThrow(productCreateSchema, rawData);
  assertCategoryExists(data.categoryId);

  // V2 : unicité du code-barres / SKU par boutique (dès la création)
  if (data.barcode) {
    const dup = db.prepare('SELECT id, name FROM products WHERE storeId = ? AND barcode = ?').get(storeId, data.barcode.trim()) as any;
    if (dup) throw Object.assign(new Error(`Code déjà attribué au produit ${dup.name}`), { status: 400 });
  }
  if (data.sku) {
    const dup = db.prepare('SELECT id, name FROM products WHERE storeId = ? AND sku = ?').get(storeId, data.sku.trim()) as any;
    if (dup) throw Object.assign(new Error(`SKU déjà attribué au produit ${dup.name}`), { status: 400 });
  }

  const baseSlug = slugify(data.name) || 'produit';
  let slug = baseSlug;
  let i=1;
  while (db.prepare('SELECT id FROM products WHERE storeId = ? AND slug = ?').get(storeId, slug)) {
    slug = `${baseSlug}-${i++}`;
  }

  const id = cuid();
  withTransaction(() => {
    db.prepare(`INSERT INTO products (id, storeId, name, slug, description, price, costPrice, categoryId, sku, barcode, unit, lowStockThreshold, stockMax, isOnline, images, variants, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, storeId, data.name, slug, data.description ?? null, data.price, data.costPrice ?? null,
        data.categoryId ?? null, data.sku?.trim() || null, data.barcode?.trim() || null, data.unit || 'piece',
        data.lowStockThreshold ?? 5, data.stockMax ?? null, data.isOnline === false ? 0 : 1,
        data.images ? JSON.stringify(data.images) : null,
        data.variants ? JSON.stringify(data.variants) : null,
        nowIso(), nowIso()
    );

    const qty = data.initialStock ?? 0;
    const invId = cuid();
    db.prepare('INSERT INTO inventories (id, storeId, productId, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
      .run(invId, storeId, id, qty, nowIso(), nowIso());
    if (qty !== 0) {
      db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?)')
        .run(cuid(), storeId, id, qty, 'INITIAL', 'Stock initial', userId, nowIso());
    }

    db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
      .run(cuid(), userId, 'PRODUCT_CREATE', 'Product', id, nowIso());
  });

  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

export async function listProducts(storeId: string, filters: any) {
  let sql = `SELECT p.*, i.quantity as invQty, c.name AS categoryName, c.slug AS categorySlug
    FROM products p
    LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    LEFT JOIN categories c ON c.id = p.categoryId
    WHERE p.storeId = ?`;
  const params: any[] = [storeId];
  if (!filters.includeInactive) sql += ' AND p.isActive = 1';
  if (filters.search) { sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'; params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`); }
  if (filters.categoryId) { sql += ' AND p.categoryId = ?'; params.push(filters.categoryId); }
  if (filters.onlineOnly) { sql += ' AND p.isOnline = 1'; }
  sql += ' ORDER BY p.createdAt DESC LIMIT ? OFFSET ?';
  params.push(filters.take || 50, filters.skip || 0);
  const rows = db.prepare(sql).all(...params) as any[];
  // group inventories
  return rows.map(r=>({
    ...r,
    inventories: [{ quantity: r.invQty || 0 }],
    inStock: (r.invQty || 0) > 0,
  }));
}

export async function updateProduct(productId: string, rawData: any, userId: string) {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
  if (!existing) throw Object.assign(new Error('Produit introuvable'), { status: 404 });
  const data: any = parseOrThrow(productUpdateSchema, rawData);
  if (data.categoryId !== undefined) assertCategoryExists(data.categoryId);
  // V2 : unicité du code-barres / SKU par boutique
  if (data.barcode !== undefined && data.barcode !== null && data.barcode !== '') {
    const dup = db.prepare('SELECT id, name FROM products WHERE storeId = ? AND barcode = ? AND id != ?').get(existing.storeId, String(data.barcode).trim(), productId);
    if (dup) throw Object.assign(new Error(`Code déjà attribué au produit ${dup.name}`), { status: 400 });
  }
  if (data.sku !== undefined && data.sku !== null && data.sku !== '') {
    const dup = db.prepare('SELECT id, name FROM products WHERE storeId = ? AND sku = ? AND id != ?').get(existing.storeId, String(data.sku).trim(), productId);
    if (dup) throw Object.assign(new Error(`SKU déjà attribué au produit ${dup.name}`), { status: 400 });
  }
  const fields: string[] = [];
  const values: any[] = [];
  const map: any = { name: 'name', description: 'description', price: 'price', costPrice: 'costPrice', categoryId: 'categoryId', unit: 'unit', lowStockThreshold: 'lowStockThreshold', stockMax: 'stockMax', sku: 'sku', barcode: 'barcode', isActive: 'isActive', isOnline: 'isOnline', images: 'images', variants: 'variants' };
  for (const k in map) {
    if (data[k] !== undefined) {
      fields.push(`${map[k]} = ?`);
      let v = data[k];
      if (k === 'images' || k === 'variants') v = JSON.stringify(v);
      if (k === 'isActive' || k === 'isOnline') v = v ? 1 : 0;
      if ((k === 'sku' || k === 'barcode') && v === '') v = null;
      values.push(v);
    }
  }
  if (fields.length) {
    fields.push('updatedAt = ?');
    values.push(nowIso());
    values.push(productId);
    db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), userId, 'PRODUCT_UPDATE', 'Product', productId, JSON.stringify(data), nowIso());
  return db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
}

export async function deleteProduct(productId: string, userId: string) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
  if (!p) throw Object.assign(new Error('Produit introuvable'), { status: 404 });
  db.prepare('UPDATE products SET isActive = 0, updatedAt = ? WHERE id = ?').run(nowIso(), productId);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), userId, 'PRODUCT_DELETE', 'Product', productId, nowIso());
}

export async function getProduct(productId: string) {
  const product = db.prepare(`SELECT p.*, c.name AS categoryName, c.slug AS categorySlug FROM products p
    LEFT JOIN categories c ON c.id = p.categoryId WHERE p.id = ?`).get(productId) as any;
  if (!product) return null;
  const inventories = db.prepare('SELECT * FROM inventories WHERE productId = ?').all(productId);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(product.storeId);
  return { ...product, inventories, store };
}

/** Projection publique d'une fiche produit : ni coût d'achat, ni données internes de la boutique. */
export function toPublicProduct(product: any) {
  const { costPrice, inventories, store, ...rest } = product;
  const qty = Array.isArray(inventories) ? inventories.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0) : 0;
  return { ...rest, inventories: [{ quantity: qty }], inStock: qty > 0, store: toPublicStore(store) };
}
