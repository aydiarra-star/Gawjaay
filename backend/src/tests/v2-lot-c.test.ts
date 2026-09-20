// Tests V2 — LOT C : Favoris, Recherche avancée, Notifications avancées, Fidélité.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = 'file:./test-v2-lotc.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld } from './helpers';

let W: any;
let favorites: any, loyalty: any, marketplace: any, notifications: any, orders: any, sales: any, stores: any;

beforeAll(async () => {
  bootstrap();
  db.exec(`PRAGMA foreign_keys = OFF;
    DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM notifications; DELETE FROM employees;
    DELETE FROM deliveries; DELETE FROM payments; DELETE FROM debt_payments; DELETE FROM debts;
    DELETE FROM order_items; DELETE FROM orders; DELETE FROM sale_items; DELETE FROM sales;
    DELETE FROM loyalty_transactions; DELETE FROM loyalty_accounts; DELETE FROM favorites;
    DELETE FROM coupon_redemptions; DELETE FROM coupons; DELETE FROM promotion_products; DELETE FROM promotions;
    DELETE FROM review_reports; DELETE FROM moderation_actions; DELETE FROM reviews;
    DELETE FROM inventory_count_items; DELETE FROM inventory_counts;
    DELETE FROM purchase_items; DELETE FROM purchases; DELETE FROM expenses;
    DELETE FROM inventory_movements; DELETE FROM inventories; DELETE FROM products;
    DELETE FROM stores; DELETE FROM merchants; DELETE FROM users; DELETE FROM categories;
    PRAGMA foreign_keys = ON;`);
  favorites = await import('../modules/favorites/service');
  loyalty = await import('../modules/loyalty/service');
  marketplace = await import('../modules/marketplace/service');
  notifications = await import('../modules/notifications/service');
  orders = await import('../modules/orders/service');
  sales = await import('../modules/sales/service');
  stores = await import('../modules/stores/service');
  W = await seedWorld(db);
}, 120000);

const userA = () => ({ userId: W.mAUser, role: 'MERCHANT', merchantId: W.merchantA, storeIds: [W.storeA, W.closedStore] });
const clientCtx = () => ({ userId: W.clientUser, role: 'CLIENT', storeIds: [] });
const client2Ctx = () => ({ userId: W.clientUser2, role: 'CLIENT', storeIds: [] });

async function livreeOrder(client: any = clientCtx(), items = [{ productId: W.pRiz, quantity: 1 }], extra: any = {}) {
  const o = await orders.createOrder(client.userId, { storeId: W.storeA, items, deliveryType: 'RETRAIT', ...extra });
  const uA = userA();
  await orders.updateStatus(o.id, 'CONFIRMEE', uA);
  await orders.updateStatus(o.id, 'EN_PREPARATION', uA);
  await orders.updateStatus(o.id, 'PRETE', uA);
  await orders.updateStatus(o.id, 'LIVREE', uA);
  return o;
}

describe('V2 LOT C — Favoris', () => {
  it('client ajoute produit + boutique en favori', () => {
    favorites.add(clientCtx(), 'PRODUCT', W.pRiz);
    favorites.add(clientCtx(), 'STORE', W.storeA);
    const list = favorites.list(clientCtx());
    expect(list.length).toBe(2);
    expect(list.find((f: any) => f.targetType === 'PRODUCT').product.name).toBe('Riz 25kg');
  });
  it('pas de doublon', () => {
    favorites.add(clientCtx(), 'PRODUCT', W.pRiz);
    expect(favorites.list(clientCtx()).length).toBe(2);
  });
  it('suppression', () => {
    favorites.remove(clientCtx(), 'PRODUCT', W.pRiz);
    expect(favorites.list(clientCtx(), 'PRODUCT').length).toBe(0);
  });
  it('réservé aux clients', () => {
    expect(() => favorites.add(userA(), 'STORE', W.storeB)).toThrow('clients');
  });
  it('isolation : chaque client voit ses favoris', () => {
    favorites.add(client2Ctx(), 'PRODUCT', W.pSucre);
    expect(favorites.list(clientCtx()).length).toBe(1);
    expect(favorites.list(client2Ctx()).length).toBe(1);
  });
});

describe('V2 LOT C — Recherche avancée', () => {
  beforeAll(async () => {
    const { createPromotion } = await import('../modules/promotions/service');
    await createPromotion(userA(), { storeId: W.storeA, name: 'Promo Riz', type: 'PERCENT', value: 5, dateStart: new Date().toISOString(), productIds: [W.pRiz] });
  });
  it('recherche par code-barres', async () => {
    const r = await marketplace.searchProducts('3000000000015', {}) as any[];
    expect(r.some((p) => p.id === W.pRiz)).toBe(true);
  });
  it('recherche par SKU', async () => {
    const r = await marketplace.searchProducts('RIZ25', {}) as any[];
    expect(r.some((p) => p.id === W.pRiz)).toBe(true);
  });
  it('filtre prix min/max', async () => {
    const r = await marketplace.searchProducts('', { minPrice: 10000, maxPrice: 20000 }) as any[];
    expect(r.every((p) => p.price >= 10000 && p.price <= 20000)).toBe(true);
    expect(r.some((p) => p.id === W.pRiz)).toBe(true);
  });
  it('filtre promotion=true ne renvoie que les produits promos', async () => {
    const r = await marketplace.searchProducts('', { promo: 'true' }) as any[];
    expect(r.some((p) => p.id === W.pRiz)).toBe(true);
    expect(r.some((p) => p.id === W.pSucre)).toBe(false);
  });
  it('filtre boutique (store slug)', async () => {
    const r = await marketplace.searchProducts('', { store: 'boutique-a' }) as any[];
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.storeId === W.storeA)).toBe(true);
  });
  it('tri par prix', async () => {
    const r = await marketplace.searchProducts('', { sort: 'price_asc' }) as any[];
    const prices = r.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
  it('hors ligne et boutiques fermées exclus (stock servi par le serveur)', async () => {
    const r = await marketplace.searchProducts('', {}) as any[];
    expect(r.some((p) => p.id === W.pOffline)).toBe(false);
    expect(r.some((p) => p.id === W.pClosed)).toBe(false);
  });
});

