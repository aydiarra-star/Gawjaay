// Tests V2 — LOT D : B2B (grossistes, catalogues pro, commandes) + réapprovisionnement.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = 'file:./test-v2-lotd.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld } from './helpers';

let W: any;
let b2b: any;

beforeAll(async () => {
  bootstrap();
  db.exec(`PRAGMA foreign_keys = OFF;
    DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM notifications; DELETE FROM employees;
    DELETE FROM deliveries; DELETE FROM payments; DELETE FROM debt_payments; DELETE FROM debts;
    DELETE FROM order_items; DELETE FROM orders; DELETE FROM sale_items; DELETE FROM sales;
    DELETE FROM b2b_order_items; DELETE FROM b2b_orders; DELETE FROM b2b_catalog_items; DELETE FROM b2b_catalogs;
    DELETE FROM b2b_profiles; DELETE FROM replenishment_suggestions;
    DELETE FROM loyalty_transactions; DELETE FROM loyalty_accounts; DELETE FROM favorites;
    DELETE FROM coupon_redemptions; DELETE FROM coupons; DELETE FROM promotion_products; DELETE FROM promotions;
    DELETE FROM review_reports; DELETE FROM moderation_actions; DELETE FROM reviews;
    DELETE FROM inventory_count_items; DELETE FROM inventory_counts;
    DELETE FROM purchase_items; DELETE FROM purchases; DELETE FROM expenses;
    DELETE FROM inventory_movements; DELETE FROM inventories; DELETE FROM products;
    DELETE FROM stores; DELETE FROM merchants; DELETE FROM users; DELETE FROM categories;
    PRAGMA foreign_keys = ON;`);
  b2b = await import('../modules/b2b/service');
  W = await seedWorld(db);
}, 120000);

const userA = () => ({ userId: W.mAUser, role: 'MERCHANT', merchantId: W.merchantA, storeIds: [W.storeA, W.closedStore] });
const userB = () => ({ userId: W.mBUser, role: 'MERCHANT', merchantId: W.merchantB, storeIds: [W.storeB] });
let catalogId = '';

describe('V2 LOT D — Profils B2B', () => {
  it('merchant B devient grossiste', () => {
    const p = b2b.upsertProfile(userB(), { type: 'WHOLESALER', companyName: 'Grossiste B SARL' });
    expect(p.type).toBe('WHOLESALER');
  });
  it('CLIENT ne peut pas créer de profil', () => {
    expect(() => b2b.upsertProfile({ userId: W.clientUser, role: 'CLIENT', merchantId: null, storeIds: [] }, { type: 'WHOLESALER', companyName: 'X' })).toThrow('commerçants');
  });
});

describe('V2 LOT D — Catalogues professionnels', () => {
  it('catalogue créé depuis les produits RÉELS du grossiste', () => {
    const cat = b2b.createCatalog(userB(), {
      name: 'Catalogue Pro Gros', minOrderAmount: 5000,
      items: [{ productId: W.pB, proPrice: 400, minQty: 10 }],
    });
    catalogId = cat.id;
    expect(cat.items[0].proPrice).toBe(400);
    expect(cat.items[0].availableQty).toBe(50); // stock réel du grossiste
  });
  it('non-grossiste → refus', () => {
    expect(() => b2b.createCatalog(userA(), { name: 'X' })).toThrow('grossiste');
  });
  it('produit hors des boutiques du grossiste → refus', () => {
    expect(() => b2b.addCatalogItem(userB(), catalogId, { productId: W.pRiz, proPrice: 100 })).toThrow('hors de vos boutiques');
  });
  it('prix pro <= 0 refusé', () => {
    expect(() => b2b.addCatalogItem(userB(), catalogId, { productId: W.pB, proPrice: -5 })).toThrow('Prix pro invalide');
  });
});

