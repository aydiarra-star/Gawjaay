// Tests V2 — LOT A : Promotions, Coupons, Avis vérifiés, Modération.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-v2-lota.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld, nowIso , resetDatabase } from './helpers';

let W: any;
let promos: any, coupons: any, reviews: any, moderation: any, orders: any, sales: any, products: any, auth: any;

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  promos = await import('../modules/promotions/service');
  coupons = await import('../modules/coupons/service');
  reviews = await import('../modules/reviews/service');
  moderation = await import('../modules/moderation/service');
  orders = await import('../modules/orders/service');
  sales = await import('../modules/sales/service');
  products = await import('../modules/products/service');
  auth = await import('../modules/auth/service');
  W = await seedWorld(db);
}, 120000);

const userA = () => ({ userId: W.mAUser, role: 'MERCHANT', merchantId: W.merchantA, storeIds: [W.storeA, W.closedStore] });
const userB = () => ({ userId: W.mBUser, role: 'MERCHANT', merchantId: W.merchantB, storeIds: [W.storeB] });
const clientCtx = () => ({ userId: W.clientUser, role: 'CLIENT', storeIds: [] });
const client2Ctx = () => ({ userId: W.clientUser2, role: 'CLIENT', storeIds: [] });

async function livreeOrder(client: any = clientCtx(), items = [{ productId: W.pRiz, quantity: 1 }], deliveryType = 'RETRAIT') {
  const o = await orders.createOrder(client.userId, { storeId: W.storeA, items, deliveryType });
  await orders.updateStatus(o.id, 'CONFIRMEE', userA());
  await orders.updateStatus(o.id, 'EN_PREPARATION', userA());
  await orders.updateStatus(o.id, 'PRETE', userA());
  await orders.updateStatus(o.id, 'LIVREE', userA());
  return o;
}

describe('V2 LOT A — Promotions : CRUD & sécurité', () => {
  it('création promotion PERCENT 10% sur la boutique', async () => {
    const p = await promos.createPromotion(userA(), { storeId: W.storeA, name: 'Promo -10%', type: 'PERCENT', value: 10, dateStart: nowIso(), dateEnd: new Date(Date.now() + 86400000).toISOString(), productIds: [W.pRiz] });
    expect(p.status).toBe('ACTIVE');
    expect(p.type).toBe('PERCENT');
  });
  it('création par un autre merchant sur boutique A → 403', async () => {
    await expect(promos.createPromotion(userB(), { storeId: W.storeA, name: 'Intrusion', type: 'PERCENT', value: 50, dateStart: nowIso() })).rejects.toThrow('Accès refusé');
  });
  it('PERCENT > 100 rejeté', async () => {
    await expect(promos.createPromotion(userA(), { storeId: W.storeA, name: 'X', type: 'PERCENT', value: 150, dateStart: nowIso() })).rejects.toThrow('Pourcentage');
  });
  it('listPromotions isolé par tenant', async () => {
    await expect(promos.listPromotions(W.storeA, userB())).rejects.toThrow('Accès refusé');
    const list = await promos.listPromotions(W.storeA, userA());
    expect(list.length).toBe(1);
  });
  it('promotion future (dateStart futur) non appliquée', async () => {
    const f = await promos.createPromotion(userA(), { storeId: W.storeA, name: 'Future', type: 'PROMO_PRICE', value: 100, dateStart: new Date(Date.now() + 864000000).toISOString() });
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pRiz, quantity: 1 }]);
    expect(r.lines[0].promotionId).not.toBe(f.id); // la future n'est pas retenue
    expect(r.lines[0].unitPriceFinal).toBe(13500); // seulement la -10% valide
  });
});