describe('V2 LOT C — Notifications avancées', () => {
  it('compteur non-lues', async () => {
    const before = notifications.unreadCount(W.mAUser).unread;
    db.prepare(`INSERT INTO notifications (id, userId, title, body, type, createdAt) VALUES (?,?,?,?,?,?)`)
      .run('n1', W.mAUser, 'Test', 'Test', 'ORDER', new Date().toISOString());
    expect(notifications.unreadCount(W.mAUser).unread).toBe(before + 1);
  });
  it('filtre par type', async () => {
    const ordersN = await notifications.listNotifications(W.mAUser, false, 'ORDER');
    expect(ordersN.every((n: any) => n.type === 'ORDER')).toBe(true);
  });
});

describe('V2 LOT C — Fidélité', () => {
  it('désactivé par défaut : aucun point gagné', async () => {
    const o = await livreeOrder();
    const acc = loyalty.accountFor(W.storeA, W.clientUser);
    expect(acc.enabled).toBe(false);
    expect(acc.points).toBe(0);
  });
  it('activation + configuration par le marchand (tenant contrôlé)', async () => {
    expect(() => loyalty.configure(userA(), W.storeB, { loyaltyEnabled: true })).toThrow('Accès refusé');
    const cfg = loyalty.configure(userA(), W.storeA, { loyaltyEnabled: true, loyaltyEarnRate: 10, loyaltyRedeemValue: 10 });
    expect(cfg.enabled).toBe(true);
    expect(cfg.earnRate).toBe(10);
  });
  it('commande livrée → points gagnés côté serveur (15000 F → 150 points à 10/1000)', async () => {
    const o = await livreeOrder();
    const acc = loyalty.accountFor(W.storeA, W.clientUser);
    // prix promo éventuel : vérifie proportionnalité réelle
    expect(acc.points).toBe(Math.floor((o.totalAmount / 1000) * 10));
    expect(acc.transactions.some((t: any) => t.type === 'EARN')).toBe(true);
  });
  it('rachat de points : remise serveur, solde décrémenté, historique', async () => {
    const before = loyalty.accountFor(W.storeA, W.clientUser).points;
    expect(before).toBeGreaterThan(0);
    const discount = loyalty.redeem(W.storeA, W.clientUser, 50, 'ref-test');
    expect(discount).toBe(500); // 50 points × 10 F
    const after = loyalty.accountFor(W.storeA, W.clientUser);
    expect(after.points).toBe(before - 50);
    expect(after.transactions[0].type).toBe('REDEEM');
  });
  it('rachat impossible au-delà du solde (plafonné)', () => {
    const acc = loyalty.accountFor(W.storeA, W.clientUser);
    const discount = loyalty.redeem(W.storeA, W.clientUser, 999999, 'ref-test2');
    expect(discount).toBe(acc.points * 10);
    expect(loyalty.accountFor(W.storeA, W.clientUser).points).toBe(0);
  });
  it('createOrder avec pointsToUse : remise appliquée au total serveur', async () => {
    // recrédite des points via une commande livrée
    await livreeOrder();
    const before = loyalty.accountFor(W.storeA, W.clientUser).points;
    expect(before).toBeGreaterThan(0);
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT', pointsToUse: 10 });
    expect(o.discount).toBe(100); // 10 points × 10 F
    expect(o.totalAmount).toBe(700); // 800 - 100
    // les points sont déduits dès la création
    expect(loyalty.accountFor(W.storeA, W.clientUser).points).toBe(before - 10);
  });
  it('annulation de commande → points rachetés restitués (traçable)', async () => {
    await livreeOrder(); // s'assure d'un solde
    const before = loyalty.accountFor(W.storeA, W.clientUser).points;
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT', pointsToUse: 5 });
    await orders.updateStatus(o.id, 'ANNULEE', userA());
    const after = loyalty.accountFor(W.storeA, W.clientUser);
    expect(after.points).toBe(before);
    expect(after.transactions[0].type).toBe('ADJUST');
  });
  it('client : consultation de son compte', () => {
    const acc = loyalty.accountFor(W.storeA, W.clientUser);
    expect(acc.accountId).toBeDefined();
    expect(acc.redeemValue).toBe(10);
  });
});
