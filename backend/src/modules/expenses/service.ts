import db, { cuid } from '../../lib/db';
import { parseOrThrow } from '../../lib/validate';
import { expenseCreateSchema } from '../../utils/validators';
import { recordAudit } from '../../lib/audit';
function nowIso(){ return new Date().toISOString(); }

export async function createExpense(storeId: string, rawData: any, userId?: string) {
  const data = parseOrThrow(expenseCreateSchema, rawData);
  const id = cuid();
  db.prepare('INSERT INTO expenses (id, storeId, category, amount, description, date, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(id, storeId, data.category, data.amount, data.description || null, data.date ? new Date(data.date).toISOString() : nowIso(), nowIso());
  if (userId) recordAudit(userId, 'EXPENSE_CREATE', 'Expense', id, { storeId, category: data.category, amount: data.amount });
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}
export async function listExpenses(storeId: string, from?: string, to?: string, take = 200, skip = 0) {
  let sql = 'SELECT * FROM expenses WHERE storeId = ?';
  const params: any[] = [storeId];
  if (from && !Number.isNaN(Date.parse(from))) { sql += ' AND date >= ?'; params.push(new Date(from).toISOString()); }
  if (to && !Number.isNaN(Date.parse(to))) { sql += ' AND date <= ?'; params.push(new Date(to).toISOString()); }
  sql += ' ORDER BY date DESC LIMIT ? OFFSET ?';
  params.push(take, skip);
  return db.prepare(sql).all(...params);
}
export async function deleteExpense(storeId: string, id: string, userId?: string) {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND storeId = ?').get(id, storeId) as any;
  if (!row) throw Object.assign(new Error('Dépense introuvable'), { status: 404 });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  if (userId) recordAudit(userId, 'EXPENSE_DELETE', 'Expense', id, { storeId, category: row.category, amount: row.amount });
  return { deleted: true };
}
export async function summary(storeId: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const iso = today.toISOString();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const exp = db.prepare('SELECT SUM(amount) as total FROM expenses WHERE storeId = ? AND date >= ?').get(storeId, iso) as any;
  const expMonth = db.prepare('SELECT SUM(amount) as total FROM expenses WHERE storeId = ? AND date >= ?').get(storeId, monthStart) as any;
  const sales = db.prepare('SELECT SUM(totalAmount) as total FROM sales WHERE storeId = ? AND createdAt >= ?').get(storeId, iso) as any;
  const salesMonth = db.prepare('SELECT SUM(totalAmount) as total FROM sales WHERE storeId = ? AND createdAt >= ?').get(storeId, monthStart) as any;
  const byCategory = db.prepare('SELECT category, SUM(amount) as total FROM expenses WHERE storeId = ? AND date >= ? GROUP BY category ORDER BY total DESC').all(storeId, monthStart);
  return { expensesToday: exp?.total || 0, salesToday: sales?.total || 0, expensesMonth: expMonth?.total || 0, salesMonth: salesMonth?.total || 0, byCategory };
}
