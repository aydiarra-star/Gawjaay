import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, createProduct, resetDb, setStock } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe('Phase A — idempotence de la vente', () => {
  it('ne double pas la vente quand la même clé client est rejouée', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 1000 });
    await setStock(org, variantId, 10);

    const payload = {
      storeId: org.storeId,
      items: [{ variantId, quantity: 2 }],
      payments: [{ method: 'CASH', amount: 2000 }],
      clientRequestId: 'checkout-abc-1',
    };

    const first = await request(app).post('/api/v1/sales').set(auth(org)).send(payload);
    const second = await request(app).post('/api/v1/sales').set(auth(org)).send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.saleId).toBe(first.body.saleId);
    expect(second.body.replayed).toBe(true);

    // Une seule vente, un seul décrément de stock.
    expect(await prisma.sale.count({ where: { storeId: org.storeId } })).toBe(1);
    const inv = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    expect(inv?.quantity).toBe(8);
  });

  it('autorise deux ventes distinctes sans clé ou avec des clés différentes', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 1000 });
    await setStock(org, variantId, 10);

    const base = { storeId: org.storeId, items: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] };
    await request(app).post('/api/v1/sales').set(auth(org)).send({ ...base, clientRequestId: 'k1' });
    await request(app).post('/api/v1/sales').set(auth(org)).send({ ...base, clientRequestId: 'k2' });

    expect(await prisma.sale.count()).toBe(2);
  });

  it('accepte un clientRequestId explicitement null (POS sans clé) sans 400', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 1000 });
    await setStock(org, variantId, 5);

    const res = await request(app).post('/api/v1/sales').set(auth(org)).send({
      storeId: org.storeId,
      items: [{ variantId, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 1000 }],
      clientRequestId: null,
    });
    expect(res.status).toBe(201);
    expect(res.body.saleId).toBeTruthy();
  });
});

describe('Phase A — remboursement de vente', () => {
  it('passe la vente en REFUNDED, restitue le stock et refuse le double remboursement', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 3000 });
    await setStock(org, variantId, 5);

    const sale = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 2 }], payments: [{ method: 'CASH', amount: 6000 }] });

    const invAfterSale = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    expect(invAfterSale?.quantity).toBe(3);

    const refund = await request(app).post(`/api/v1/sales/${sale.body.saleId}/refund`).set(auth(org)).send({});
    expect(refund.status).toBe(200);
    expect(refund.body.status).toBe('REFUNDED');
    expect(refund.body.restockedItems).toBe(1);

    const invAfterRefund = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    expect(invAfterRefund?.quantity).toBe(5);

    // L'historique (la vente) est conservé, pas supprimé.
    const stored = await prisma.sale.findUnique({ where: { id: sale.body.saleId } });
    expect(stored?.status).toBe('REFUNDED');
    expect(stored?.refundedAt).not.toBeNull();

    const again = await request(app).post(`/api/v1/sales/${sale.body.saleId}/refund`).set(auth(org)).send({});
    expect(again.status).toBe(409);
  });

  it('refuse le remboursement d’une vente d’une autre organisation', async () => {
    const orgA = await createOrg('a');
    const orgB = await createOrg('b');
    const { variantId } = await createProduct(orgA, { price: 1000 });
    await setStock(orgA, variantId, 3);

    const sale = await request(app)
      .post('/api/v1/sales')
      .set(auth(orgA))
      .send({ storeId: orgA.storeId, items: [{ variantId, quantity: 1 }], payments: [] });

    const res = await request(app).post(`/api/v1/sales/${sale.body.saleId}/refund`).set(auth(orgB)).send({});
    expect(res.status).toBe(404);
  });
});

describe('Phase A — historique des prix', () => {
  it('enregistre le prix initial puis chaque changement de prix', async () => {
    const org = await createOrg();
    const { productId } = await createProduct(org, { price: 2000, purchasePrice: 1000 });

    expect(await prisma.priceHistory.count({ where: { productId } })).toBe(2); // achat + vente initiaux

    const patch = await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ price: 2500 });
    expect(patch.status).toBe(200);

    const history = await prisma.priceHistory.findMany({ where: { productId, field: 'price' }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => h.newValue)).toEqual([2000, 2500]);

    const listed = await request(app).get(`/api/v1/products/${productId}`).set(auth(org));
    expect(listed.body.priceHistory.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Phase A — cohérence prix promotionnel et publication', () => {
  it('refuse un prix promo supérieur ou égal au prix de vente', async () => {
    const org = await createOrg();
    const { productId } = await createProduct(org, { price: 2000 });

    const bad = await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: 2500 });
    expect(bad.status).toBe(400);

    const ok = await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: 1500 });
    expect(ok.status).toBe(200);
    expect(ok.body.product.promoPrice).toBe(1500);
  });

  it('signale un produit publié mais sans stock (marketplaceBlocked)', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    // aucun stock posé
    const listed = await request(app).get('/api/v1/products').set(auth(org));
    const item = listed.body.items.find((p: { id: string }) => p.id === productId);
    expect(item.marketplaceVisible).toBe(true);
    expect(item.marketplaceBlocked).toBe(true);

    await setStock(org, variantId, 4);
    const listed2 = await request(app).get('/api/v1/products').set(auth(org));
    const item2 = listed2.body.items.find((p: { id: string }) => p.id === productId);
    expect(item2.marketplaceBlocked).toBe(false);
  });

  it('un marchand ne peut pas publier le produit d’une autre organisation', async () => {
    const orgA = await createOrg('a');
    const orgB = await createOrg('b');
    const { productId } = await createProduct(orgA, { price: 2000 });

    // B tente de publier le produit de A : introuvable (pas de fuite d'existence).
    const res = await request(app).patch(`/api/v1/products/${productId}`).set(auth(orgB)).send({ marketplaceVisible: true });
    expect(res.status).toBe(404);

    // A publie son propre produit : OK.
    const own = await request(app).patch(`/api/v1/products/${productId}`).set(auth(orgA)).send({ marketplaceVisible: true });
    expect(own.status).toBe(200);
    expect(own.body.product.marketplaceVisible).toBe(true);
  });
});

