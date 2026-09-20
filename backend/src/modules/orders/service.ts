import db, { cuid } from '../../lib/db';
import { generateOrderNumber } from '../../utils/slug';
import { applyPromotions, consumePromotion, releasePromotion } from '../promotions/service';
import { validateCoupon, consumeCoupon, releaseCoupon } from '../coupons/service';
import { notifyLowStockSync } from '../inventory/service';
import * as loyalty from '../loyalty/service';
import { withTransaction } from '../../lib/transaction';
import { recordAudit } from '../../lib/audit';
import { parseOrThrow } from '../../lib/validate';
import { orderCreateSchema, ORDER_STATUS_ALIASES, ORDER_STATUSES } from '../../utils/validators';
import { toPublicStore } from '../stores/service';

function nowIso(){ return new Date().toISOString(); }

/**
 * Machine à états des commandes (PROJECT_RULES §7 + cahier §18).
 * Statuts canoniques FRANÇAIS (stockés en base) ; les codes anglais du cahier sont acceptés en entrée
 * (alias) et exposés en sortie via `statusCode` :
 *   EN_ATTENTE(PENDING) → CONFIRMEE(CONFIRMED) → EN_PREPARATION(PREPARING) → PRETE(READY)
 *   → EN_LIVRAISON(OUT_FOR_DELIVERY) → LIVREE(DELIVERED)
 *   Branches : ANNULEE(CANCELLED) depuis EN_ATTENTE/CONFIRMEE/EN_PREPARATION ;
 *              REJETEE(REJECTED) depuis EN_ATTENTE (refus marchand) ; RETOURNEE(RETURNED) depuis EN_LIVRAISON.
 *   PRETE → LIVREE couvre le retrait en boutique (RETRAIT).
 */
const transitions: Record<string, string[]> = {
  EN_ATTENTE: ['CONFIRMEE','ANNULEE','REJETEE'],
  CONFIRMEE: ['EN_PREPARATION','ANNULEE'],
  EN_PREPARATION: ['PRETE','ANNULEE'],
  PRETE: ['EN_LIVRAISON','LIVREE'],
  EN_LIVRAISON: ['LIVREE','RETOURNEE'],
  LIVREE: [],
  ANNULEE: [],
  REJETEE: [],
  RETOURNEE: [],
};

export const STATUS_CODES: Record<string, string> = Object.fromEntries(Object.entries(ORDER_STATUS_ALIASES).map(([en, fr]) => [fr, en]));

export function canTransition(from: string, to: string): boolean {
  return transitions[from]?.includes(to) || false;
}

/** Normalise un statut reçu (français canonique ou alias anglais). Renvoie null si inconnu. */
export function normalizeStatus(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim().toUpperCase();
  const canonical = ORDER_STATUS_ALIASES[s] || s;
  return (ORDER_STATUSES as readonly string[]).includes(canonical) ? canonical : null;
}

/** Transitions autorisées depuis un statut donné (exposé à l'UI pour n'afficher que les actions valides). */
export function allowedTransitions(from: string, role?: string, isOwnerClient = false): string[] {
  const next = transitions[from] || [];
  if (role === 'CLIENT') return isOwnerClient && from === 'EN_ATTENTE' ? ['ANNULEE'] : [];
  return next;
}

export function decorateOrder<T extends { status: string }>(order: T): T & { statusCode: string } {
  return { ...order, statusCode: STATUS_CODES[order.status] || order.status };
}

