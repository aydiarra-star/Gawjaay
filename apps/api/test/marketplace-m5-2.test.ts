import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, createProduct, resetDb, setStock } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe('M5.2 — profil vendeur public et annonces actives', () => {
  it('retourne les annonces actives d’un vendeur sans données privées ni GPS', async () => {
    const org = await createOrg('seller-public');
    const seller = await request(app)
      .post('/api/v1/sellers')
      .set(auth(org))
      .send({
        sellerType: 'MERCHANT',
        displayName: 'Commerce Dakar',
        bio: 'Commerce de proximité',
        phone: '+221770000000',
        city: 'Dakar',
        region: 'Dakar',
        organizationId: org.organizationId,
      });
    expect(seller.status).toBe(201);
    const sellerId = seller.body.seller.id as string;

    const product = await createProduct(org, { price: 1500, marketplaceVisible: true });
    await setStock(org, product.variantId, 7);

    const listing = await request(app)
      .post('/api/v1/listings')
      .set(auth(org))
      .send({
        title: 'Riz local',
        description: 'Sac de riz',
        productId: product.productId,
        variantId: product.variantId,
        storeId: org.storeId,
        fulfillment: 'PICKUP',
      });
    expect(listing.status).toBe(201);

    const hiddenProduct = await createProduct(org, { price: 900, marketplaceVisible: true });
    await setStock(org, hiddenProduct.variantId, 2);
    const hidden = await request(app)
      .post('/api/v1/listings')
      .set(auth(org))
      .send({
        title: 'Annonce masquée',
        description: 'Ne doit pas apparaître',
        productId: hiddenProduct.productId,
        variantId: hiddenProduct.variantId,
        storeId: org.storeId,
        fulfillment: 'PICKUP',
      });
    expect(hidden.status).toBe(201);
    await request(app).delete(`/api/v1/listings/${hidden.body.listing.id}`).set(auth(org));

    const res = await request(app).get(`/api/v1/public/sellers/${sellerId}`);
    expect(res.status).toBe(200);
    expect(res.body.seller.id).toBe(sellerId);
    expect(res.body.seller.sellerType).toBe('MERCHANT');
    expect(res.body.seller.activeListings).toBe(1);
    expect(res.body.seller.listings).toHaveLength(1);
    expect(res.body.seller.listings[0]).toMatchObject({
      title: 'Riz local',
      description: 'Sac de riz',
      price: 1500,
      fulfillment: 'PICKUP',
    });

    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('+221770000000');
    expect(raw).not.toContain(org.email);
    expect(raw).not.toContain('organizationId');
    expect(raw).not.toContain('userId');
    expect(raw).not.toContain('passwordHash');
    expect(raw).not.toMatch(/latitude|longitude/);
    expect(raw).not.toMatch(/verified|rating|review/i);
  });

  it('ne renvoie que les annonces actives et conserve l’état sans modifier le domaine', async () => {
    const org = await createOrg('seller-active');
    const seller = await request(app)
      .post('/api/v1/sellers')
      .set(auth(org))
      .send({
        sellerType: 'INDIVIDUAL',
        displayName: 'Vendeur indépendant',
        city: 'Thiès',
        region: 'Thiès',
      });
    expect(seller.status).toBe(201);
    const sellerId = seller.body.seller.id as string;

    const a = await request(app)
      .post('/api/v1/listings')
      .set(auth(org))
      .send({ title: 'Article actif', price: 2000, quantity: 2, fulfillment: 'PICKUP', city: 'Thiès', region: 'Thiès' });
    expect(a.status).toBe(201);

    const b = await request(app)
      .post('/api/v1/listings')
      .set(auth(org))
      .send({ title: 'Article à masquer', price: 3000, quantity: 1, fulfillment: 'DELIVERY', city: 'Thiès', region: 'Thiès' });
    expect(b.status).toBe(201);
    await request(app).delete(`/api/v1/listings/${b.body.listing.id}`).set(auth(org));

    const res = await request(app).get(`/api/v1/public/sellers/${sellerId}`);
    expect(res.status).toBe(200);
    expect(res.body.seller.activeListings).toBe(1);
    expect(res.body.seller.listings.map((x: { title: string }) => x.title)).toEqual(['Article actif']);

    const stored = await prisma.listing.findUnique({ where: { id: a.body.listing.id } });
    expect(stored?.status).toBe('ACTIVE');
  });
});
