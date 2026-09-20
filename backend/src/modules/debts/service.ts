import db, { cuid } from '../../lib/db';
import { withTransaction } from '../../lib/transaction';
import { recordAudit } from '../../lib/audit';
function nowIso(){ return new Date().toISOString(); }

/** Boutique propriétaire d'une dette (via le client) — utilisée pour l'isolation tenant. */
export function debtStoreId(debtId: string): string | null {
  const row = db.prepare('SELECT c.storeId FROM debts d JOIN customers c ON c.id = d.customerId WHERE d.id = ?').get(debtId) as any;
  return row ? row.storeId : null;
}

export async function listDebts(storeId: string, opts: { includeSettled?: boolean; customerId?: string } = {}) {
  let sql = `SELECT d.*, c.name as customerName, c.phone as customerPhone FROM debts d JOIN customers c ON c.id = d.customerId WHERE c.storeId = ?`;
  const params: any[] = [storeId];
  if (!opts.includeSettled) sql += ' AND d.isSettled = 0';
  if (opts.customerId) { sql += ' AND d.customerId = ?'; params.push(opts.customerId); }
  sql += ' ORDER BY d.createdAt DESC LIMIT 500';
  return db.prepare(sql).all(...params);
}

/** Création manuelle d'une dette (crédit accordé hors vente). Le client doit appartenir à la boutique. */
export async function createDebt(storeId: string, data: { customerId: string; totalAmount: number; paidAmount?: number; dueDate?: string; notes?: string }, userId: string) {
  const customer = db.prepare('SELECT id, storeId FROM customers WHERE id = ?').get(data.customerId) as any;
  if (!customer || customer.storeId !== storeId) throw Object.assign(new Error('Client introuvable dans cette boutique'), { status: 404 });
  const paid = data.paidAmount || 0;
  if (paid > data.totalAmount) throw Object.assign(new Error('Montant payé supérieur au total'), { status: 400 });
  const balance = data.totalAmount - paid;
  const id = cuid();
  withTransaction(() => {
    db.prepare('INSERT INTO debts (id, customerId, totalAmount, paidAmount, balance, dueDate, notes, isSettled, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, data.customerId, data.totalAmount, paid, balance, data.dueDate || null, data.notes || null, balance <= 0.01 ? 1 : 0, nowIso(), nowIso());
    recordAudit(userId, 'DEBT_CREATE', 'Debt', id, { storeId, customerId: data.customerId, totalAmount: data.totalAmount, paidAmount: paid });
  });
  return db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
}

export async function payDebt(debtId: string, amount: number, method: any, notes?: string, userId?: string) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw Object.assign(new Error('Montant invalide'), { status: 400 });
  return withTransaction(() => {
    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId) as any;
    if (!debt) throw Object.assign(new Error('Dette introuvable'), { status: 404 });
    if (debt.isSettled) throw Object.assign(new Error('Dette déjà soldée'), { status: 400 });
    if (amount <=0) throw Object.assign(new Error('Montant invalide'), { status: 400 });
    if (amount > debt.balance + 0.01) throw Object.assign(new Error('Montant supérieur au solde'), { status: 400 });

    db.prepare('INSERT INTO debt_payments (id, debtId, amount, method, notes, createdAt) VALUES (?,?,?,?,?,?)')
      .run(cuid(), debtId, amount, method || 'CASH', notes || null, nowIso());
    const newPaid = debt.paidAmount + amount;
    const newBalance = Math.max(0, debt.totalAmount - newPaid);
    const settled = newBalance <= 0.01 ? 1 : 0;
    db.prepare('UPDATE debts SET paidAmount = ?, balance = ?, isSettled = ?, updatedAt = ? WHERE id = ?').run(newPaid, settled ? 0 : newBalance, settled, nowIso(), debtId);
    recordAudit(userId, 'DEBT_PAY', 'Debt', debtId, { amount, method: method || 'CASH', balance: settled ? 0 : newBalance });
    return db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId);
  });
}

export async function getDebt(id: string) {
  const debt = db.prepare('SELECT d.*, c.name as customerName, c.phone as customerPhone, c.storeId as storeId FROM debts d JOIN customers c ON c.id = d.customerId WHERE d.id = ?').get(id) as any;
  if (!debt) return null;
  const payments = db.prepare('SELECT * FROM debt_payments WHERE debtId = ? ORDER BY createdAt ASC').all(id);
  return { ...debt, payments };
}