export async function createOrder(clientId: string, rawData: any) {
  const data = parseOrThrow(orderCreateSchema, rawData);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(data.storeId) as any;
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });
  if (!store.isActive) throw Object.assign(new Error('Boutique indisponible'), { status: 400 });
  if (store.digitalStatus !== 'OPEN') throw Object.assign(new Error('Boutique en ligne fermée'), { status: 400 });

  const deliveryType = data.deliveryType || 'LIVRAISON';
  // V3 (audit F3) : la boutique décide des modes qu'elle propose (source de vérité serveur)
  if (deliveryType === 'LIVRAISON' && store.allowDelivery === 0) throw Object.assign(new Error('Cette boutique ne propose pas la livraison'), { status: 400 });
  if (deliveryType === 'RETRAIT' && store.allowPickup === 0) throw Object.assign(new Error('Cette boutique ne propose pas le retrait en boutique'), { status: 400 });

  let addressText: string | null = data.addressText ?? null;
  if (data.addressId) {
    const addr = db.prepare('SELECT * FROM addresses WHERE id = ?').get(data.addressId) as any;
    if (!addr || addr.userId !== clientId) throw Object.assign(new Error('Adresse introuvable'), { status: 404 });
    if (!addressText) addressText = [addr.label, addr.street, addr.quartier, addr.city, addr.region].filter(Boolean).join(', ') || null;
  }

  // Dédoublonnage des lignes (même produit répété → quantités additionnées)
  const merged = new Map<string, number>();
  for (const it of data.items) merged.set(it.productId, (merged.get(it.productId) || 0) + it.quantity);
  const items = [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));

  return withTransaction(() => {
    let total = 0;
    const itemsData: any[] = [];
    // V2 : le serveur applique les promotions actives — le client n'impose jamais un prix.
    const promoResult = applyPromotions(data.storeId, items);
    const lineByProduct = new Map(promoResult.lines.map((l: any) => [l.productId, l]));
    for (const it of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as any;
      if (!product || product.storeId !== data.storeId) throw Object.assign(new Error(`Produit ${it.productId} introuvable`), { status: 404 });
      if (!product.isActive || !product.isOnline) throw Object.assign(new Error(`Produit ${product.name} non disponible en ligne`), { status: 400 });
      const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(data.storeId, it.productId) as any;
      if (!inv || inv.quantity < it.quantity) throw Object.assign(new Error(`Stock insuffisant pour ${product.name} (disponible ${inv?.quantity||0})`), { status: 400 });
      const line: any = lineByProduct.get(it.productId);
      const unitPrice = line ? line.unitPriceFinal : product.price; // prix serveur (promo ou prix normal)
      const lineTotal = unitPrice * it.quantity;
      total += lineTotal;
      itemsData.push({ productId: it.productId, quantity: it.quantity, unitPrice, total: lineTotal });
    }

    // V2 : coupon validé et chiffré côté serveur
    let coupon: any = null;
    let couponDiscount = 0;
    if (data.couponCode) {
      const check = validateCoupon(data.storeId, data.couponCode, { subtotal: total, clientId });
      if (!check.ok) throw Object.assign(new Error(check.reason || 'Coupon invalide'), { status: 400 });
      coupon = check.coupon;
      couponDiscount = check.discount || 0;
    }

    const orderId = cuid();
    const orderNumber = generateOrderNumber();

    // V2 LOT C : rachat de points fidélité (remise calculée serveur) — référence rattachée à la commande
    let pointsDiscount = 0;
    let pointsToUse = 0;
    if (data.pointsToUse && data.pointsToUse > 0) {
      pointsDiscount = loyalty.redeem(data.storeId, clientId, Math.floor(data.pointsToUse), orderId);
      pointsToUse = pointsDiscount > 0 ? Math.floor(data.pointsToUse) : 0;
    }

    const deliveryFees = deliveryType === 'LIVRAISON' ? (store.deliveryFees || 0) : 0;
    const finalTotal = Math.max(0, total + deliveryFees - couponDiscount - pointsDiscount);

    db.prepare(`INSERT INTO orders (id, orderNumber, storeId, clientId, addressId, totalAmount, deliveryFees, discount, deliveryType, notes, status, promotionIds, couponId, pointsToUse, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderId, orderNumber, data.storeId, clientId, data.addressId || null, finalTotal, deliveryFees,
        (promoResult.totalDiscount || 0) + couponDiscount + pointsDiscount, deliveryType, data.notes || null, 'EN_ATTENTE',
        promoResult.promotionIds.length ? JSON.stringify([...new Set(promoResult.promotionIds)]) : null,
        coupon ? coupon.id : null, pointsToUse || null, nowIso(), nowIso());

    for (const it of itemsData) {
      db.prepare('INSERT INTO order_items (id, orderId, productId, quantity, unitPrice, total) VALUES (?,?,?,?,?,?)')
        .run(cuid(), orderId, it.productId, it.quantity, it.unitPrice, it.total);
    }

    const deliveryId = cuid();
    db.prepare('INSERT INTO deliveries (id, orderId, storeId, type, status, addressText, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(deliveryId, orderId, data.storeId, deliveryType, 'A_PREPARER', addressText, nowIso(), nowIso());

    db.prepare('INSERT INTO payments (id, orderId, provider, status, amount, idempotencyKey, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(cuid(), orderId, 'CASH', 'PENDING', finalTotal, `${orderId}-cash`, nowIso(), nowIso());

    const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(store.merchantId) as any;
    if (merchant) {
      db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
        .run(cuid(), merchant.userId, 'Nouvelle commande', `Commande ${orderNumber} de ${finalTotal} FCFA`, 'ORDER', JSON.stringify({ orderId }), nowIso());
    }
    recordAudit(clientId, 'ORDER_CREATE', 'Order', orderId, { storeId: data.storeId, total: finalTotal, deliveryType });

    return decorateOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any);
  });
}

/**
 * Changement de statut — TOUJOURS validé serveur :
 *  - statut normalisé (alias EN acceptés) et transition vérifiée par la machine à états ;
 *  - CLIENT : uniquement SA commande, uniquement → ANNULEE, uniquement depuis EN_ATTENTE ;
 *  - MERCHANT / EMPLOYEE : uniquement les commandes de LEURS boutiques ;
 *  - ADMIN : toutes les boutiques (mais jamais hors machine à états) ; SYSTEM : usage interne (livraison).
 *  - Effets de stock / promotions / coupons / fidélité / notifications : atomiques.
 */
export async function updateStatus(orderId: string, requestedStatus: string, user: any, reason?: string) {
  const newStatus = normalizeStatus(requestedStatus);
  if (!newStatus) throw Object.assign(new Error('Statut de commande inconnu'), { status: 400 });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.storeId) as any;

  if (user.role === 'MERCHANT' && (!store || store.merchantId !== user.merchantId)) throw Object.assign(new Error('Accès refusé'), { status: 403 });
  if (user.role === 'EMPLOYEE' && !user.storeIds?.includes(order.storeId)) throw Object.assign(new Error('Accès refusé'), { status: 403 });
  if (user.role === 'CLIENT') {
    if (order.clientId !== user.userId) throw Object.assign(new Error('Accès refusé'), { status: 403 });
    if (newStatus !== 'ANNULEE') throw Object.assign(new Error('Un client ne peut qu annuler sa commande'), { status: 403 });
    if (order.status !== 'EN_ATTENTE') throw Object.assign(new Error('Client ne peut annuler que commande en attente'), { status: 403 });
  }
  if (!['MERCHANT','EMPLOYEE','ADMIN','SYSTEM','CLIENT'].includes(user.role)) throw Object.assign(new Error('Accès refusé'), { status: 403 });

  if (!canTransition(order.status, newStatus)) throw Object.assign(new Error(`Transition ${order.status} -> ${newStatus} non autorisée`), { status: 400 });

  return withTransaction(() => {
    if (newStatus === 'CONFIRMEE' && order.status === 'EN_ATTENTE') {
      const items = db.prepare('SELECT * FROM order_items WHERE orderId = ?').all(orderId) as any[];
      for (const it of items) {
        const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(order.storeId, it.productId) as any;
        if (!inv || inv.quantity < it.quantity) throw Object.assign(new Error(`Stock insuffisant pour produit ${it.productId}`), { status: 400 });
        db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity - it.quantity, nowIso(), inv.id);
        db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(cuid(), order.storeId, it.productId, -it.quantity, 'ONLINE_ORDER', orderId, 'Commande confirmée', user.userId, nowIso());
        notifyLowStockSync(order.storeId, it.productId);
      }
      // V2 : consommation des promotions au moment de la confirmation (atomicité serveur)
      if (order.promotionIds) {
        for (const pid of JSON.parse(order.promotionIds)) {
          if (!consumePromotion(pid)) {
            throw Object.assign(new Error('Promotion devenue indisponible'), { status: 400 });
          }
        }
      }
      if (order.couponId) {
        // remontée exacte de la remise coupon : remise = sous-total(promo inclus) + frais - total
        const agg = db.prepare('SELECT COALESCE(SUM(total),0) as subtotal FROM order_items WHERE orderId = ?').get(orderId) as any;
        const couponDiscount = Math.max(0, (agg.subtotal || 0) + (order.deliveryFees || 0) - order.totalAmount);
        consumeCoupon(order.couponId, orderId, order.storeId, order.clientId, couponDiscount);
      }
    }

    if (newStatus === 'ANNULEE' && ['CONFIRMEE','EN_PREPARATION'].includes(order.status)) {
      const items = db.prepare('SELECT * FROM order_items WHERE orderId = ?').all(orderId) as any[];
      for (const it of items) {
        const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(order.storeId, it.productId) as any;
        if (inv) {
          db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity + it.quantity, nowIso(), inv.id);
          db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
            .run(cuid(), order.storeId, it.productId, it.quantity, 'RETURN', orderId, 'Annulation commande', user.userId, nowIso());
        }
      }
      // V2 : restitution promotions/coupon à l'annulation
      if (order.promotionIds) {
        for (const pid of JSON.parse(order.promotionIds)) releasePromotion(pid);
      }
      if (order.couponId) releaseCoupon(order.couponId, orderId);
    }

    // V2 LOT C : points rachetés à la création → toujours restitués à l'annulation / au refus
    if ((newStatus === 'ANNULEE' || newStatus === 'REJETEE') && order.pointsToUse && order.pointsToUse > 0) {
      const acc = db.prepare('SELECT * FROM loyalty_accounts WHERE storeId = ? AND clientUserId = ?').get(order.storeId, order.clientId) as any;
      if (acc) {
        const newBalance = acc.points + order.pointsToUse;
        db.prepare('UPDATE loyalty_accounts SET points = ?, updatedAt = ? WHERE id = ?').run(newBalance, nowIso(), acc.id);
        db.prepare('INSERT INTO loyalty_transactions (id, accountId, type, points, balanceAfter, referenceId, reason, createdAt) VALUES (?,?,?,?,?,?,?,?)')
          .run(cuid(), acc.id, 'ADJUST', order.pointsToUse, newBalance, orderId, `Restitution points (${newStatus === 'REJETEE' ? 'commande refusée' : 'annulation commande'})`, nowIso());
      }
    }

    db.prepare('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?').run(newStatus, nowIso(), orderId);

    // Cohérence livraison : une commande annulée/refusée ferme la livraison associée ; commande prête → colis PRET
    if (newStatus === 'ANNULEE' || newStatus === 'REJETEE') {
      db.prepare(`UPDATE deliveries SET status = 'ANNULE', updatedAt = ? WHERE orderId = ? AND status NOT IN ('LIVRE','ANNULE')`).run(nowIso(), orderId);
      db.prepare(`UPDATE payments SET status = 'CANCELLED', updatedAt = ? WHERE orderId = ? AND status = 'PENDING'`).run(nowIso(), orderId);
    } else if (newStatus === 'PRETE') {
      db.prepare(`UPDATE deliveries SET status = 'PRET', updatedAt = ? WHERE orderId = ? AND status = 'A_PREPARER'`).run(nowIso(), orderId);
    }

    db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), order.clientId, `Commande ${newStatus}`, `Votre commande ${order.orderNumber} est ${newStatus}${reason ? ` — ${reason}` : ''}`, 'ORDER', JSON.stringify({ orderId, status: newStatus }), nowIso());

    // Le marchand est informé lorsqu'un client annule
    if (user.role === 'CLIENT' && store) {
      const merchant = db.prepare('SELECT userId FROM merchants WHERE id = ?').get(store.merchantId) as any;
      if (merchant) {
        db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
          .run(cuid(), merchant.userId, 'Commande annulée', `Le client a annulé la commande ${order.orderNumber}`, 'ORDER', JSON.stringify({ orderId, status: newStatus }), nowIso());
      }
    }

    // V2 LOT C : points de fidélité gagnés à la livraison (montant réel payé = totalAmount)
    if (newStatus === 'LIVREE' && order.totalAmount > 0) {
      const earned = loyalty.earnForPurchase(order.storeId, order.clientId, order.totalAmount, orderId);
      if (earned > 0) {
        db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
          .run(cuid(), order.clientId, 'Points fidélité', `+${earned} points pour votre commande ${order.orderNumber}`, 'LOYALTY', JSON.stringify({ orderId, points: earned }), nowIso());
      }
    }

    recordAudit(user.userId, 'ORDER_STATUS', 'Order', orderId, { from: order.status, to: newStatus, role: user.role, reason: reason || null });

    return decorateOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any);
  });
}

function placeholders(n: number) { return Array(n).fill('?').join(','); }

/**
 * Liste des commandes (filtres storeId / clientId / status / storeIds).
 * V3 (perf P1) : enrichissement en 4 requêtes groupées au lieu de 4 requêtes PAR commande (N+1).
 */
export async function listOrders(filters: any) {
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params: any[] = [];
  if (filters.storeId) { sql += ' AND storeId = ?'; params.push(filters.storeId); }
  if (Array.isArray(filters.storeIds)) {
    if (!filters.storeIds.length) return [];
    sql += ` AND storeId IN (${placeholders(filters.storeIds.length)})`; params.push(...filters.storeIds);
  }
  if (filters.clientId) { sql += ' AND clientId = ?'; params.push(filters.clientId); }
  if (filters.status) {
    const st = normalizeStatus(filters.status);
    if (!st) return [];
    sql += ' AND status = ?'; params.push(st);
  }
  sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
  params.push(filters.take||50, filters.skip||0);
  const orders = db.prepare(sql).all(...params) as any[];
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const storeIds = [...new Set(orders.map((o) => o.storeId))];
  const stores = db.prepare(`SELECT * FROM stores WHERE id IN (${placeholders(storeIds.length)})`).all(...storeIds) as any[];
  const payments = db.prepare(`SELECT * FROM payments WHERE orderId IN (${placeholders(ids.length)}) ORDER BY createdAt ASC`).all(...ids) as any[];
  const deliveries = db.prepare(`SELECT * FROM deliveries WHERE orderId IN (${placeholders(ids.length)}) ORDER BY createdAt ASC`).all(...ids) as any[];
  const items = db.prepare(`SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.productId WHERE oi.orderId IN (${placeholders(ids.length)})`).all(...ids) as any[];
  const storeById = new Map(stores.map((s) => [s.id, filters.publicStore ? toPublicStore(s) : s]));
  const paymentByOrder = new Map<string, any>();
  for (const p of payments) if (!paymentByOrder.has(p.orderId)) paymentByOrder.set(p.orderId, p);
  const deliveryByOrder = new Map<string, any>();
  for (const d of deliveries) if (!deliveryByOrder.has(d.orderId)) deliveryByOrder.set(d.orderId, d);
  const itemsByOrder = new Map<string, any[]>();
  for (const it of items) {
    if (!itemsByOrder.has(it.orderId)) itemsByOrder.set(it.orderId, []);
    itemsByOrder.get(it.orderId)!.push(it);
  }
  return orders.map((o) => decorateOrder({
    ...o,
    store: storeById.get(o.storeId) || null,
    payment: paymentByOrder.get(o.id) || null,
    delivery: deliveryByOrder.get(o.id) || null,
    items: itemsByOrder.get(o.id) || [],
  }));
}

export async function getOrder(id: string, viewer?: any) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
  if (!order) return null;
  const items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.productId WHERE oi.orderId = ?').all(id);
  const storeRow = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.storeId);
  const store = viewer && viewer.role === 'CLIENT' ? toPublicStore(storeRow) : storeRow;
  const payment = db.prepare('SELECT * FROM payments WHERE orderId = ? ORDER BY createdAt ASC').get(id);
  const delivery = db.prepare('SELECT * FROM deliveries WHERE orderId = ? ORDER BY createdAt ASC').get(id);
  const client = db.prepare('SELECT id, phone FROM users WHERE id = ?').get(order.clientId);
  const isOwnerClient = viewer?.role === 'CLIENT' && viewer.userId === order.clientId;
  return { ...decorateOrder(order), items, store, payment, delivery, client, allowedTransitions: allowedTransitions(order.status, viewer?.role, isOwnerClient) };
}