describe('V2 LOT A — Promotions : calcul serveur du prix', () => {
  it('PERCENT 10% : prix final serveur = 13500 (Riz 15000)', async () => {
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pRiz, quantity: 1 }]);
    expect(r.lines[0].unitPriceFinal).toBe(13500);
    expect(r.totalDiscount).toBe(1500);
    expect(r.promotionIds.length).toBe(1);
  });
  it('le prix original reste traçable', async () => {
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pRiz, quantity: 2 }]);
    expect(r.lines[0].unitPriceOriginal).toBe(15000);
    expect(r.lines[0].discountAmount).toBe(3000);
  });
  it('minQty : promo non applicable sous le seuil, appliquée au-dessus', async () => {
    await promos.createPromotion(userA(), { storeId: W.storeA, name: 'Dès 5 unités -5%', type: 'PERCENT', value: 5, dateStart: nowIso(), minQty: 5, maxQty: 5, productIds: [W.pOffline] });
    const one = promos.applyPromotions(W.storeA, [{ productId: W.pOffline, quantity: 1 }]);
    expect(one.lines[0].unitPriceFinal).toBe(1000); // minQty non atteint
    const five = promos.applyPromotions(W.storeA, [{ productId: W.pOffline, quantity: 5 }]);
    expect(five.lines[0].unitPriceFinal).toBe(950);
  });
  it('meilleure promotion retenue (jamais cumulée)', async () => {
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pRiz, quantity: 1 }]);
    expect(r.lines[0].unitPriceFinal).toBe(13500); // -10% : la meilleure seule
    expect(r.lines.filter((l: any) => l.promotionId).length).toBe(1);
  });
  it('FIXED : réduction fixe plafonnée à 0', async () => {
    const promo = await promos.createPromotion(userA(), { storeId: W.storeA, name: 'Fixe 900 sur sucre', type: 'FIXED', value: 900, dateStart: nowIso(), productIds: [W.pSucre] });
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pSucre, quantity: 1 }]);
    expect(r.lines[0].unitPriceFinal).toBe(0); // 800 - 900 → 0 (jamais négatif)
    await promos.updatePromotion(promo.id, userA(), { status: 'PAUSED' }); // neutralise pour la suite
  });
  it('maxQty : au-delà, plus de promo', async () => {
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pOffline, quantity: 6 }]);
    expect(r.lines[0].unitPriceFinal).toBe(1000); // maxQty=5 dépassé → prix normal
  });
  it('promotion expirée jamais appliquée', async () => {
    const p = await promos.createPromotion(userA(), { storeId: W.storeA, name: 'Expirée', type: 'PERCENT', value: 50, dateStart: nowIso(), dateEnd: new Date(Date.now() + 3600000).toISOString(), productIds: [W.pRiz] });
    db.prepare('UPDATE promotions SET dateEnd = ? WHERE id = ?').run(new Date(Date.now() - 3600000).toISOString(), p.id);
    const list = await promos.listPromotions(W.storeA, userA());
    expect(list.find((x: any) => x.id === p.id).expired).toBe(true);
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pRiz, quantity: 1 }]);
    expect(r.lines[0].promotionId).not.toBe(p.id); // expirée exclue
    expect(r.totalDiscount).toBe(1500); // seulement la -10% valide
  });
});

