import db, { cuid } from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export async function createSupplier(merchantId: string, data: any) {
  const id = cuid();
  db.prepare('INSERT INTO suppliers (id, merchantId, name, phone, email, address, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, merchantId, data.name, data.phone || null, data.email || null, data.address || null, nowIso(), nowIso());
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}
export async function listSuppliers(merchantId: string) {
  return db.prepare('SELECT * FROM suppliers WHERE merchantId = ? ORDER BY createdAt DESC').all(merchantId);
}
export async function receivePurchase(supplierId: string, storeId: string, items: { productId: string; quantity: number; unitPrice: number }[], userId: string) {
  const total = items.reduce((s,i)=>s+i.quantity*i.unitPrice,0);
  const purchaseId = cuid();
  db.prepare('INSERT INTO purchases (id, supplierId, storeId, totalAmount, createdAt) VALUES (?,?,?, ?,?)').run(purchaseId, supplierId, storeId, total, nowIso());
  for (const it of items) {
    db.prepare('INSERT INTO purchase_items (id, purchaseId, productId, quantity, unitPrice) VALUES (?,?,?,?,?)').run(cuid(), purchaseId, it.productId, it.quantity, it.unitPrice);
    const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(storeId, it.productId) as any;
    if (inv) db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity + it.quantity, nowIso(), inv.id);
    else db.prepare('INSERT INTO inventories (id, storeId, productId, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(cuid(), storeId, it.productId, it.quantity, nowIso(), nowIso());
    db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(cuid(), storeId, it.productId, it.quantity, 'PURCHASE_RECEIPT', purchaseId, 'Réception fournisseur', userId, nowIso());
  }
  return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
}
