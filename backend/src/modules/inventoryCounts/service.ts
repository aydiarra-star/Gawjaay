import db, { cuid } from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';
import { adjustStock } from '../inventory/service';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT B — Inventaires traçables.
 *
 * Règles :
 * - Le commerçant démarre un comptage : snapshot du stock système par produit.
 * - Chaque ligne : produit, stock théorique, quantité comptée, différence.
 * - La confirmation applique les écarts UNIQUEMENT via adjustStock (mouvement INVENTORY).
 * - Aucun UPDATE direct du stock sans journalisation métier.
 * - L'utilisateur confirme explicitement l'ajustement.
 */

export async function startCount(user: any, storeId: string, notes?: string) {
  assertStoreAccess(storeId, user);
  const open = db.prepare(`SELECT id FROM inventory_counts WHERE storeId = ? AND status = 'OPEN'`).get(storeId);
  if (open) throw Object.assign(new Error('Un inventaire est déjà en cours pour cette boutique'), { status: 400 });

  const id = cuid();
  db.prepare(`INSERT INTO inventory_counts (id, storeId, merchantId, status, startedBy, notes, startedAt) VALUES (?,?,?,'OPEN',?,?,?)`)
    .run(id, storeId, user.merchantId || null, user.userId, notes || null, nowIso());

  const products = db.prepare(`SELECT p.id, p.name, COALESCE(i.quantity, 0) as quantity
    FROM products p LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    WHERE p.storeId = ? AND p.isActive = 1 ORDER BY p.name`).all(storeId) as any[];
  for (const p of products) {
    db.prepare(`INSERT INTO inventory_count_items (id, countId, productId, productName, systemQty) VALUES (?,?,?,?,?)`)
      .run(cuid(), id, p.id, p.name, p.quantity);
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'INVENTORY_START', 'InventoryCount', id, JSON.stringify({ storeId, products: products.length }), nowIso());
  return getCount(id, user);
}

export async function getCount(id: string, user: any) {
  const count = db.prepare('SELECT * FROM inventory_counts WHERE id = ?').get(id) as any;
  if (!count) throw Object.assign(new Error('Inventaire introuvable'), { status: 404 });
  assertStoreAccess(count.storeId, user);
  const items = db.prepare('SELECT * FROM inventory_count_items WHERE countId = ? ORDER BY productName').all(id);
  const withDiff = items.map((it: any) => ({
    ...it,
    difference: it.countedQty == null ? null : it.countedQty - it.systemQty,
  }));
  return { ...count, items: withDiff };
}

export async function setCountedQty(user: any, countId: string, productId: string, countedQty: number) {
  const count = db.prepare('SELECT * FROM inventory_counts WHERE id = ?').get(countId) as any;
  if (!count) throw Object.assign(new Error('Inventaire introuvable'), { status: 404 });
  assertStoreAccess(count.storeId, user);
  if (count.status !== 'OPEN') throw Object.assign(new Error('Inventaire clôturé'), { status: 400 });
  if (!Number.isFinite(countedQty) || countedQty < 0) throw Object.assign(new Error('Quantité comptée invalide'), { status: 400 });
  const item = db.prepare('SELECT * FROM inventory_count_items WHERE countId = ? AND productId = ?').get(countId, productId) as any;
  if (!item) throw Object.assign(new Error('Produit hors inventaire'), { status: 404 });
  db.prepare('UPDATE inventory_count_items SET countedQty = ?, difference = ? WHERE id = ?')
    .run(countedQty, countedQty - item.systemQty, item.id);
  return db.prepare('SELECT * FROM inventory_count_items WHERE id = ?').get(item.id);
}

export async function confirmCount(user: any, countId: string) {
  const count = db.prepare('SELECT * FROM inventory_counts WHERE id = ?').get(countId) as any;
  if (!count) throw Object.assign(new Error('Inventaire introuvable'), { status: 404 });
  assertStoreAccess(count.storeId, user);
  if (count.status !== 'OPEN') throw Object.assign(new Error('Inventaire déjà clôturé'), { status: 400 });

  const items = db.prepare('SELECT * FROM inventory_count_items WHERE countId = ? AND countedQty IS NOT NULL').all(countId) as any[];
  const adjustments: any[] = [];
  for (const it of items) {
    const diff = it.countedQty - it.systemQty;
    if (diff !== 0) {
      // ajustement traçable : passe par adjustStock (crée un mouvement INVENTORY)
      await adjustStock(count.storeId, it.productId, diff, 'INVENTORY', `Inventaire ${countId}`, user.userId);
      adjustments.push({ productId: it.productId, productName: it.productName, diff });
    }
  }
  db.prepare(`UPDATE inventory_counts SET status = 'CONFIRMED', confirmedBy = ?, confirmedAt = ? WHERE id = ?`)
    .run(user.userId, nowIso(), countId);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'INVENTORY_CONFIRM', 'InventoryCount', countId, JSON.stringify({ adjustments: adjustments.length }), nowIso());
  return getCount(countId, user);
}

export async function cancelCount(user: any, countId: string) {
  const count = db.prepare('SELECT * FROM inventory_counts WHERE id = ?').get(countId) as any;
  if (!count) throw Object.assign(new Error('Inventaire introuvable'), { status: 404 });
  assertStoreAccess(count.storeId, user);
  if (count.status !== 'OPEN') throw Object.assign(new Error('Inventaire déjà clôturé'), { status: 400 });
  db.prepare(`UPDATE inventory_counts SET status = 'CANCELLED', confirmedAt = ? WHERE id = ?`).run(nowIso(), countId);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'INVENTORY_CANCEL', 'InventoryCount', countId, nowIso());
}

export async function listCounts(storeId: string, user: any) {
  assertStoreAccess(storeId, user);
  return db.prepare('SELECT * FROM inventory_counts WHERE storeId = ? ORDER BY startedAt DESC').all(storeId);
}
