import db, { cuid } from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';
import { generateOrderNumber } from '../../utils/slug';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT D — B2B : grossistes, catalogue professionnel, commandes professionnelles.
 * Séparé logiquement du marketplace B2C. Stock unique : le catalogue expose les
 * produits réels du grossiste ; l'expédition décrémente son stock via mouvements.
 */

// ---------- Profils ----------

export function upsertProfile(user: any, data: { type: string; companyName: string; ninea?: string; phone?: string }) {
  if (user.role !== 'MERCHANT' && user.role !== 'ADMIN') throw Object.assign(new Error('Réservé aux commerçants'), { status: 403 });
  if (!['WHOLESALER', 'SUPPLIER', 'BOTH'].includes(data.type)) throw Object.assign(new Error('Type de profil invalide'), { status: 400 });
  const existing = db.prepare('SELECT * FROM b2b_profiles WHERE userId = ?').get(user.userId) as any;
  if (existing) {
    db.prepare('UPDATE b2b_profiles SET type = ?, companyName = ?, ninea = ?, phone = ? WHERE id = ?')
      .run(data.type, data.companyName, data.ninea || null, data.phone || null, existing.id);
    return db.prepare('SELECT * FROM b2b_profiles WHERE id = ?').get(existing.id);
  }
  const id = cuid();
  db.prepare('INSERT INTO b2b_profiles (id, userId, type, companyName, ninea, phone, isActive) VALUES (?,?,?,?,?,?,1)')
    .run(id, user.userId, data.type, data.companyName, data.ninea || null, data.phone || null);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'B2B_PROFILE_CREATE', 'B2BProfile', id, nowIso());
  return db.prepare('SELECT * FROM b2b_profiles WHERE id = ?').get(id);
}

export function myProfile(user: any) {
  return db.prepare('SELECT * FROM b2b_profiles WHERE userId = ?').get(user.userId) || null;
}

// ---------- Catalogues ----------

function assertWholesaler(userId: string) {
  const p = db.prepare('SELECT * FROM b2b_profiles WHERE userId = ? AND isActive = 1').get(userId) as any;
  if (!p || !['WHOLESALER', 'BOTH'].includes(p.type)) {
    throw Object.assign(new Error('Profil grossiste requis'), { status: 403 });
  }
  return p;
}

export function createCatalog(user: any, data: { name: string; description?: string; minOrderAmount?: number; items?: any[] }) {
  assertWholesaler(user.userId);
  const id = cuid();
  db.prepare('INSERT INTO b2b_catalogs (id, wholesalerUserId, name, description, minOrderAmount, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
    .run(id, user.userId, data.name, data.description || null, data.minOrderAmount || 0, nowIso(), nowIso());
  for (const it of data.items || []) addCatalogItem(user, id, it);
  return getCatalog(id, user);
}

export function addCatalogItem(user: any, catalogId: string, item: { productId: string; proPrice: number; minQty?: number }) {
  assertWholesaler(user.userId);
  const cat = db.prepare('SELECT * FROM b2b_catalogs WHERE id = ?').get(catalogId) as any;
  if (!cat || cat.wholesalerUserId !== user.userId) throw Object.assign(new Error('Catalogue introuvable'), { status: 404 });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId) as any;
  if (!product || !user.storeIds?.includes(product.storeId)) throw Object.assign(new Error('Produit hors de vos boutiques'), { status: 400 });
  if (!(item.proPrice > 0)) throw Object.assign(new Error('Prix pro invalide'), { status: 400 });
  const existing = db.prepare('SELECT id FROM b2b_catalog_items WHERE catalogId = ? AND productId = ?').get(catalogId, item.productId);
  if (existing) {
    db.prepare('UPDATE b2b_catalog_items SET proPrice = ?, minQty = ? WHERE id = ?')
      .run(item.proPrice, item.minQty || 1, existing.id);
  } else {
    db.prepare('INSERT INTO b2b_catalog_items (id, catalogId, productId, proPrice, minQty) VALUES (?,?,?,?,?)')
      .run(cuid(), catalogId, item.productId, item.proPrice, item.minQty || 1);
  }
  return db.prepare('SELECT * FROM b2b_catalog_items WHERE catalogId = ? AND productId = ?').get(catalogId, item.productId);
}

