import db, { cuid } from '../../lib/db';
function nowIso(){ return new Date().toISOString(); }

export async function listDebts(storeId: string) {
  const customers = db.prepare('SELECT id FROM customers WHERE storeId = ?').all(storeId) as any[];
  const ids = customers.map(c=>c.id);
  if (!ids.length) return [];
  const placeholders = ids.map(()=>'?').join(',');
  return db.prepare(`SELECT d.*, c.name as customerName FROM debts d JOIN customers c ON c.id = d.customerId WHERE d.customerId IN (${placeholders}) AND d.isSettled = 0 ORDER BY d.createdAt DESC`).all(...ids);
}

export async function payDebt(debtId: string, amount: number, method: any, notes?: string) {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as any;
  if (!debt) throw Object.assign(new Error('Dette introuvable'), { status: 404 });
  if (debt.isSettled) throw Object.assign(new Error('Dette déjà soldée'), { status: 400 });
  if (amount <=0) throw Object.assign(new Error('Montant invalide'), { status: 400 });
  if (amount > debt.balance) throw Object.assign(new Error('Montant supérieur au solde'), { status: 400 });

  db.prepare('INSERT INTO debt_payments (id, debtId, amount, method, notes, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), debtId, amount, method, notes || null, nowIso());
  const newPaid = debt.paidAmount + amount;
  const newBalance = debt.totalAmount - newPaid;
  const settled = newBalance <= 0.01 ? 1 : 0;
  db.prepare('UPDATE debts SET paidAmount = ?, balance = ?, isSettled = ?, updatedAt = ? WHERE id = ?').run(newPaid, newBalance, settled, nowIso(), debtId);
  return db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId);
}

export async function getDebt(id: string) {
  const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(id) as any;
  if (!debt) return null;
  const payments = db.prepare('SELECT * FROM debt_payments WHERE debtId = ?').all(id);
  return { ...debt, payments };
}
