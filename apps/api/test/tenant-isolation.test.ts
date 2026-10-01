import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, createProduct, resetDb, setStock } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

/**
 * Isolation multi-tenant : c'est le test de sécurité le plus important du produit.
 * L'organisation B ne doit JAMAIS pouvoir lire ni modifier les données de A.
 */
describe('isolation multi-tenant', () => {
  it("refuse l'accès aux produits d'une autre organisation", async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    const { productId } = await createProduct(a);

    const res = await request(app).get(`/api/v1/products/${productId}`).set(auth(b));
    expect(res.status).toBe(404);
  });

  it("masque les produits de A dans la liste de B", async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    await createProduct(a);
    await createProduct(b);

    const listB = await request(app).get('/api/v1/products').set(auth(b));
    expect(listB.status).toBe(200);
    expect(listB.body.items.every((p: { organizationId: string }) => p.organizationId === b.organizationId)).toBe(true);
    expect(listB.body.total).toBe(1);
  });

  it("refuse d'ajuster le stock d'une variante d'une autre organisation", async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    const { variantId } = await createProduct(a);

    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(b))
      .send({ storeId: b.storeId, variantId, quantity: 5, type: 'ENTRY' });
    expect(res.status).toBe(404);
  });

  it("refuse l'accès à la boutique d'une autre organisation", async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    const { variantId } = await createProduct(a);

    // B tente d'écrire dans la boutique de A.
    const res = await request(app)
      .post('/api/v1/inventory/adjust')
      .set(auth(b))
      .send({ storeId: a.storeId, variantId, quantity: 5, type: 'ENTRY' });
    expect(res.status).toBe(404);
  });

  it("refuse l'accès aux clients d'une autre organisation", async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    const created = await request(app).post('/api/v1/customers').set(auth(a)).send({ name: 'Client A', phone: '+221700000000' });
    expect(created.status).toBe(201);

    const res = await request(app).get(`/api/v1/customers/${created.body.customer.id}`).set(auth(b));
    expect(res.status).toBe(404);
  });

  it("ne compte que ses propres ventes dans le tableau de bord", async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    const { variantId } = await createProduct(a, { price: 5000 });
    await setStock(a, variantId, 10);

    await request(app)
      .post('/api/v1/sales')
      .set(auth(a))
      .send({ storeId: a.storeId, items: [{ variantId, quantity: 2 }], payments: [{ method: 'CASH', amount: 10000 }] });

    const dashB = await request(app).get('/api/v1/reports/dashboard').set(auth(b));
    expect(dashB.status).toBe(200);
    expect(dashB.body.revenue).toBe(0);
    expect(dashB.body.salesCount).toBe(0);

    const dashA = await request(app).get('/api/v1/reports/dashboard').set(auth(a));
    expect(dashA.body.revenue).toBe(10000);
    expect(dashA.body.salesCount).toBe(1);
  });

  it("refuse un en-tête d'organisation dont l'utilisateur n'est pas membre", async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    // Le token de B avec l'organisation de A.
    const res = await request(app)
      .get('/api/v1/products')
      .set({ Authorization: `Bearer ${b.token}`, 'x-organization-id': a.organizationId });
    expect(res.status).toBe(403);
  });

  it("exige l'en-tête d'organisation", async () => {
    const a = await createOrg('a');
    const res = await request(app).get('/api/v1/products').set({ Authorization: `Bearer ${a.token}` });
    expect(res.status).toBe(400);
  });
});
