import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, createProduct, resetDb, setStock } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe('ventes (POS)', () => {
  it('calcule le total à partir des prix serveur et décrémente le stock', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 2500 });
    await setStock(org, variantId, 10);

    const res = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({
        storeId: org.storeId,
        items: [{ variantId, quantity: 3 }],
        // Le client tente d'imposer un prix : il doit être ignoré.
        unitPrice: 1,
        payments: [{ method: 'CASH', amount: 7500 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(7500);

    const inv = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    expect(inv?.quantity).toBe(7);

    const movement = await prisma.inventoryMovement.findFirst({ where: { variantId, type: 'SALE' } });
    expect(movement?.quantity).toBe(-3);
  });

  it('refuse la vente quand le stock est insuffisant', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 1000 });
    await setStock(org, variantId, 2);

    const res = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 5 }], payments: [] });

    expect(res.status).toBe(409);
    const inv = await prisma.inventory.findFirst({ where: { variantId } });
    expect(inv?.quantity).toBe(2); // inchangé
  });

  it('applique une remise et enregistre un crédit client (reste dû)', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 2000 });
    await setStock(org, variantId, 10);
    const customer = await request(app).post('/api/v1/customers').set(auth(org)).send({ name: 'Client Crédit' });

    const res = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({
        storeId: org.storeId,
        customerId: customer.body.customer.id,
        items: [{ variantId, quantity: 2 }],
        discount: 500,
        payments: [{ method: 'CASH', amount: 1000 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(4000);
    expect(res.body.total).toBe(3500);
    expect(res.body.remaining).toBe(2500);

    // Encaisse le reste dû.
    const collect = await request(app)
      .post(`/api/v1/sales/${res.body.saleId}/payments`)
      .set(auth(org))
      .send({ method: 'CASH', amount: 2500 });
    expect(collect.status).toBe(200);
    expect(collect.body.outstanding).toBe(0);
  });

  it('refuse une vente à crédit sans client identifié', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 1000 });
    await setStock(org, variantId, 5);

    const res = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 1 }], payments: [] });
    expect(res.status).toBe(400);
  });
});

describe('mouvements de stock', () => {
  it('historise chaque mouvement et bloque le stock négatif', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org);
    await setStock(org, variantId, 5);

    const out = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(org))
      .send({ storeId: org.storeId, variantId, quantity: 3, type: 'EXIT' });
    expect(out.status).toBe(200);
    expect(out.body.quantity).toBe(2);

    const tooMuch = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(org))
      .send({ storeId: org.storeId, variantId, quantity: 10, type: 'EXIT' });
    expect(tooMuch.status).toBe(409);

    const movements = await prisma.inventoryMovement.count({ where: { variantId } });
    expect(movements).toBe(2); // INITIAL + EXIT
  });

  it('transfère du stock entre deux boutiques de la même organisation', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org);
    await setStock(org, variantId, 10);
    // Le plan FREE limite à une boutique : on insère la seconde directement pour tester le transfert.
    const second = await prisma.store.create({
      data: { organizationId: org.organizationId, name: 'Boutique 2', slug: `boutique-2-${Date.now()}`, isPublic: true },
    });

    const res = await request(app)
      .post('/api/v1/inventory/transfer')
      .set(auth(org))
      .send({ fromStoreId: org.storeId, toStoreId: second.id, variantId, quantity: 4 });
    expect(res.status).toBe(200);

    const from = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    const to = await prisma.inventory.findFirst({ where: { variantId, storeId: second.id } });
    expect(from?.quantity).toBe(6);
    expect(to?.quantity).toBe(4);
  });
});

describe('achats fournisseurs', () => {
  it("n'augmente le stock qu'à la réception", async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org);
    const supplier = await request(app).post('/api/v1/suppliers').set(auth(org)).send({ name: 'Fournisseur X' });

    const purchase = await request(app)
      .post('/api/v1/purchases')
      .set(auth(org))
      .send({ storeId: org.storeId, supplierId: supplier.body.supplier.id, items: [{ variantId, quantity: 50, unitCost: 800 }] });
    expect(purchase.status).toBe(201);

    // Pas encore de stock.
    let inv = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    expect(inv?.quantity ?? 0).toBe(0);

    const receive = await request(app).post(`/api/v1/purchases/${purchase.body.purchase.id}/receive`).set(auth(org));
    expect(receive.status).toBe(200);

    inv = await prisma.inventory.findFirst({ where: { variantId, storeId: org.storeId } });
    expect(inv?.quantity).toBe(50);

    // Double réception refusée.
    const again = await request(app).post(`/api/v1/purchases/${purchase.body.purchase.id}/receive`).set(auth(org));
    expect(again.status).toBe(409);
  });
});

