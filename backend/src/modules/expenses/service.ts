import db, { cuid } from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export async function createExpense(storeId: string, data: any) {
  const id = cuid();
  db.prepare('INSERT INTO expenses (id, storeId, category, amount, description, date, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(id, storeId, data.category, data.amount, data.description || null, data.date ? new Date(data.date).toISOString() : nowIso(), nowIso());
  return db.prepare('SELECT * FROM expenses WHERE id = ?').get(id);
}
export async function listExpenses(storeId: string, from?: string, to?: string) {
  let sql = 'SELECT * FROM expenses WHERE storeId = ?';
  const params: any[] = [storeId];
  if (from) { sql += ' AND date >= ?'; params.push(new Date(from).toISOString()); }
  if (to) { sql += ' AND date <= ?'; params.push(new Date(to).toISOString()); }
  sql += ' ORDER BY date DESC LIMIT 200';
  return db.prepare(sql).all(...params);
}
export async function summary(storeId: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const iso = today.toISOString();
  const exp = db.prepare('SELECT SUM(amount) as total FROM expenses WHERE storeId = ? AND date >= ?').get(storeId, iso) as any;
  const sales = db.prepare('SELECT SUM(totalAmount) as total FROM sales WHERE storeId = ? AND createdAt >= ?').get(storeId, iso) as any;
  return { expensesToday: exp?.total || 0, salesToday: sales?.total || 0 };
}
