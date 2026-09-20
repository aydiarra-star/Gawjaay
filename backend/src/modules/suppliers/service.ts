import db, { cuid } from '../../lib/db';
import { withTransaction } from '../../lib/transaction';
import { recordAudit } from '../../lib/audit';
import { parseOrThrow } from '../../lib/validate';
import { supplierCreateSchema, supplierUpdateSchema } from '../../utils/validators';
function nowIso(){ return new Date().toISOString(); }

export async function createSupplier(merchantId: string, rawData: any, userId?: string) {
  const data = parseOrThrow(supplierCreateSchema, rawData);
  const id = cuid();
  db.prepare('INSERT INTO suppliers (id, merchantId, name, phone, email, address, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, merchantId, data.name, data.phone || null, data.email || null, data.address || null, data.notes || null, nowIso(), nowIso());
  if (userId) recordAudit(userId, 'SUPPLIER_CREATE', 'Supplier', id, { merchantId });
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}
export async function listSuppliers(merchantId: string) {
  return db.prepare('SELECT * FROM suppliers WHERE merchantId = ? ORDER BY createdAt DESC LIMIT 500').all(merchantId);
}
export function getSupplierForMerchant(supplierId: string, merchantId: string | null | undefined, isAdmin = false) {
  const sup = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId) as any;
  if (!sup) throw Object.assign(new Error('Fournisseur introuvable'), { status: 404 });
  if (!isAdmin && sup.merchantId !== merchantId) throw Object.assign(new Error('Accès refusé à ce fournisseur'), { status: 403 });
  return sup;
}
export async function getSupplier(supplierId: string, merchantId: string | null | undefined, isAdmin = false) {
  const sup = getSupplierForMerchant(supplierId, merchantId, isAdmin);
  const purchases = db.prepare('SELECT * FROM purchases WHERE supplierId = ? ORDER BY createdAt DESC LIMIT 100').all(supplierId) as any[];
  return { ...sup, purchases };
}
export async function updateSupplier(supplierId: string, merchantId: string | null | undefined, rawData: any, userId?: string, isAdmin = false) {
  getSupplierForMerchant(supplierId, merchantId, isAdmin);
  const data: any = parseOrThrow(supplierUpdateSchema, rawData);
  const fields: string[] = []; const vals: any[] = [];
  for (const k of ['name','phone','email','address','notes']) if (data[k] !== undefined) { fields.push(`${k} = ?`); vals.push(data[k]); }
  if (fields.length) {
    fields.push('updatedAt = ?'); vals.push(nowIso()); vals.push(supplierId);
    db.prepare(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    if (userId) recordAudit(userId, 'SUPPLIER_UPDATE', 'Supplier', supplierId, data);
  }
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
}
export async function listPurchases(storeId: string, take = 100) {
  const purchases = db.prepare(`SELECT p.*, s.name as supplierName FROM purchases p JOIN suppliers s ON s.id = p.supplierId WHERE p.storeId = ? ORDER BY p.createdAt DESC LIMIT ?`).all(storeId, take) as any[];
  if (!purchases.length) return [];
  const ids = purchases.map((p) => p.id);
  const items = db.prepare(`SELECT pi.*, pr.name as productName FROM purchase_items pi LEFT JOIN products pr ON pr.id = pi.productId WHERE pi.purchaseId IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
  const byPurchase = new Map<string, any[]>();
  for (const it of items) { if (!byPurchase.has(it.purchaseId)) byPurchase.set(it.purchaseId, []); byPurchase.get(it.purchaseId)!.push(it); }
  return purchases.map((p) => ({ ...p, items: byPurchase.get(p.id) || [] }));
}

/**
 * Réception fournisseur : incrémente le stock (type PURCHASE_RECEIPT) de façon ATOMIQUE.
 * V3 : chaque produit doit appartenir à la boutique ; quantités > 0 ; prix ≥ 0 (validés par Zod en amont
 * pour l'API, re-vérifiés ici pour les appels internes).
 */
export async function receivePurchase(supplierId: string, storeId: string, items: { productId: string; quantity: number; unitPrice: number }[], userId: string, notes?: string) {
  if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('Aucun article à réceptionner'), { status: 400 });
  for (const it of items) {
    if (typeof it.quantity !== 'number' || !(it.quantity > 0)) throw Object.assign(new Error('Quantité invalide'), { status: 400 });
    if (typeof it.unitPrice !== 'number' || it.unitPrice < 0) throw Object.assign(new Error('Prix unitaire invalide'), { status: 400 });
  }
  return withTransaction(() => {
    const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(supplierId);
    if (!supplier) throw Object.assign(new Error('Fournisseur introuvable'), { status: 404 });
    const total = items.reduce((s,i)=>s+i.quantity*i.unitPrice,0);
    const purchaseId = cuid();
    db.prepare('INSERT INTO purchases (id, supplierId, storeId, totalAmount, notes, createdAt) VALUES (?,?,?,?,?,?)').run(purchaseId, supplierId, storeId, total, notes || null, nowIso());
    for (const it of items) {
      const product = db.prepare('SELECT id, storeId, name FROM products WHERE id = ?').get(it.productId) as any;
      if (!product || product.storeId !== storeId) throw Object.assign(new Error(`Produit ${it.productId} introuvable dans cette boutique`), { status: 404 });
      db.prepare('INSERT INTO purchase_items (id, purchaseId, productId, quantity, unitPrice) VALUES (?,?,?,?,?)').run(cuid(), purchaseId, it.productId, it.quantity, it.unitPrice);
      const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(storeId, it.productId) as any;
      if (inv) db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity + it.quantity, nowIso(), inv.id);
      else db.prepare('INSERT INTO inventories (id, storeId, productId, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(cuid(), storeId, it.productId, it.quantity, nowIso(), nowIso());
      db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(cuid(), storeId, it.productId, it.quantity, 'PURCHASE_RECEIPT', purchaseId, 'Réception fournisseur', userId, nowIso());
    }
    recordAudit(userId, 'PURCHASE_RECEIVE', 'Purchase', purchaseId, { storeId, supplierId, total, items: items.length });
    return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
  });
}