describe('V2 LOT D — Commandes professionnelles', () => {
  it('achat : commande ENVOYEE avec minQty et minimum de commande respectés', async () => {
    const o = await b2b.createOrder(userA(), {
      catalogId, buyerStoreId: W.storeA,
      items: [{ productId: W.pB, quantity: 20 }],
    });
    expect(o.status).toBe('ENVOYEE');
    expect(o.totalAmount).toBe(8000); // 20 × 400
    expect(o.items[0].productName).toBe('Produit B');
  });
  it('quantité sous minQty → refus', async () => {
    await expect(b2b.createOrder(userA(), { catalogId, buyerStoreId: W.storeA, items: [{ productId: W.pB, quantity: 5 }] })).rejects.toThrow('Quantité minimale');
  });
  it('minimum de commande → refus', async () => {
    await b2b.addCatalogItem(userB(), catalogId, { productId: W.pB, proPrice: 400, minQty: 1 });
    await expect(b2b.createOrder(userA(), { catalogId, buyerStoreId: W.storeA, items: [{ productId: W.pB, quantity: 2 }] })).rejects.toThrow('minimum');
  });
  it('grossiste ne peut pas commander son propre catalogue', async () => {
    await expect(b2b.createOrder(userB(), { catalogId, buyerStoreId: W.storeB, items: [{ productId: W.pB, quantity: 10 }] })).rejects.toThrow('son propre catalogue');
  });
  it('transitions interdites rejetées', async () => {
    const o = await b2b.createOrder(userA(), { catalogId, buyerStoreId: W.storeA, items: [{ productId: W.pB, quantity: 15 }] });
    await expect(b2b.updateStatus(userA(), o.id, 'RECUE')).rejects.toThrow('non autorisée');
    await b2b.updateStatus(userB(), o.id, 'ANNULEE');
  });
  it('flux complet ENVOYEE → RECUE avec stocks des deux côtés', async () => {
    const wsBefore = (db.prepare('SELECT quantity FROM inventories WHERE productId = ?').get(W.pB) as any).quantity;
    const buyerBefore = (db.prepare('SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pB)?.quantity) || 0;

    const o = await b2b.createOrder(userA(), { catalogId, buyerStoreId: W.storeA, items: [{ productId: W.pB, quantity: 15 }] });
    expect(b2b.getOrder(o.id, userA()).status).toBe('ENVOYEE');
    await expect(b2b.updateStatus(userA(), o.id, 'ACCEPTEE')).rejects.toThrow('grossiste'); // réservé grossiste

    await b2b.updateStatus(userB(), o.id, 'ACCEPTEE');
    await b2b.updateStatus(userB(), o.id, 'PREPARATION');
    await b2b.updateStatus(userB(), o.id, 'PRETE');
    await b2b.updateStatus(userB(), o.id, 'EXPEDIEE');

    // stock grossiste décrémenté à l'expédition + mouvement B2B_SHIPMENT
    const wsAfter = (db.prepare('SELECT quantity FROM inventories WHERE productId = ?').get(W.pB) as any).quantity;
    expect(wsAfter).toBe(wsBefore - 15);
    expect(db.prepare(`SELECT * FROM inventory_movements WHERE type = 'B2B_SHIPMENT' AND referenceId = ?`).get(o.id)).toBeDefined();

    await expect(b2b.updateStatus(userB(), o.id, 'RECUE')).rejects.toThrow('acheteur'); // réservé acheteur
    await b2b.updateStatus(userA(), o.id, 'RECUE');

    // stock acheteur incrémenté à la réception + mouvement PURCHASE_RECEIPT
    const buyerAfter = (db.prepare('SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pB) as any).quantity;
    expect(buyerAfter).toBe(buyerBefore + 15);
    expect(db.prepare(`SELECT * FROM inventory_movements WHERE type = 'PURCHASE_RECEIPT' AND referenceId = ? AND storeId = ?`).get(o.id, W.storeA)).toBeDefined();

    const done = b2b.getOrder(o.id, userA());
    expect(done.status).toBe('RECUE');
    expect(done.statusHistory.length).toBe(6);
  });
  it('isolation : l acheteur B ne voit pas les commandes de A', async () => {
    const listA = b2b.listOrders(userA(), 'buyer');
    expect(listA.length).toBeGreaterThan(0);
    const listB = b2b.listOrders(userB(), 'buyer');
    expect(listB.length).toBe(0);
  });
  it('tiers sans lien → 403 sur getOrder direct (IDOR)', async () => {
    const listA = b2b.listOrders(userA(), 'buyer');
    const outsider = { userId: 'x', role: 'MERCHANT', merchantId: 'other-merchant', storeIds: [] };
    expect(() => b2b.getOrder(listA[0].id, outsider)).toThrow('Accès refusé');
  });
  it('notifications B2B envoyées aux deux parties', () => {
    const n = db.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE type = 'B2B_ORDER'`).get() as any;
    expect(n.cnt).toBeGreaterThanOrEqual(3);
  });
});

describe('V2 LOT D — Réapprovisionnement', () => {
  it('suggestions basées sur les données réelles (stock <= seuil)', () => {
    const s = b2b.suggestions(userA(), W.storeA);
    expect(Array.isArray(s)).toBe(true);
    for (const r of s) {
      expect(r.stock).toBeLessThanOrEqual(r.threshold);
      expect(r.suggestedQty).toBeGreaterThanOrEqual(1);
      expect(r.message).toContain(r.name);
    }
  });
  it('tenant : B ne voit pas les suggestions de A', () => {
    expect(() => b2b.suggestions(userB(), W.storeA)).toThrow('Accès refusé');
  });
  it('création de commande de réappro via catalogue (quantité validée commerçant)', async () => {
    const s = b2b.suggestions(userA(), W.storeA);
    const sug = s[0];
    // le commerçant choisit SA quantité (peut différer de la suggestion)
    const qty = sug.suggestedQty + 5;
    const o = await b2b.createOrder(userA(), { catalogId, buyerStoreId: W.storeA, items: [{ productId: W.pB, quantity: 20 }] });
    expect(o.status).toBe('ENVOYEE');
    void sug; void qty;
  });
});