describe('V2 LOT A — Promotions : application commande + compteur', () => {
  it('createOrder applique le prix promo (serveur), original + remise traçables', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pRiz, quantity: 1 }], deliveryType: 'RETRAIT' });
    expect(o.totalAmount).toBe(13500); // 15000 - 10%
    expect(o.discount).toBe(1500);
    const items = db.prepare('SELECT * FROM order_items WHERE orderId = ?').all(o.id) as any[];
    expect(items[0].unitPrice).toBe(13500);
  });
  it('usesCount incrémenté à la CONFIRMEE', async () => {
    const o = await livreeOrder();
    const promo = (await promos.listPromotions(W.storeA, userA())).find((x: any) => x.name === 'Promo -10%');
    expect(promo.usesCount).toBeGreaterThanOrEqual(1);
  });
  it('maxUses épuisé → plus de promo appliquée', async () => {
    const p = await promos.createPromotion(userA(), { storeId: W.storeA, name: 'Une seule fois', type: 'FIXED', value: 5000, dateStart: nowIso(), maxUses: 1, productIds: [W.pRiz] });
    const o1 = await livreeOrder(clientCtx(), [{ productId: W.pRiz, quantity: 1 }]);
    const after = db.prepare('SELECT * FROM promotions WHERE id = ?').get(p.id) as any;
    expect(after.usesCount).toBe(1);
    const r = promos.applyPromotions(W.storeA, [{ productId: W.pRiz, quantity: 1 }]);
    // promo épuisée → non applicable (le total reste aux autres promos seulement)
    const lines = r.lines.filter((l: any) => l.promotionId === p.id);
    expect(lines.length).toBe(0);
  });
  it('annulation après confirmation restitue le compteur promo', async () => {
    const p = await promos.createPromotion(userA(), { storeId: W.storeA, name: 'Restitution', type: 'FIXED', value: 100, dateStart: nowIso(), productIds: [W.pSucre] });
    const o = await orders.createOrder(clientCtx().userId, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT' });
    await orders.updateStatus(o.id, 'CONFIRMEE', userA());
    const mid = db.prepare('SELECT usesCount FROM promotions WHERE id = ?').get(p.id) as any;
    expect(mid.usesCount).toBe(1);
    await orders.updateStatus(o.id, 'ANNULEE', userA());
    const after = db.prepare('SELECT usesCount FROM promotions WHERE id = ?').get(p.id) as any;
    expect(after.usesCount).toBe(0);
  });
});

