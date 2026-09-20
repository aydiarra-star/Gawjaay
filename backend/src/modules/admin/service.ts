import db from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export async function listUsers(take=50) {
  // SÉCURITÉ : jamais de passwordHash dans une réponse API (même ADMIN).
  return (db.prepare('SELECT * FROM users ORDER BY createdAt DESC LIMIT ?').all(take) as any[])
    .map(({ passwordHash, ...rest }: any) => rest);
}
export async function listStores(take=50) {
  const stores = db.prepare('SELECT * FROM stores ORDER BY createdAt DESC LIMIT ?').all(take) as any[];
  return stores.map(s=>{
    const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(s.merchantId) as any;
    const user = merchant ? db.prepare('SELECT id, phone FROM users WHERE id = ?').get(merchant.userId) : null;
    return { ...s, merchant: merchant ? { ...merchant, user } : null };
  });
}
export async function listOrders(take=50) {
  const orders = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC LIMIT ?').all(take) as any[];
  return orders.map(o=>{
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(o.storeId);
    const client = db.prepare('SELECT id, phone FROM users WHERE id = ?').get(o.clientId);
    return { ...o, store, client };
  });
}
export async function listPayments(take=50) {
  return db.prepare('SELECT * FROM payments ORDER BY createdAt DESC LIMIT ?').all(take);
}
export async function stats() {
  const users = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as any).cnt;
  const stores = (db.prepare('SELECT COUNT(*) as cnt FROM stores').get() as any).cnt;
  const orders = (db.prepare('SELECT COUNT(*) as cnt FROM orders').get() as any).cnt;
  const sales = (db.prepare('SELECT SUM(totalAmount) as total FROM sales').get() as any).total || 0;
  const payments = (db.prepare("SELECT COUNT(*) as cnt FROM payments WHERE status = 'SUCCESS'").get() as any).cnt;
  return { users, stores, orders, totalSales: sales, successfulPayments: payments };
}
export async function toggleUser(userId: string) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!u) throw Object.assign(new Error('Utilisateur introuvable'), { status: 404 });
  db.prepare('UPDATE users SET isActive = ?, updatedAt = ? WHERE id = ?').run(u.isActive ? 0 : 1, nowIso(), userId);
  const { passwordHash: _ph, ...safe } = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  return safe;
}
export async function verifyStore(storeId: string) {
  db.prepare('UPDATE stores SET isVerified = 1, updatedAt = ? WHERE id = ?').run(nowIso(), storeId);
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
}
export async function auditLogs(take=100) {
  return db.prepare('SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT ?').all(take);
}
