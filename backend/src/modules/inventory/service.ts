import db, { cuid } from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export async function getStock(storeId: string) {
  return db.prepare('SELECT i.*, p.name as productName, p.lowStockThreshold FROM inventories i JOIN products p ON p.id = i.productId WHERE i.storeId = ?').all(storeId);
}

export async function adjustStock(storeId: string, productId: string, quantity: number, type: any, reason: string, userId: string) {
  const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(storeId, productId) as any;
  if (!inv) throw Object.assign(new Error('Inventaire introuvable'), { status: 404 });
  const newQty = inv.quantity + quantity;
  if (newQty < 0) throw Object.assign(new Error('Stock insuffisant'), { status: 400 });
  db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(newQty, nowIso(), inv.id);
  const movementId = cuid();
  db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(movementId, storeId, productId, quantity, type, reason, userId, nowIso());
  return { inventory: { ...inv, quantity: newQty }, movement: db.prepare('SELECT * FROM inventory_movements WHERE id = ?').get(movementId) };
}

export async function history(storeId: string, productId?: string, take=50) {
  if (productId) return db.prepare('SELECT * FROM inventory_movements WHERE storeId = ? AND productId = ? ORDER BY createdAt DESC LIMIT ?').all(storeId, productId, take);
  return db.prepare('SELECT * FROM inventory_movements WHERE storeId = ? ORDER BY createdAt DESC LIMIT ?').all(storeId, take);
}

export async function lowStock(storeId: string) {
  const rows = db.prepare(`SELECT i.*, p.name, p.lowStockThreshold FROM inventories i JOIN products p ON p.id = i.productId WHERE i.storeId = ?`).all(storeId) as any[];
  return rows.filter(r=> r.quantity <= (r.lowStockThreshold || 5));
}
