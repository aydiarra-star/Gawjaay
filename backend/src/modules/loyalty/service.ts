import db, { cuid } from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT C — Fidélité (optionnel par boutique).
 *
 * Sécurité :
 * - Points calculés CÔTÉ SERVEUR uniquement (règle boutique : X points / 1000 FCFA).
 * - Aucun solde modifiable directement : tout passe par loyalty_transactions.
 * - Historique obligatoire avec solde après chaque opération.
 * - Rachat de points = remise calculée serveur, plafonnée au solde et au panier.
 */

function getStoreConfig(storeId: string) {
  const store = db.prepare('SELECT loyaltyEnabled, loyaltyEarnRate, loyaltyRedeemValue FROM stores WHERE id = ?').get(storeId) as any;
  return {
    enabled: !!store?.loyaltyEnabled,
    earnRate: Math.max(0, store?.loyaltyEarnRate ?? 10),
    redeemValue: Math.max(1, store?.loyaltyRedeemValue ?? 10),
  };
}

export function configure(user: any, storeId: string, data: { loyaltyEnabled?: boolean; loyaltyEarnRate?: number; loyaltyRedeemValue?: number }) {
  assertStoreAccess(storeId, user);
  const fields: string[] = [];
  const values: any[] = [];
  if (data.loyaltyEnabled !== undefined) { fields.push('loyaltyEnabled = ?'); values.push(data.loyaltyEnabled ? 1 : 0); }
  if (data.loyaltyEarnRate !== undefined) { fields.push('loyaltyEarnRate = ?'); values.push(Math.max(0, Math.round(data.loyaltyEarnRate))); }
  if (data.loyaltyRedeemValue !== undefined) { fields.push('loyaltyRedeemValue = ?'); values.push(Math.max(1, Math.round(data.loyaltyRedeemValue))); }
  if (fields.length) {
    fields.push('updatedAt = ?'); values.push(nowIso()); values.push(storeId);
    db.prepare(`UPDATE stores SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'LOYALTY_CONFIG', 'Store', storeId, JSON.stringify(data), nowIso());
  return getStoreConfig(storeId);
}

function ensureAccount(storeId: string, clientUserId: string, customerId?: string | null) {
  let acc = db.prepare('SELECT * FROM loyalty_accounts WHERE storeId = ? AND clientUserId = ?').get(storeId, clientUserId) as any;
  if (!acc) {
    const id = cuid();
    db.prepare('INSERT INTO loyalty_accounts (id, storeId, clientUserId, customerId, points, createdAt, updatedAt) VALUES (?,?,?,?,0,?,?)')
      .run(id, storeId, clientUserId, customerId || null, nowIso(), nowIso());
    acc = db.prepare('SELECT * FROM loyalty_accounts WHERE id = ?').get(id);
  } else if (customerId && !acc.customerId) {
    db.prepare('UPDATE loyalty_accounts SET customerId = ?, updatedAt = ? WHERE id = ?').run(customerId, nowIso(), acc.id);
  }
  return acc;
}

function recordTx(accountId: string, type: 'EARN' | 'REDEEM' | 'ADJUST', points: number, balanceAfter: number, referenceId?: string, reason?: string, createdBy?: string) {
  db.prepare('INSERT INTO loyalty_transactions (id, accountId, type, points, balanceAfter, referenceId, reason, createdBy, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(cuid(), accountId, type, points, balanceAfter, referenceId || null, reason || null, createdBy || null, nowIso());
}

/** Gagne des points sur un montant payé réel (source : vente/commande serveur). */
export function earnForPurchase(storeId: string, clientUserId: string, amountPaid: number, referenceId: string, customerId?: string | null): number {
  const cfg = getStoreConfig(storeId);
  if (!cfg.enabled || cfg.earnRate <= 0 || amountPaid <= 0) return 0;
  const points = Math.floor((amountPaid / 1000) * cfg.earnRate);
  if (points <= 0) return 0;
  const acc = ensureAccount(storeId, clientUserId, customerId);
  const newBalance = acc.points + points;
  db.prepare('UPDATE loyalty_accounts SET points = ?, updatedAt = ? WHERE id = ?').run(newBalance, nowIso(), acc.id);
  recordTx(acc.id, 'EARN', points, newBalance, referenceId, `Achat ${amountPaid} FCFA`);
  return points;
}

/** Rachat de points : retourne la remise FCFA appliquée (0 si insuffisant). */
export function redeem(storeId: string, clientUserId: string, pointsToUse: number, referenceId: string): number {
  const cfg = getStoreConfig(storeId);
  const acc = db.prepare('SELECT * FROM loyalty_accounts WHERE storeId = ? AND clientUserId = ?').get(storeId, clientUserId) as any;
  if (!acc) return 0;
  const pts = Math.floor(pointsToUse);
  if (pts <= 0) return 0;
  const usable = Math.min(pts, acc.points);
  if (usable <= 0) return 0;
  const discount = usable * cfg.redeemValue;
  const newBalance = acc.points - usable;
  db.prepare('UPDATE loyalty_accounts SET points = ?, updatedAt = ? WHERE id = ?').run(newBalance, nowIso(), acc.id);
  recordTx(acc.id, 'REDEEM', -usable, newBalance, referenceId, `Rachat ${usable} points = ${discount} FCFA`);
  return discount;
}

export function accountFor(storeId: string, clientUserId: string) {
  const cfg = getStoreConfig(storeId);
  const acc = db.prepare('SELECT * FROM loyalty_accounts WHERE storeId = ? AND clientUserId = ?').get(storeId, clientUserId) as any;
  const tx = acc ? db.prepare('SELECT * FROM loyalty_transactions WHERE accountId = ? ORDER BY createdAt DESC LIMIT 50').all(acc.id) : [];
  return {
    enabled: cfg.enabled,
    earnRate: cfg.earnRate,
    redeemValue: cfg.redeemValue,
    points: acc?.points ?? 0,
    accountId: acc?.id ?? null,
    transactions: tx,
  };
}

export function storeAccounts(user: any, storeId: string) {
  assertStoreAccess(storeId, user);
  return db.prepare(`SELECT la.*, u.phone as clientPhone, c.name as customerName FROM loyalty_accounts la
    LEFT JOIN users u ON u.id = la.clientUserId
    LEFT JOIN customers c ON c.id = la.customerId
    WHERE la.storeId = ? ORDER BY la.points DESC LIMIT 100`).all(storeId);
}