export function myCatalogs(user: any) {
  assertWholesaler(user.userId);
  return db.prepare('SELECT * FROM b2b_catalogs WHERE wholesalerUserId = ? ORDER BY createdAt DESC').all(user.userId);
}

export function publicCatalogs() {
  return db.prepare(`SELECT bc.*, u.id as userId, bp.companyName FROM b2b_catalogs bc
    JOIN b2b_profiles bp ON bp.userId = bc.wholesalerUserId
    WHERE bc.isActive = 1 AND bp.isActive = 1 ORDER BY bc.createdAt DESC`).all() as any[];
}

export function getCatalog(catalogId: string, user?: any) {
  const cat = db.prepare(`SELECT bc.*, bp.companyName FROM b2b_catalogs bc
    JOIN b2b_profiles bp ON bp.userId = bc.wholesalerUserId
    WHERE bc.id = ?`).get(catalogId) as any;
  if (!cat) throw Object.assign(new Error('Catalogue introuvable'), { status: 404 });
  const items = db.prepare(`
    SELECT bci.*, p.name as productName, p.unit,
      (SELECT COALESCE(SUM(quantity),0) FROM inventories WHERE productId = bci.productId) as availableQty
    FROM b2b_catalog_items bci
    JOIN products p ON p.id = bci.productId
    WHERE bci.catalogId = ?`).all(catalogId) as any[];
  return { ...cat, items };
}

// ---------- Commandes B2B ----------

const transitions: Record<string, string[]> = {
  BROUILLON: ['ENVOYEE', 'ANNULEE'],
  ENVOYEE: ['ACCEPTEE', 'ANNULEE'],
  ACCEPTEE: ['PREPARATION', 'ANNULEE'],
  PREPARATION: ['PRETE'],
  PRETE: ['EXPEDIEE'],
  EXPEDIEE: ['RECUE'],
  RECUE: [],
  ANNULEE: [],
};

export function canTransition(from: string, to: string): boolean {
  return transitions[from]?.includes(to) || false;
}

