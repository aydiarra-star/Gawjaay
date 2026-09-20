import db, { cuid } from '../../lib/db';
import { parseOrThrow } from '../../lib/validate';
import { customerCreateSchema, customerUpdateSchema } from '../../utils/validators';
import { recordAudit } from '../../lib/audit';
function nowIso(){ return new Date().toISOString(); }

export async function createCustomer(rawData: any, userId?: string) {
  const data = parseOrThrow(customerCreateSchema, rawData);
  const store = db.prepare('SELECT id FROM stores WHERE id = ?').get(data.storeId);
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });
  const id = cuid();
  db.prepare('INSERT INTO customers (id, storeId, name, phone, email, address, notes, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, data.storeId, data.name, data.phone, data.email || null, data.address || null, data.notes || null, nowIso(), nowIso());
  if (userId) recordAudit(userId, 'CUSTOMER_CREATE', 'Customer', id, { storeId: data.storeId });
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}
export async function listCustomers(storeId: string, search?: string, take = 100, skip = 0) {
  if (search) return db.prepare('SELECT * FROM customers WHERE storeId = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(storeId, `%${search}%`, `%${search}%`, take, skip);
  return db.prepare('SELECT * FROM customers WHERE storeId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?').all(storeId, take, skip);
}
export async function getCustomer(id: string) {
  const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as any;
  if (!cust) return null;
  const sales = db.prepare('SELECT * FROM sales WHERE customerId = ? ORDER BY createdAt DESC LIMIT 100').all(id);
  const debts = db.prepare('SELECT * FROM debts WHERE customerId = ? ORDER BY createdAt DESC LIMIT 100').all(id);
  const orders = db.prepare('SELECT * FROM orders WHERE customerId = ? ORDER BY createdAt DESC LIMIT 100').all(id);
  const totals = db.prepare('SELECT COALESCE(SUM(balance),0) as debtBalance FROM debts WHERE customerId = ? AND isSettled = 0').get(id) as any;
  return { ...cust, sales, debts, orders, debtBalance: totals?.debtBalance || 0 };
}
export async function updateCustomer(id: string, rawData: any, userId?: string) {
  const data: any = parseOrThrow(customerUpdateSchema, rawData);
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
    if (userId) recordAudit(userId, 'CUSTOMER_UPDATE', 'Customer', id, data);
  }
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}
