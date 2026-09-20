import db, { cuid } from '../../lib/db';
import { generateOrderNumber } from '../../utils/slug';

function nowIso(){ return new Date().toISOString(); }

const transitions: Record<string, string[]> = {
  EN_ATTENTE: ['CONFIRMEE','ANNULEE'],
  CONFIRMEE: ['EN_PREPARATION','ANNULEE'],
  EN_PREPARATION: ['PRETE','ANNULEE'],
  PRETE: ['EN_LIVRAISON','LIVREE'],
  EN_LIVRAISON: ['LIVREE','RETOURNEE'],
  LIVREE: [],
  ANNULEE: [],
  RETOURNEE: [],
};

export function canTransition(from: string, to: string): boolean {
  return transitions[from]?.includes(to) || false;
}

export async function createOrder(clientId: string, data: any) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(data.storeId) as any;
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });
  if (store.digitalStatus !== 'OPEN') throw Object.assign(new Error('Boutique en ligne fermée'), { status: 400 });

  let total = 0;
  const itemsData: any[] = [];
  for (const it of data.items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as any;
    if (!product || product.storeId !== data.storeId) throw Object.assign(new Error(`Produit ${it.productId} introuvable`), { status: 404 });
    if (!product.isActive || !product.isOnline) throw Object.assign(new Error(`Produit ${product.name} non disponible en ligne`), { status: 400 });
    const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(data.storeId, it.productId) as any;
    if (!inv || inv.quantity < it.quantity) throw Object.assign(new Error(`Stock insuffisant pour ${product.name} (disponible ${inv?.quantity||0})`), { status: 400 });
    const lineTotal = product.price * it.quantity;
    total += lineTotal;
    itemsData.push({ productId: it.productId, quantity: it.quantity, unitPrice: product.price, total: lineTotal });
  }

  const deliveryFees = data.deliveryType === 'LIVRAISON' ? (store.deliveryFees || 0) : 0;
  const finalTotal = total + deliveryFees - (data.discount||0);
  const orderId = cuid();
  const orderNumber = generateOrderNumber();

  db.prepare(`INSERT INTO orders (id, orderNumber, storeId, clientId, addressId, totalAmount, deliveryFees, deliveryType, notes, status, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderId, orderNumber, data.storeId, clientId, data.addressId || null, finalTotal, deliveryFees, data.deliveryType || 'LIVRAISON', data.notes || null, 'EN_ATTENTE', nowIso(), nowIso());

  for (const it of itemsData) {
    db.prepare('INSERT INTO order_items (id, orderId, productId, quantity, unitPrice, total) VALUES (?,?,?,?,?,?)')
      .run(cuid(), orderId, it.productId, it.quantity, it.unitPrice, it.total);
  }

  const deliveryId = cuid();
  db.prepare('INSERT INTO deliveries (id, orderId, storeId, type, status, addressText, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(deliveryId, orderId, data.storeId, data.deliveryType || 'LIVRAISON', 'A_PREPARER', data.addressText || null, nowIso(), nowIso());

  db.prepare('INSERT INTO payments (id, orderId, provider, status, amount, idempotencyKey, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(cuid(), orderId, 'CASH', 'PENDING', finalTotal, `${orderId}-cash`, nowIso(), nowIso());

  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(store.merchantId) as any;
  if (merchant) {
    db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), merchant.userId, 'Nouvelle commande', `Commande ${orderNumber} de ${finalTotal} FCFA`, 'ORDER', JSON.stringify({ orderId }), nowIso());
  }

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

export async function updateStatus(orderId: string, newStatus: string, user: any) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.storeId) as any;

  if (user.role === 'MERCHANT' && store.merchantId !== user.merchantId) throw Object.assign(new Error('Accès refusé'), { status: 403 });
  if (user.role === 'EMPLOYEE' && !user.storeIds?.includes(order.storeId)) throw Object.assign(new Error('Accès refusé'), { status: 403 });

  if (!canTransition(order.status, newStatus)) throw Object.assign(new Error(`Transition ${order.status} -> ${newStatus} non autorisée`), { status: 400 });
  if (newStatus === 'ANNULEE' && user.role === 'CLIENT' && order.status !== 'EN_ATTENTE') throw Object.assign(new Error('Client ne peut annuler que commande en attente'), { status: 403 });

  if (newStatus === 'CONFIRMEE' && order.status === 'EN_ATTENTE') {
    const items = db.prepare('SELECT * FROM order_items WHERE orderId = ?').all(orderId) as any[];
    for (const it of items) {
      const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(order.storeId, it.productId) as any;
      if (!inv || inv.quantity < it.quantity) throw Object.assign(new Error(`Stock insuffisant pour produit ${it.productId}`), { status: 400 });
      db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity - it.quantity, nowIso(), inv.id);
      db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(cuid(), order.storeId, it.productId, -it.quantity, 'ONLINE_ORDER', orderId, 'Commande confirmée', user.userId, nowIso());
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
  }

  db.prepare('UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?').run(newStatus, nowIso(), orderId);
  db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), order.clientId, `Commande ${newStatus}`, `Votre commande ${order.orderNumber} est ${newStatus}`, 'ORDER', JSON.stringify({ orderId }), nowIso());

  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

export async function listOrders(filters: any) {
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params: any[] = [];
  if (filters.storeId) { sql += ' AND storeId = ?'; params.push(filters.storeId); }
  if (filters.clientId) { sql += ' AND clientId = ?'; params.push(filters.clientId); }
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  sql += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
  params.push(filters.take||50, filters.skip||0);
  const orders = db.prepare(sql).all(...params) as any[];
  // enrich with store, payment, delivery
  return orders.map(o=>{
    const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(o.storeId);
    const payment = db.prepare('SELECT * FROM payments WHERE orderId = ?').get(o.id);
    const delivery = db.prepare('SELECT * FROM deliveries WHERE orderId = ?').get(o.id);
    const items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.productId WHERE oi.orderId = ?').all(o.id);
    return { ...o, store, payment, delivery, items };
  });
}

export async function getOrder(id: string) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
  if (!order) return null;
  const items = db.prepare('SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.productId WHERE oi.orderId = ?').all(id);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.storeId);
  const payment = db.prepare('SELECT * FROM payments WHERE orderId = ?').get(id);
  const delivery = db.prepare('SELECT * FROM deliveries WHERE orderId = ?').get(id);
  const client = db.prepare('SELECT id, phone FROM users WHERE id = ?').get(order.clientId);
  return { ...order, items, store, payment, delivery, client };
}