describe('commandes en ligne', () => {
  it('suit la machine à états et décrémente le stock à la confirmation', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 3000, marketplaceVisible: true });
    await setStock(org, variantId, 10);

    const order = await request(app)
      .post('/api/v1/me/orders')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ storeId: org.storeId, customerName: 'Client', customerPhone: '+221700000000', items: [{ variantId, quantity: 2 }] });
    expect(order.status).toBe(201);
    expect(order.body.total).toBe(6000);

    // Stock pas encore décrémenté.
    let inv = await prisma.inventory.findFirst({ where: { variantId } });
    expect(inv?.quantity).toBe(10);

    const confirm = await request(app).post(`/api/v1/orders/${order.body.orderId}/transition`).set(auth(org)).send({ to: 'CONFIRMED' });
    expect(confirm.status).toBe(200);

    inv = await prisma.inventory.findFirst({ where: { variantId } });
    expect(inv?.quantity).toBe(8);

    // Transition interdite : CONFIRMED -> PENDING.
    const back = await request(app).post(`/api/v1/orders/${order.body.orderId}/transition`).set(auth(org)).send({ to: 'PENDING' });
    expect(back.status).toBe(409);
  });

  it("restitue le stock lors d'une annulation après confirmation", async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 3000 });
    await setStock(org, variantId, 10);

    const order = await request(app)
      .post('/api/v1/me/orders')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ storeId: org.storeId, customerName: 'Client', customerPhone: '+221700000000', items: [{ variantId, quantity: 4 }] });

    await request(app).post(`/api/v1/orders/${order.body.orderId}/transition`).set(auth(org)).send({ to: 'CONFIRMED' });
    await request(app).post(`/api/v1/orders/${order.body.orderId}/cancel`).set(auth(org));

    const inv = await prisma.inventory.findFirst({ where: { variantId } });
    expect(inv?.quantity).toBe(10);
  });
});

describe('paiements', () => {
  it("déclare les paiements en ligne indisponibles et refuse toute charge", async () => {
    const caps = await request(app).get('/api/v1/payments/capabilities');
    expect(caps.status).toBe(200);
    expect(caps.body.onlinePaymentEnabled).toBe(false);
    const cash = caps.body.methods.find((m: { method: string }) => m.method === 'CASH');
    expect(cash.available).toBe(true);
    const wave = caps.body.methods.find((m: { method: string }) => m.method === 'WAVE');
    expect(wave.available).toBe(false);

    const charge = await request(app).post('/api/v1/payments/charge').send({ amount: 1000 });
    expect(charge.status).toBe(503);
  });
});

describe('marketplace publique', () => {
  it('ne liste que les produits visibles avec stock réel', async () => {
    const org = await createOrg();
    const visible = await createProduct(org, { price: 1500, marketplaceVisible: true });
    await createProduct(org, { price: 1500, marketplaceVisible: false });
    await setStock(org, visible.variantId, 3);

    const res = await request(app).get('/api/v1/public/marketplace');
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(visible.productId);
    expect(res.body.items).toHaveLength(1);

    // Le prix d'achat ne doit jamais être exposé.
    expect(JSON.stringify(res.body)).not.toContain('purchasePrice');
  });

  it('expose la vitrine publique sans le prix d\'achat', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 2500, purchasePrice: 900 });
    await setStock(org, variantId, 5);

    const store = await prisma.store.findUnique({ where: { id: org.storeId } });
    const res = await request(app).get(`/api/v1/public/shops/${store!.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.products[0].price).toBe(2500);
    expect(JSON.stringify(res.body)).not.toContain('purchasePrice');
    expect(JSON.stringify(res.body)).not.toContain('"sku"');
  });
});

describe('tableau de bord (données réelles)', () => {
  it('renvoie zéro quand aucune vente réelle n\'existe', async () => {
    const org = await createOrg();
    const res = await request(app).get('/api/v1/reports/dashboard').set(auth(org));
    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(0);
    expect(res.body.salesCount).toBe(0);
    expect(res.body.averageBasket).toBe(0);
    expect(res.body.customersCount).toBe(0);
  });

  it('calcule le CA et la marge réels à partir des ventes enregistrées', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 5000, purchasePrice: 3000 });
    await setStock(org, variantId, 10);
    await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 2 }], payments: [{ method: 'CASH', amount: 10000 }] });

    const res = await request(app).get('/api/v1/reports/dashboard').set(auth(org));
    expect(res.body.revenue).toBe(10000);
    expect(res.body.salesCount).toBe(1);
    expect(res.body.grossMargin).toBe(4000); // (5000-3000)*2
  });
});

describe('limites de plan', () => {
  it('bloque la création de produits au-delà du quota du plan FREE', async () => {
    const org = await createOrg();
    // Le plan FREE autorise un nombre fini de produits : on sature volontairement.
    let lastStatus = 0;
    for (let i = 0; i < 60; i += 1) {
      const res = await request(app).post('/api/v1/products').set(auth(org)).send({
        name: `P${i}`,
        sku: `SKU-LIMIT-${i}`,
        variants: [{ name: 'V', sku: `V-LIMIT-${i}` }],
      });
      lastStatus = res.status;
      if (res.status === 403) break;
    }
    expect(lastStatus).toBe(403);
  });
});