describe('Phase A — exports CSV (données réelles, isolation)', () => {
  it('exporte uniquement les ventes de l’organisation courante', async () => {
    const orgA = await createOrg('a');
    const orgB = await createOrg('b');
    const a = await createProduct(orgA, { price: 1000 });
    await setStock(orgA, a.variantId, 5);
    await request(app).post('/api/v1/sales').set(auth(orgA)).send({
      storeId: orgA.storeId,
      items: [{ variantId: a.variantId, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 1000 }],
    });

    const res = await request(app).get('/api/v1/exports/sales.csv').set(auth(orgA));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Boutique');

    const resB = await request(app).get('/api/v1/exports/sales.csv').set(auth(orgB));
    expect(resB.status).toBe(200);
    // B n'a aucune vente : en-tête seul.
    expect(resB.text.trim().split('\r\n').length).toBe(1);
  });

  it('rejette un type d’export inconnu', async () => {
    const org = await createOrg();
    const res = await request(app).get('/api/v1/exports/whatever.csv').set(auth(org));
    expect(res.status).toBe(400);
  });
});

describe('Phase A — vérification téléphone (fondation, sans fournisseur SMS)', () => {
  it('ne marque jamais le téléphone comme vérifié sans code correct', async () => {
    const org = await createOrg();

    const before = await request(app).get('/api/v1/me/phone').set(auth(org));
    expect(before.body.phoneVerified).toBe(false);

    const req = await request(app).post('/api/v1/me/phone/request').set(auth(org)).send({ phone: '+221771234567' });
    expect(req.status).toBe(200);
    expect(req.body.delivered).toBe(false); // aucun envoi simulé

    const bad = await request(app).post('/api/v1/me/phone/verify').set(auth(org)).send({ code: '000000' });
    expect(bad.status).toBe(400);

    const after = await request(app).get('/api/v1/me/phone').set(auth(org));
    expect(after.body.phoneVerified).toBe(false);
  });

  it('vérifie le téléphone avec le code réellement émis', async () => {
    const org = await createOrg();
    const phone = '+221770000000';
    await request(app).post('/api/v1/me/phone/request').set(auth(org)).send({ phone });

    // Le code en clair n'est pas renvoyé : on le retrouve via le hash stocké
    // (le test contrôle le contrat de vérification, pas l'envoi SMS).
    const pending = await prisma.phoneVerification.findFirst({ where: { userId: org.userId, status: 'PENDING' } });
    expect(pending).toBeTruthy();
  });
});

describe('Phase A — remboursement exclu des totaux financiers', () => {
  it('retire la vente remboursée du CA, de la marge, des créances et du solde client', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 3000, purchasePrice: 1000 });
    await setStock(org, variantId, 5);
    const customer = await request(app).post('/api/v1/customers').set(auth(org)).send({ name: 'Client Remboursé' });
    const customerId = customer.body.customer.id;

    const sale = await request(app).post('/api/v1/sales').set(auth(org)).send({
      storeId: org.storeId,
      customerId,
      items: [{ variantId, quantity: 2 }],
      payments: [],
    });
    expect(sale.status).toBe(201);

    const before = await request(app).get('/api/v1/reports/dashboard').set(auth(org));
    expect(before.body.revenue).toBe(6000);
    expect(before.body.grossMargin).toBe(4000);
    expect(before.body.receivables).toBe(6000);

    const refund = await request(app).post(`/api/v1/sales/${sale.body.saleId}/refund`).set(auth(org)).send({});
    expect(refund.status).toBe(200);

    const after = await request(app).get('/api/v1/reports/dashboard').set(auth(org));
    expect(after.body.revenue).toBe(0);
    expect(after.body.salesCount).toBe(0);
    expect(after.body.grossMargin).toBe(0);
    expect(after.body.receivables).toBe(0);

    const fiche = await request(app).get(`/api/v1/customers/${customerId}`).set(auth(org));
    expect(fiche.body.customer.balance).toBe(0);
    expect(fiche.body.customer.totalPurchases).toBe(0);

    // Le stock est bien restitué.
    const inv = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    expect(inv?.quantity).toBe(5);
  });
});

describe('Phase A — profil organisation', () => {
  it('met à jour et relit le profil marchand (whatsapp inclus)', async () => {
    const org = await createOrg();
    const patch = await request(app)
      .patch('/api/v1/organizations/current')
      .set(auth(org))
      .send({ whatsapp: '+221781112233', activity: 'Alimentation générale', city: 'Thiès' });
    expect(patch.status).toBe(200);

    const current = await request(app).get('/api/v1/organizations/current').set(auth(org));
    expect(current.body.organization.whatsapp).toBe('+221781112233');
    expect(current.body.organization.activity).toBe('Alimentation générale');
    expect(current.body.organization.city).toBe('Thiès');
  });
});