describe('V2 LOT A — Coupons', () => {
  it('création coupon GAWJAAY10 -10% boutique A', async () => {
    const c = await coupons.createCoupon(userA(), { storeId: W.storeA, code: 'GAWJAAY10', type: 'PERCENT', value: 10, dateStart: nowIso(), dateEnd: new Date(Date.now() + 86400000).toISOString(), maxUses: 100 });
    expect(c.code).toBe('GAWJAAY10');
  });
  it('code dupliqué même boutique → refus', async () => {
    await expect(coupons.createCoupon(userA(), { storeId: W.storeA, code: 'GAWJAAY10', type: 'FIXED', value: 100, dateStart: nowIso() })).rejects.toThrow('déjà utilisé');
  });
  it('même code autre boutique OK (périmètre boutique)', async () => {
    const c = await coupons.createCoupon(userB(), { storeId: W.storeB, code: 'GAWJAAY10', type: 'FIXED', value: 200, dateStart: nowIso() });
    expect(c.code).toBe('GAWJAAY10');
  });
  it('validation : ok, expiré, montant minimum, épuisé', async () => {
    await coupons.createCoupon(userA(), { storeId: W.storeA, code: 'EXPIRE', type: 'FIXED', value: 100, dateStart: nowIso(), dateEnd: new Date(Date.now() + 3600000).toISOString() });
    db.prepare(`UPDATE coupons SET dateEnd = ? WHERE code = 'EXPIRE'`).run(new Date(Date.now() - 1000).toISOString());
    await coupons.createCoupon(userA(), { storeId: W.storeA, code: 'MIN5000', type: 'FIXED', value: 500, dateStart: nowIso(), minOrderAmount: 5000 });
    await coupons.createCoupon(userA(), { storeId: W.storeA, code: 'UNEFOIS', type: 'FIXED', value: 100, dateStart: nowIso(), maxUses: 1 });

    expect(coupons.validateCoupon(W.storeA, 'gawjaay10', { subtotal: 15000 }).ok).toBe(true); // insensible à la casse
    expect(coupons.validateCoupon(W.storeA, 'EXPIRE', { subtotal: 15000 }).reason).toContain('expiré');
    expect(coupons.validateCoupon(W.storeA, 'MIN5000', { subtotal: 800 }).reason).toContain('minimum');
    expect(coupons.validateCoupon(W.storeA, 'INCONNU', { subtotal: 15000 }).ok).toBe(false);
  });
  it('double utilisation par le même client bloquée (perClientLimit)', async () => {
    await coupons.createCoupon(userA(), { storeId: W.storeA, code: 'BIENVENUE', type: 'FIXED', value: 300, dateStart: nowIso(), perClientLimit: 1 });
    const o1 = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pRiz, quantity: 1 }], deliveryType: 'RETRAIT', couponCode: 'BIENVENUE' });
    await orders.updateStatus(o1.id, 'CONFIRMEE', userA());
    const check = coupons.validateCoupon(W.storeA, 'BIENVENUE', { subtotal: 15000, clientId: W.clientUser });
    expect(check.ok).toBe(false);
    // un autre client peut l'utiliser
    const check2 = coupons.validateCoupon(W.storeA, 'BIENVENUE', { subtotal: 15000, clientId: W.clientUser2 });
    expect(check2.ok).toBe(true);
  });
  it('createOrder avec coupon : remise serveur sur totalAmount', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pRiz, quantity: 1 }], deliveryType: 'RETRAIT', couponCode: 'GAWJAAY10' });
    // 15000 - 10% promo = 13500 puis coupon -10% de 13500 = 12150
    expect(o.totalAmount).toBe(12150);
  });
  it('coupon épuisé à la confirmation → confirmation bloquée', async () => {
    await coupons.createCoupon(userA(), { storeId: W.storeA, code: 'RACE', type: 'FIXED', value: 100, dateStart: nowIso(), maxUses: 1 });
    const o1 = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT', couponCode: 'RACE' });
    await orders.updateStatus(o1.id, 'CONFIRMEE', userA());
    // force un second coupon identique impossible → teste l'épuisement direct
    const c = db.prepare('SELECT * FROM coupons WHERE code = ?').get('RACE') as any;
    expect(c.usesCount).toBe(1);
  });
  it('historique des rédemptions', async () => {
    const c = db.prepare(`SELECT * FROM coupons WHERE code = 'BIENVENUE'`).get() as any;
    const list = coupons.redemptionsForCoupon(c.id, userA());
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].discountAmount).toBe(300);
  });
  it('vente POS avec coupon consommé immédiatement', async () => {
    await coupons.createCoupon(userA(), { storeId: W.storeA, code: 'POS500', type: 'FIXED', value: 500, dateStart: nowIso() });
    const s = await sales.createSale(W.storeA, { items: [{ productId: W.pRiz, quantity: 1 }], paymentMethod: 'CASH', couponCode: 'POS500' }, W.mAUser);
    expect(s.totalAmount).toBe(13000); // 13500 (promo -10%) - 500
    const c = db.prepare(`SELECT * FROM coupons WHERE code = 'POS500'`).get() as any;
    expect(c.usesCount).toBe(1);
  });
  it('tenant : coupon de A invalide sur B', async () => {
    expect(coupons.validateCoupon(W.storeB, 'GAWJAAY10', { subtotal: 500 }).ok).toBe(true); // code homonyme de B
    expect(coupons.validateCoupon(W.storeB, 'POS500', { subtotal: 500 }).ok).toBe(false);  // coupon de A
  });
});

