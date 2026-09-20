import db from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export async function updateDeliveryStatus(deliveryId: string, status: string, proofUrl?: string, userId?: string) {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId) as any;
  if (!delivery) throw Object.assign(new Error('Livraison introuvable'), { status: 404 });
  db.prepare('UPDATE deliveries SET status = ?, proofUrl = ?, deliveredAt = ?, updatedAt = ? WHERE id = ?')
    .run(status, proofUrl || null, status === 'LIVRE' ? nowIso() : null, nowIso(), deliveryId);
  if (status === 'LIVRE') {
    db.prepare('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?').run('LIVREE', nowIso(), delivery.orderId);
  }
  return db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
}

export async function listDeliveries(storeId: string, status?: string) {
  let sql = 'SELECT * FROM deliveries WHERE storeId = ?';
  const params: any[] = [storeId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY createdAt DESC';
  const deliveries = db.prepare(sql).all(...params) as any[];
  return deliveries.map(d=>{
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(d.orderId);
    return { ...d, order };
  });
}

export async function assignDelivery(deliveryId: string, employeeUserId: string) {
  db.prepare('UPDATE deliveries SET assignedToId = ?, status = ?, updatedAt = ? WHERE id = ?').run(employeeUserId, 'EN_LIVRAISON', nowIso(), deliveryId);
  return db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
}