export async function createOrder(user: any, data: { catalogId: string; buyerStoreId: string; items: { productId: string; quantity: number }[]; notes?: string; send?: boolean }) {
  if (user.role !== 'MERCHANT' && user.role !== 'ADMIN') throw Object.assign(new Error('Réservé aux commerçants'), { status: 403 });
  assertStoreAccess(data.buyerStoreId, user);
  const cat = db.prepare('SELECT * FROM b2b_catalogs WHERE id = ? AND isActive = 1').get(data.catalogId) as any;
  if (!cat) throw Object.assign(new Error('Catalogue introuvable ou inactif'), { status: 404 });
  if (cat.wholesalerUserId === user.userId) throw Object.assign(new Error('Impossible de commander son propre catalogue'), { status: 400 });

  const itemsData: any[] = [];
  let total = 0;
  for (const it of data.items) {
    const ci = db.prepare('SELECT * FROM b2b_catalog_items WHERE catalogId = ? AND productId = ?').get(data.catalogId, it.productId) as any;
    if (!ci) throw Object.assign(new Error(`Produit ${it.productId} hors catalogue`), { status: 400 });
    if (it.quantity < ci.minQty) throw Object.assign(new Error(`Quantité minimale ${ci.minQty} pour ce produit`), { status: 400 });
    const stock = db.prepare('SELECT COALESCE(SUM(quantity),0) as q FROM inventories WHERE productId = ?').get(it.productId) as any;
    if (stock.q < it.quantity) throw Object.assign(new Error(`Stock grossiste insuffisant (${stock.q} disponible)`), { status: 400 });
    const lineTotal = ci.proPrice * it.quantity;
    total += lineTotal;
    const pname = (db.prepare('SELECT name FROM products WHERE id = ?').get(it.productId) as any).name;
    itemsData.push({ productId: it.productId, productName: pname, quantity: it.quantity, proPrice: ci.proPrice, total: lineTotal });
  }
  if (total < (cat.minOrderAmount || 0)) {
    throw Object.assign(new Error(`Montant minimum de commande : ${cat.minOrderAmount} FCFA`), { status: 400 });
  }

  const id = cuid();
  const orderNumber = `B2B-${generateOrderNumber().slice(3)}`;
  const status = data.send === false ? 'BROUILLON' : 'ENVOYEE';
  const history = JSON.stringify([{ status, at: nowIso(), by: user.userId }]);
  db.prepare(`INSERT INTO b2b_orders (id, orderNumber, catalogId, wholesalerUserId, buyerMerchantId, buyerStoreId, status, totalAmount, notes, statusHistory, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, orderNumber, data.catalogId, cat.wholesalerUserId, user.merchantId, data.buyerStoreId, status, total, data.notes || null, history, nowIso(), nowIso());
  for (const it of itemsData) {
    db.prepare('INSERT INTO b2b_order_items (id, orderId, productId, productName, quantity, proPrice, total) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), id, it.productId, it.productName, it.quantity, it.proPrice, it.total);
  }

  const wholesaler = db.prepare('SELECT id FROM merchants WHERE userId = ?').get(cat.wholesalerUserId) as any;
  if (wholesaler) {
    const wUser = db.prepare('SELECT userId FROM merchants WHERE id = ?').get(wholesaler.id) as any;
    db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), wUser.userId, 'Nouvelle commande B2B', `${orderNumber} — ${total} FCFA`, 'B2B_ORDER', JSON.stringify({ orderId: id }), nowIso());
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'B2B_ORDER_CREATE', 'B2BOrder', id, JSON.stringify({ orderNumber, total, status }), nowIso());
  return getOrder(id, user);
}

/** Transitions validées serveur + contrôle de rôle (acheteur vs grossiste). */
export async function updateStatus(user: any, orderId: string, newStatus: string) {
  const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ?').get(orderId) as any;
  if (!order) throw Object.assign(new Error('Commande B2B introuvable'), { status: 404 });

  const isBuyer = user.merchantId === order.buyerMerchantId || user.role === 'ADMIN';
  const isWholesaler = order.wholesalerUserId === user.userId || user.role === 'ADMIN';
  if (!isBuyer && !isWholesaler) throw Object.assign(new Error('Accès refusé'), { status: 403 });

  if (!canTransition(order.status, newStatus)) {
    throw Object.assign(new Error(`Transition ${order.status} -> ${newStatus} non autorisée`), { status: 400 });
  }
  const buyerOnly = ['RECUE'];
  const wholesalerOnly = ['ACCEPTEE', 'PREPARATION', 'PRETE', 'EXPEDIEE'];
  if (buyerOnly.includes(newStatus) && !isBuyer) throw Object.assign(new Error('Réservé à l acheteur'), { status: 403 });
  if (wholesalerOnly.includes(newStatus) && !isWholesaler) throw Object.assign(new Error('Réservé au grossiste'), { status: 403 });
  if (newStatus === 'ANNULEE') {
    // chaque partie peut annuler une commande pas encore expédiée
    if (['PREPARATION', 'PRETE', 'EXPEDIEE', 'RECUE'].includes(order.status)) {
      throw Object.assign(new Error('Annulation non autorisée à ce stade'), { status: 400 });
    }
  }

  // EXPEDIEE : décrémente le stock grossiste (mouvement traçable)
  if (newStatus === 'EXPEDIEE') {
    const items = db.prepare('SELECT * FROM b2b_order_items WHERE orderId = ?').all(orderId) as any[];
    for (const it of items) {
      const prod = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as any;
      const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(prod.storeId, it.productId) as any;
      if (!inv || inv.quantity < it.quantity) throw Object.assign(new Error(`Stock grossiste insuffisant pour ${it.productName}`), { status: 400 });
      db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity - it.quantity, nowIso(), inv.id);
      db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(cuid(), prod.storeId, it.productId, -it.quantity, 'B2B_SHIPMENT', orderId, `Expédition B2B ${order.orderNumber}`, user.userId, nowIso());
    }
  }

  // RECUE : incrémente le stock de la boutique acheteuse (réception fournisseur)
  if (newStatus === 'RECUE') {
    const items = db.prepare('SELECT * FROM b2b_order_items WHERE orderId = ?').all(orderId) as any[];
    for (const it of items) {
      const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(order.buyerStoreId, it.productId) as any;
      if (inv) {
        db.prepare('UPDATE inventories SET quantity = ?, updatedAt = ? WHERE id = ?').run(inv.quantity + it.quantity, nowIso(), inv.id);
      } else {
        db.prepare('INSERT INTO inventories (id, storeId, productId, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
          .run(cuid(), order.buyerStoreId, it.productId, it.quantity, nowIso(), nowIso());
      }
      db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, referenceId, reason, userId, createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(cuid(), order.buyerStoreId, it.productId, it.quantity, 'PURCHASE_RECEIPT', orderId, `Réception B2B ${order.orderNumber}`, user.userId, nowIso());
    }
  }

  const history = JSON.parse(order.statusHistory || '[]');
  history.push({ status: newStatus, at: nowIso(), by: user.userId });
  db.prepare('UPDATE b2b_orders SET status = ?, statusHistory = ?, updatedAt = ? WHERE id = ?').run(newStatus, JSON.stringify(history), nowIso(), orderId);

  // notifie l'autre partie
  const notifyUserId = isBuyer ? order.wholesalerUserId : (db.prepare('SELECT userId FROM merchants WHERE id = ?').get(order.buyerMerchantId) as any)?.userId;
  if (notifyUserId) {
    db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), notifyUserId, `Commande B2B ${newStatus}`, `${order.orderNumber} est ${newStatus}`, 'B2B_ORDER', JSON.stringify({ orderId }), nowIso());
  }

  return getOrder(orderId, user);
}

export function getOrder(id: string, user: any) {
  const order = db.prepare('SELECT * FROM b2b_orders WHERE id = ?').get(id) as any;
  if (!order) throw Object.assign(new Error('Commande B2B introuvable'), { status: 404 });
  if (user.role !== 'ADMIN' && order.wholesalerUserId !== user.userId && order.buyerMerchantId !== user.merchantId) {
    throw Object.assign(new Error('Accès refusé'), { status: 403 });
  }
  const items = db.prepare('SELECT * FROM b2b_order_items WHERE orderId = ?').all(id);
  return { ...order, items, statusHistory: JSON.parse(order.statusHistory || '[]') };
}

export function listOrders(user: any, role: 'buyer' | 'wholesaler') {
  let sql = `SELECT * FROM b2b_orders WHERE `;
  const params: any[] = [];
  if (role === 'buyer') { sql += 'buyerMerchantId = ?'; params.push(user.merchantId); }
  else { sql += 'wholesalerUserId = ?'; params.push(user.userId); }
  sql += ' ORDER BY createdAt DESC LIMIT 100';
  return db.prepare(sql).all(...params) as any[];
}

// ---------- Réapprovisionnement ----------

/** Suggestions basées sur les données réelles : stock <= seuil. Quantité validée par le commerçant. */
export function suggestions(user: any, storeId: string) {
  assertStoreAccess(storeId, user);
  const rows = db.prepare(`
    SELECT p.id as productId, p.name, COALESCE(i.quantity,0) as stock, p.lowStockThreshold as threshold,
      p.stockMax, (SELECT MAX(createdAt) FROM inventory_movements m WHERE m.productId = p.id AND m.quantity < 0) as lastSale
    FROM products p LEFT JOIN inventories i ON i.productId = p.id AND i.storeId = p.storeId
    WHERE p.storeId = ? AND p.isActive = 1 AND COALESCE(i.quantity,0) <= p.lowStockThreshold
    ORDER BY (COALESCE(i.quantity,0) / MAX(p.lowStockThreshold,1)) ASC`).all(storeId) as any[];
  return rows.map((r: any) => {
    const target = r.stockMax ?? Math.max(r.threshold * 4, 10);
    const suggestedQty = Math.max(target - r.stock, 1);
    return {
      productId: r.productId,
      name: r.name,
      stock: r.stock,
      threshold: r.threshold,
      suggestedQty,
      lastSale: r.lastSale,
      message: `${r.name} — stock ${r.stock} — seuil ${r.threshold} → suggestion ${suggestedQty} unités`,
    };
  });
}