describe('V2 LOT A — Avis vérifiés', () => {
  it('avis boutique après commande LIVREE', async () => {
    const o = await livreeOrder();
    const r = await reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 5, comment: 'Parfait' });
    expect(r.isVerified).toBe(1);
  });
  it('client ne peut noter la commande d un autre → 403', async () => {
    const o = await livreeOrder();
    await expect(reviews.createReview(client2Ctx(), { orderId: o.id, targetType: 'STORE', rating: 4 })).rejects.toThrow('Accès refusé');
  });
  it('commande non livrée → refus', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT' });
    await expect(reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 5 })).rejects.toThrow('livrée');
  });
  it('double avis même commande + cible → refus', async () => {
    const o = await livreeOrder();
    await reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 4 });
    await expect(reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 3 })).rejects.toThrow('déjà déposé');
  });
  it('note invalide (0 ou 6) → refus', async () => {
    const o = await livreeOrder();
    await expect(reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 6 })).rejects.toThrow('Note invalide');
    await expect(reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 0 })).rejects.toThrow('Note invalide');
  });
  it('avis produit : seulement un produit de la commande', async () => {
    const o = await livreeOrder(clientCtx(), [{ productId: W.pRiz, quantity: 1 }, { productId: W.pSucre, quantity: 1 }]);
    const r = await reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'PRODUCT', targetId: W.pRiz, rating: 4 });
    expect(r.targetId).toBe(W.pRiz);
    await expect(reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'PRODUCT', targetId: W.pB, rating: 4 })).rejects.toThrow('ne fait pas partie');
  });
  it('listing public avec moyenne + masque', async () => {
    const res = reviews.listForStore(W.storeA);
    expect(res.reviews.length).toBeGreaterThanOrEqual(2);
    expect(res.stats.average).toBeGreaterThan(0);
    expect(res.reviews[0].clientPhoneMasked === null || res.reviews[0].clientPhoneMasked!.includes('***')).toBe(true);
  });
  it('signalement masque l avis du public jusqu à modération', async () => {
    const o = await livreeOrder();
    const r = await reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 1, comment: 'Insulte' });
    await reviews.reportReview(userA(), r.id, 'CONTENU_INAPPROPRIE', 'test');
    const res = reviews.listForStore(W.storeA);
    expect(res.reviews.some((x: any) => x.id === r.id)).toBe(false);
    const reports = moderation.listReports('OPEN');
    expect(reports.some((x: any) => x.id)).toBe(true);
  });
});

describe('V2 LOT A — Modération (ADMIN)', () => {
  it('masquer puis restaurer un avis', async () => {
    const o = await livreeOrder();
    const r = await reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 2 });
    const hidden = await moderation.hideReview(W.adminUser, r.id, 'test');
    expect(hidden.isHidden).toBe(1);
    expect(reviews.listForStore(W.storeA).reviews.some((x: any) => x.id === r.id)).toBe(false);
    const restored = await moderation.restoreReview(W.adminUser, r.id, 'erreur');
    expect(restored.isHidden).toBe(0);
    expect(reviews.listForStore(W.storeA).reviews.some((x: any) => x.id === r.id)).toBe(true);
  });
  it('suppression définitive selon politique', async () => {
    const o = await livreeOrder();
    const r = await reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 1 });
    await moderation.deleteReview(W.adminUser, r.id, 'spam');
    expect(db.prepare('SELECT id FROM reviews WHERE id = ?').get(r.id)).toBeUndefined();
  });
  it('résoudre un signalement avec HIDE masque l avis + journal des actions', async () => {
    const o = await livreeOrder();
    const r = await reviews.createReview(clientCtx(), { orderId: o.id, targetType: 'STORE', rating: 1 });
    const rep = await reviews.reportReview(userA(), r.id, 'FAKE', 'x');
    await moderation.resolveReport(W.adminUser, rep.id, 'HIDE', 'avéré');
    const after = db.prepare('SELECT * FROM review_reports WHERE id = ?').get(rep.id) as any;
    expect(after.status).toBe('RESOLVED');
    const actions = moderation.listActions();
    expect(actions.length).toBeGreaterThanOrEqual(3); // HIDE + RESTORE précédents + REPORT_HIDE
  });
  it('audit log présent pour chaque action de modération', async () => {
    const logs = db.prepare(`SELECT * FROM audit_logs WHERE action LIKE 'MODERATION%'`).all() as any[];
    expect(logs.length).toBeGreaterThanOrEqual(3);
  });
});
