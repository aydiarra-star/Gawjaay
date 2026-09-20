import db, { cuid } from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export async function createCustomer(data: any) {
  const id = cuid();
  db.prepare('INSERT INTO customers (id, storeId, name, phone, email, address, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, data.storeId, data.name, data.phone, data.email || null, data.address || null, data.notes || null, nowIso(), nowIso());
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}
export async function listCustomers(storeId: string, search?: string) {
  if (search) return db.prepare('SELECT * FROM customers WHERE storeId = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY createdAt DESC LIMIT 100').all(storeId, `%${search}%`, `%${search}%`);
  return db.prepare('SELECT * FROM customers WHERE storeId = ? ORDER BY createdAt DESC LIMIT 100').all(storeId);
}
export async function getCustomer(id: string) {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
  if (!cust) return null;
  const sales = db.prepare('SELECT * FROM sales WHERE customerId = ?').all(id);
  const debts = db.prepare('SELECT * FROM debts WHERE customerId = ?').all(id);
  const orders = db.prepare('SELECT * FROM orders WHERE customerId = ?').all(id);
  return { ...cust, sales, debts, orders };
}
export async function updateCustomer(id: string, data: any) {
  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ['name','phone','email','address','notes']) {
    if (data[k] !== undefined) { fields.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (fields.length) {
    fields.push('updatedAt = ?');
    vals.push(nowIso());
    vals.push(id);
    db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  }
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}
