import db from '../../lib/db';
import { withTransaction } from '../../lib/transaction';
import { recordAudit } from '../../lib/audit';
import { canTransitionDelivery } from './service-v2';
import * as ordersService from '../orders/service';
function nowIso(){ return new Date().toISOString(); }

const LEGACY_STATUSES = ['A_PREPARER','PRET','EN_LIVRAISON','LIVRE','ANNULE'] as const;

/** Chemin nominal de la machine à états commandes jusqu'à un statut cible. */
const ORDER_PATH = ['EN_ATTENTE','CONFIRMEE','EN_PREPARATION','PRETE','EN_LIVRAISON','LIVREE'];

/**
 * Fait avancer la commande jusqu'à `target` EN PASSANT PAR CHAQUE TRANSITION de la machine à états
 * (contexte SYSTEM) : le stock est réservé à CONFIRMEE, les promotions consommées, la fidélité créditée
 * à LIVREE. Aucun statut n'est forcé « à la main ». Toute étape impossible (ex. stock insuffisant)
 * fait échouer l'opération complète.
 */
async function advanceOrderTo(orderId: string, target: string, userId?: string) {
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as any;
  if (!order || order.status === target) return;
  const from = ORDER_PATH.indexOf(order.status);
  const to = ORDER_PATH.indexOf(target);
  if (from === -1 || to === -1) throw Object.assign(new Error(`Commande en statut ${order.status} : passage à ${target} impossible`), { status: 400 });
  if (to <= from) return; // la commande est déjà au-delà du statut cible
  const system = { userId: userId || null, role: 'SYSTEM', merchantId: null, storeIds: [] as string[] };
  let current: string = order.status;
  while (current !== target) {
    let next = ORDER_PATH[ORDER_PATH.indexOf(current) + 1];
    // retrait / remise en main propre : PRETE → LIVREE directement (pas d'étape EN_LIVRAISON)
    if (current === 'PRETE' && target === 'LIVREE') next = 'LIVREE';
    await ordersService.updateStatus(orderId, next, system);
    current = next;
  }
}

/**
 * Chemin V1 (compatibilité) : changement de statut d'une livraison par le marchand.
 * V3 : statut validé (enum), transition contrôlée (`canTransitionDelivery`), et la commande associée
 * SUIT LA MACHINE À ÉTATS (jamais de `status = 'LIVREE'` forcé).
 */
export async function updateDeliveryStatus(deliveryId: string, status: string, proofUrl?: string, userId?: string) {
  if (!(LEGACY_STATUSES as readonly string[]).includes(status)) throw Object.assign(new Error('Statut de livraison inconnu'), { status: 400 });
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId) as any;
  if (!delivery) throw Object.assign(new Error('Livraison introuvable'), { status: 404 });
  if (delivery.status !== status && !canTransitionDelivery(delivery.status, status)) {
    throw Object.assign(new Error(`Transition ${delivery.status} -> ${status} non autorisée`), { status: 400 });
  }
  // 1) commande d'abord (source de vérité stock/fidélité) — échec = rien n'est modifié
  if (status === 'LIVRE') await advanceOrderTo(delivery.orderId, 'LIVREE', userId);
  else if (status === 'EN_LIVRAISON') {
    const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(delivery.orderId) as any;
    if (order && ORDER_PATH.indexOf(order.status) >= 0 && ORDER_PATH.indexOf(order.status) < ORDER_PATH.indexOf('EN_LIVRAISON')) {
      await advanceOrderTo(delivery.orderId, 'EN_LIVRAISON', userId);
    }
  } else if (status === 'ANNULE') {
    const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(delivery.orderId) as any;
    if (order && ordersService.canTransition(order.status, 'ANNULEE')) {
      await ordersService.updateStatus(delivery.orderId, 'ANNULEE', { userId: userId || null, role: 'SYSTEM', merchantId: null, storeIds: [] });
    }
  }
  // 2) livraison
  withTransaction(() => {
    db.prepare('UPDATE deliveries SET status = ?, proofUrl = COALESCE(?, proofUrl), deliveredAt = ?, updatedAt = ? WHERE id = ?')
      .run(status, proofUrl || null, status === 'LIVRE' ? nowIso() : null, nowIso(), deliveryId);
    recordAudit(userId, 'DELIVERY_STATUS', 'Delivery', deliveryId, { from: delivery.status, to: status });
  });
  return db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
}

export async function listDeliveries(storeId: string, status?: string, take = 100) {
  let sql = 'SELECT * FROM deliveries WHERE storeId = ?';
  const params: any[] = [storeId];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY createdAt DESC LIMIT ?';
  params.push(take);
  const deliveries = db.prepare(sql).all(...params) as any[];
  if (!deliveries.length) return [];
  // V3 (perf P1) : une requête groupée pour les commandes au lieu d'une par livraison
  const orderIds = [...new Set(deliveries.map((d) => d.orderId))];
  const orders = db.prepare(`SELECT * FROM orders WHERE id IN (${orderIds.map(() => '?').join(',')})`).all(...orderIds) as any[];
  const byId = new Map(orders.map((o) => [o.id, o]));
  return deliveries.map(d=>({ ...d, order: byId.get(d.orderId) || null }));
}

export async function assignDelivery(deliveryId: string, employeeUserId: string) {
  const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId) as any;
  if (!delivery) throw Object.assign(new Error('Livraison introuvable'), { status: 404 });
  if (!canTransitionDelivery(delivery.status, 'EN_LIVRAISON') && delivery.status !== 'A_PREPARER') {
    throw Object.assign(new Error(`Transition ${delivery.status} -> EN_LIVRAISON non autorisée`), { status: 400 });
  }
  db.prepare('UPDATE deliveries SET assignedToId = ?, status = ?, updatedAt = ? WHERE id = ?').run(employeeUserId, 'EN_LIVRAISON', nowIso(), deliveryId);
  return db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
}
