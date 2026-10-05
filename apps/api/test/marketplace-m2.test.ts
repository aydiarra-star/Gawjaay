import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, createProduct, resetDb, setStock, type TestOrg } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

/** Rend la boutique publique et géolocalisée (pour la marketplace). */
async function publishStore(org: TestOrg, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .patch(`/api/v1/stores/${org.storeId}`)
    .set(auth(org))
    .send({ isPublic: true, city: 'Dakar', region: 'Dakar', ...overrides });
  expect(res.status).toBe(200);
}

/** Crée un profil vendeur pour l'utilisateur d'une organisation (MERCHANT/BUSINESS). */
async function createSeller(org: TestOrg, sellerType: 'INDIVIDUAL' | 'MERCHANT' | 'BUSINESS', body: Record<string, unknown> = {}) {
  // L'inscription BUSINESS crée désormais automatiquement un profil MERCHANT.
  // Les tests Marketplace veulent piloter explicitement le type du profil : on remplace
  // le profil d'inscription avant d'exercer l'endpoint POST /sellers.
  await prisma.sellerProfile.deleteMany({ where: { userId: org.userId } });
  const res = await request(app)
    .post('/api/v1/sellers')
    .set({ Authorization: `Bearer ${org.token}` })
    .send({ sellerType, displayName: `Vendeur ${sellerType}`, organizationId: org.organizationId, ...body });
  return res;
}

// ─────────────────────────────── PRIX (coffre-fort) ───────────────────────────────

describe('M2 — cohérence du prix (resolveUnitPrice)', () => {
  it('applique le MÊME prix promo au POS, à la commande, à la vente rapide, à la marketplace et à la vitrine', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 12000, marketplaceVisible: true });
    // Le produit porte un prix promo réel (11 000 < 12 000).
    const patch = await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: 11000 });
    expect(patch.status).toBe(200);
    await setStock(org, variantId, 10);
    await publishStore(org);

    // 1. POS
    const sale = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 11000 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.total).toBe(11000);

    // 2. Commande en ligne
    const order = await request(app)
      .post('/api/v1/me/orders')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ storeId: org.storeId, customerName: 'Client', customerPhone: '+221700000000', items: [{ variantId, quantity: 1 }] });
    expect(order.status).toBe(201);
    expect(order.body.total).toBe(11000);

    // 3. Vente rapide depuis la fiche produit
    const quick = await request(app).post(`/api/v1/products/${productId}/sale`).set(auth(org)).send({ quantity: 1 });
    expect(quick.status).toBe(201);
    expect(quick.body.total).toBe(11000);

    // 4. Marketplace
    const market = await request(app).get('/api/v1/public/marketplace');
    const item = market.body.items.find((i: { id: string }) => i.id === productId);
    expect(item.price).toBe(11000);
    expect(item.originalPrice).toBe(12000);
    expect(item.offers[0].price).toBe(11000);

    // 5. Vitrine publique
    const store = await prisma.store.findUnique({ where: { id: org.storeId } });
    const shop = await request(app).get(`/api/v1/public/shops/${store!.slug}`);
    const shopProduct = shop.body.products.find((p: { id: string }) => p.id === productId);
    expect(shopProduct.price).toBe(11000);
    expect(shopProduct.originalPrice).toBe(12000);
  });

  it('donne la priorité au prix de variante et n\'y applique PAS la promo produit', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 12000, marketplaceVisible: true });
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: 11000 });
    // La variante fixe son propre prix commercial : autoritaire, hors promo produit.
    await prisma.productVariant.update({ where: { id: variantId }, data: { price: 9000 } });
    await setStock(org, variantId, 5);
    await publishStore(org);

    const sale = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 9000 }] });
    expect(sale.body.total).toBe(9000);

    const market = await request(app).get('/api/v1/public/marketplace');
    const item = market.body.items.find((i: { id: string }) => i.id === productId);
    expect(item.price).toBe(9000);
    expect(item.originalPrice).toBeNull();
  });

  it('n\'affiche aucune fausse promotion quand le prix promo est absent ou incohérent', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 5000, marketplaceVisible: true });
    await setStock(org, variantId, 3);
    await publishStore(org);

    const market = await request(app).get('/api/v1/public/marketplace');
    const item = market.body.items.find((i: { id: string }) => i.id === productId);
    expect(item.price).toBe(5000);
    expect(item.originalPrice).toBeNull();
  });

  it('historise les changements de prix promotionnel (promoPrice) sans réécrire les ventes', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 12000, purchasePrice: 9000 });
    await setStock(org, variantId, 5);

    // Vente au prix normal 12 000.
    const sale = await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 1 }], payments: [{ method: 'CASH', amount: 12000 }] });
    const item = await prisma.saleItem.findFirst({ where: { saleId: sale.body.saleId } });
    expect(item?.unitPrice).toBe(12000);

    // Définition puis retrait d'une promo.
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: 10000 });
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: null });

    const promoHistory = await prisma.priceHistory.findMany({ where: { productId, field: 'promoPrice' }, orderBy: { createdAt: 'asc' } });
    expect(promoHistory.map((h) => [h.oldValue, h.newValue])).toEqual([
      [null, 10000],
      [10000, null],
    ]);

    // La vente passée reste figée au prix d'alors.
    const still = await prisma.saleItem.findFirst({ where: { saleId: sale.body.saleId } });
    expect(still?.unitPrice).toBe(12000);
  });

  it('fige la marge : changer le prix après une vente ne réécrit pas la vente', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 5000, purchasePrice: 3000 });
    await setStock(org, variantId, 10);
    await request(app)
      .post('/api/v1/sales')
      .set(auth(org))
      .send({ storeId: org.storeId, items: [{ variantId, quantity: 2 }], payments: [{ method: 'CASH', amount: 10000 }] });

    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ price: 8000 });

    const dash = await request(app).get('/api/v1/reports/dashboard').set(auth(org));
    expect(dash.body.revenue).toBe(10000);
    expect(dash.body.grossMargin).toBe(4000); // (5000-3000)*2, inchangé
  });
});

// ─────────────────────────────── SELLER PROFILE ───────────────────────────────

describe('M2 — profil vendeur', () => {
  it('crée un vendeur INDIVIDUAL sans organisation', async () => {
    const org = await createOrg();
    const res = await request(app)
      .post('/api/v1/sellers')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ sellerType: 'INDIVIDUAL', displayName: 'Awa Particulier', city: 'Thiès' });
    expect(res.status).toBe(201);
    expect(res.body.seller.sellerType).toBe('INDIVIDUAL');
    expect(res.body.seller.organizationId).toBeNull();
    expect(res.body.seller.status).toBe('ACTIVE');
  });

  it('exige une organisation pour MERCHANT et la vérifie (membre actif)', async () => {
    const org = await createOrg();
    // Sans organisation : refus.
    const bad = await request(app)
      .post('/api/v1/sellers')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ sellerType: 'MERCHANT', displayName: 'Commerçant sans org' });
    expect(bad.status).toBe(400);

    // Avec une organisation dont je ne suis pas membre : refus.
    const other = await createOrg('other');
    const forbidden = await request(app)
      .post('/api/v1/sellers')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ sellerType: 'MERCHANT', displayName: 'Commerçant', organizationId: other.organizationId });
    expect(forbidden.status).toBe(403);

    // Avec ma propre organisation : OK.
    const ok = await createSeller(org, 'MERCHANT');
    expect(ok.status).toBe(201);
    expect(ok.body.seller.sellerType).toBe('MERCHANT');
    expect(ok.body.seller.organizationId).toBe(org.organizationId);
  });

  it('crée un vendeur BUSINESS rattaché à son organisation', async () => {
    const org = await createOrg();
    const res = await createSeller(org, 'BUSINESS');
    expect(res.status).toBe(201);
    expect(res.body.seller.sellerType).toBe('BUSINESS');
  });

  it('refuse un second profil vendeur pour le même compte', async () => {
    const org = await createOrg();
    await createSeller(org, 'INDIVIDUAL');
    const dup = await request(app)
      .post('/api/v1/sellers')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ sellerType: 'INDIVIDUAL', displayName: 'Doublon' });
    expect(dup.status).toBe(409);
  });

  it('empêche un vendeur de modifier le profil d\'un autre (ownership)', async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    const sellerB = await createSeller(b, 'INDIVIDUAL');
    const res = await request(app)
      .patch(`/api/v1/sellers/${sellerB.body.seller.id}`)
      .set({ Authorization: `Bearer ${a.token}` })
      .send({ displayName: 'Piraté' });
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────── LISTING ───────────────────────────────

describe('M2 — annonces (listing)', () => {
  it('un MERCHANT publie une annonce référençant un produit réel de son organisation', async () => {
    const org = await createOrg();
    await createSeller(org, 'MERCHANT');
    const { productId } = await createProduct(org, { price: 14000 });

    const res = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Riz 50 kg', productId, fulfillment: 'PICKUP' });
    expect(res.status).toBe(201);
    expect(res.body.listing.productId).toBe(productId);
    expect(res.body.listing.organizationId).toBe(org.organizationId);
    expect(res.body.listing.price).toBeNull();
    expect(res.body.listing.quantity).toBeNull();
  });

  it('refuse un prix/quantité parallèles sur une annonce commerçant', async () => {
    const org = await createOrg();
    await createSeller(org, 'MERCHANT');
    const { productId } = await createProduct(org, { price: 14000 });
    const res = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Riz', productId, price: 9999, quantity: 5 });
    expect(res.status).toBe(400);
  });

  it('refuse une annonce commerçant sans produit du catalogue', async () => {
    const org = await createOrg();
    await createSeller(org, 'MERCHANT');
    const res = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Article libre' });
    expect(res.status).toBe(400);
  });

  it('refuse de référencer le produit d\'une autre organisation (isolation)', async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    await createSeller(b, 'MERCHANT');
    const { productId } = await createProduct(a, { price: 14000 });

    const res = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${b.token}` })
      .send({ title: 'Riz volé', productId });
    expect(res.status).toBe(404);
  });

  it('un INDIVIDUAL publie un article hors catalogue avec prix et quantité explicites', async () => {
    const org = await createOrg();
    await createSeller(org, 'INDIVIDUAL');
    const res = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Téléphone occasion', price: 45000, quantity: 1, condition: 'USED' });
    expect(res.status).toBe(201);
    expect(res.body.listing.price).toBe(45000);
    expect(res.body.listing.quantity).toBe(1);
    expect(res.body.listing.productId).toBeNull();
  });

  it('refuse une annonce INDIVIDUAL référençant un produit ou sans prix/quantité', async () => {
    const org = await createOrg();
    await createSeller(org, 'INDIVIDUAL');
    const { productId } = await createProduct(org, { price: 14000 });

    const withProduct = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Annonce', productId, price: 100, quantity: 1 });
    expect(withProduct.status).toBe(400);

    const missing = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Annonce sans prix' });
    expect(missing.status).toBe(400);
  });

  it('empêche un vendeur de lire ou modifier l\'annonce d\'un autre', async () => {
    const a = await createOrg('a');
    const b = await createOrg('b');
    await createSeller(a, 'INDIVIDUAL');
    await createSeller(b, 'INDIVIDUAL');

    const created = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${a.token}` })
      .send({ title: 'Article A', price: 1000, quantity: 1 });
    expect(created.status).toBe(201);
    const listingId = created.body.listing.id;

    const read = await request(app).get(`/api/v1/listings/${listingId}`).set({ Authorization: `Bearer ${b.token}` });
    expect(read.status).toBe(404);

    const patch = await request(app).patch(`/api/v1/listings/${listingId}`).set({ Authorization: `Bearer ${b.token}` }).send({ title: 'Piraté' });
    expect(patch.status).toBe(404);

    const del = await request(app).delete(`/api/v1/listings/${listingId}`).set({ Authorization: `Bearer ${b.token}` });
    expect(del.status).toBe(404);

    // L'annonce de A reste intacte.
    const still = await prisma.listing.findUnique({ where: { id: listingId } });
    expect(still?.title).toBe('Article A');
    expect(still?.status).toBe('ACTIVE');
  });

  it('désactive une annonce sans la supprimer (aucune destruction)', async () => {
    const org = await createOrg();
    await createSeller(org, 'INDIVIDUAL');
    const created = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Article', price: 1000, quantity: 1 });
    const id = created.body.listing.id;

    const del = await request(app).delete(`/api/v1/listings/${id}`).set({ Authorization: `Bearer ${org.token}` });
    expect(del.status).toBe(200);

    const row = await prisma.listing.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('INACTIVE');
  });

  it('un INDIVIDUAL ne peut pas créer d\'annonce sans profil vendeur', async () => {
    const org = await createOrg();
    const res = await request(app)
      .post('/api/v1/listings')
      .set({ Authorization: `Bearer ${org.token}` })
      .send({ title: 'Article', price: 1000, quantity: 1 });
    expect(res.status).toBe(403);
  });
});
