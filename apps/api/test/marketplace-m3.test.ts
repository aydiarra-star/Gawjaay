import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, createProduct, resetDb, setStock, type TestOrg } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';
import { redactUrl } from '../src/middleware/logging.js';
import { parseDiscoveryQuery } from '../src/services/discovery.service.js';
import { boundingBox, haversineKm, normalizeForSearch } from '@gawjaay/shared';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

/** Rend la boutique principale publique et géolocalisée. */
async function publishStore(org: TestOrg, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .patch(`/api/v1/stores/${org.storeId}`)
    .set(auth(org))
    .send({ isPublic: true, city: 'Dakar', region: 'Dakar', latitude: 14.6928, longitude: -17.4467, ...overrides });
  expect(res.status).toBe(200);
}

async function createSeller(org: TestOrg, sellerType: 'INDIVIDUAL' | 'MERCHANT' | 'BUSINESS', body: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/sellers')
    .set({ Authorization: `Bearer ${org.token}` })
    .send({ sellerType, displayName: `Vendeur ${sellerType}`, organizationId: org.organizationId, ...body });
}

/** Crée une seconde boutique rattachée à l'organisation (contourne la limite de plan). */
async function addStore(
  org: TestOrg,
  data: { city?: string; region?: string; latitude?: number; longitude?: number; isPublic?: boolean; isActive?: boolean } = {},
) {
  const slug = `store-${Math.random().toString(36).slice(2, 10)}`;
  return prisma.store.create({
    data: {
      organizationId: org.organizationId,
      name: `Boutique ${slug}`,
      slug,
      isPublic: data.isPublic ?? true,
      isActive: data.isActive ?? true,
      city: data.city ?? 'Dakar',
      region: data.region ?? 'Dakar',
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });
}

/** Fixe le stock d'une variante dans une boutique précise (création directe). */
async function stockIn(storeId: string, variantId: string, quantity: number) {
  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId, variantId } },
    create: { storeId, variantId, quantity },
    update: { quantity },
  });
}

/** Crée un produit publié avec un nom précis, en stock, dans la boutique publique. */
async function publishedProduct(org: TestOrg, name: string, price = 5000, storeId?: string) {
  const res = await request(app)
    .post('/api/v1/products')
    .set(auth(org))
    .send({
      name,
      sku: `SKU-${Math.random().toString(36).slice(2, 10)}`,
      price,
      marketplaceVisible: true,
      variants: [{ name: 'Standard', sku: `V-${Math.random().toString(36).slice(2, 10)}` }],
    });
  expect(res.status).toBe(201);
  const productId = res.body.product.id as string;
  const variantId = res.body.product.variants[0].id as string;
  if (storeId) await stockIn(storeId, variantId, 5);
  else await setStock(org, variantId, 5);
  return { productId, variantId };
}

// ─────────────────────────────── RECHERCHE ───────────────────────────────

describe('M3 — recherche', () => {
  it('est insensible à la casse et aux accents', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz parfumé 50 kg', 14000);
    await publishedProduct(org, 'Piment Séché', 2000);
    await publishStore(org);

    for (const term of ['Riz', 'riz', 'RIZ']) {
      const res = await request(app).get(`/api/v1/public/marketplace?search=${encodeURIComponent(term)}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].name).toBe('Riz parfumé 50 kg');
    }

    // Accents ignorés dans les deux sens.
    const accented = await request(app).get(`/api/v1/public/marketplace?search=${encodeURIComponent('seche')}`);
    expect(accented.body.total).toBe(1);
    expect(accented.body.items[0].name).toBe('Piment Séché');
  });

  it('fait une recherche partielle par préfixe', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz parfumé', 14000);
    await publishStore(org);
    const res = await request(app).get('/api/v1/public/marketplace?search=ri');
    expect(res.body.total).toBe(1);
  });

  it('une recherche vide ne filtre rien et une recherche inconnue ne renvoie rien', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz', 14000);
    await publishedProduct(org, 'Huile', 9000);
    await publishStore(org);

    const empty = await request(app).get('/api/v1/public/marketplace?search=');
    expect(empty.body.total).toBe(2);

    const none = await request(app).get('/api/v1/public/marketplace?search=zzz-introuvable');
    expect(none.body.total).toBe(0);
  });

  it('normalise les accents de façon déterministe (helper partagé)', () => {
    expect(normalizeForSearch('Riz Parfumé')).toBe('riz parfume');
    expect(normalizeForSearch('Piment Séché')).toBe('piment seche');
  });
});

// ─────────────────────────────── FILTRES ───────────────────────────────

describe('M3 — filtres produits', () => {
  it('filtre par catégorie', async () => {
    const org = await createOrg();
    const cat = await prisma.category.create({
      data: { organizationId: org.organizationId, name: 'Céréales', slug: 'cereales' },
    });
    const { productId } = await publishedProduct(org, 'Riz', 14000);
    await publishedProduct(org, 'Savon', 500);
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ categoryId: cat.id });
    await publishStore(org);

    const res = await request(app).get(`/api/v1/public/marketplace?categoryId=${cat.id}`);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(productId);
  });

  it('filtre par région et ville (boutiques publiques actives)', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz', 14000);
    await publishStore(org, { region: 'Dakar', city: 'Dakar' });

    expect((await request(app).get('/api/v1/public/marketplace?region=Dakar')).body.total).toBe(1);
    expect((await request(app).get('/api/v1/public/marketplace?region=Thi%C3%A8s')).body.total).toBe(0);
    expect((await request(app).get('/api/v1/public/marketplace?city=Dakar')).body.total).toBe(1);
    expect((await request(app).get('/api/v1/public/marketplace?city=Thi%C3%A8s')).body.total).toBe(0);
  });

  it('filtre par prix minimum et maximum (prix résolu)', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz', 5000);
    await publishStore(org);

    expect((await request(app).get('/api/v1/public/marketplace?priceMin=6000')).body.total).toBe(0);
    expect((await request(app).get('/api/v1/public/marketplace?priceMax=4000')).body.total).toBe(0);
    expect((await request(app).get('/api/v1/public/marketplace?priceMin=4000&priceMax=6000')).body.total).toBe(1);
  });

  it('n\'expose que les produits réellement en stock', async () => {
    const org = await createOrg();
    const withStock = await publishedProduct(org, 'Riz', 5000);
    // Produit publié mais sans stock : jamais exposé.
    await request(app)
      .post('/api/v1/products')
      .set(auth(org))
      .send({ name: 'Rupture', sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, price: 5000, marketplaceVisible: true, variants: [{ name: 'Standard', sku: `V-${Math.random().toString(36).slice(2, 8)}` }] });
    await publishStore(org);

    const res = await request(app).get('/api/v1/public/marketplace');
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(withStock.productId);
  });
});

describe('M3 — filtres annonces', () => {
  it('filtre par type de vendeur et mode de remise', async () => {
    const a = await createOrg('ind');
    await createSeller(a, 'INDIVIDUAL');
    await request(app).post('/api/v1/listings').set({ Authorization: `Bearer ${a.token}` }).send({ title: 'Téléphone', price: 45000, quantity: 1, fulfillment: 'PICKUP', city: 'Dakar', region: 'Dakar' });

    const b = await createOrg('mer');
    await createSeller(b, 'MERCHANT');
    const { productId, variantId } = await createProduct(b, { price: 14000, marketplaceVisible: true });
    await setStock(b, variantId, 5);
    await request(app).post('/api/v1/listings').set({ Authorization: `Bearer ${b.token}` }).send({ title: 'Riz', productId, storeId: b.storeId, fulfillment: 'DELIVERY' });

    expect((await request(app).get('/api/v1/public/listings?sellerType=INDIVIDUAL')).body.total).toBe(1);
    expect((await request(app).get('/api/v1/public/listings?sellerType=MERCHANT')).body.total).toBe(1);
    expect((await request(app).get('/api/v1/public/listings?fulfillment=DELIVERY')).body.total).toBe(1);
    expect((await request(app).get('/api/v1/public/listings?fulfillment=PICKUP')).body.total).toBe(1);
    expect((await request(app).get('/api/v1/public/listings?sellerType=BUSINESS')).body.total).toBe(0);
  });
});

// ─────────────────────────────── PAGINATION ───────────────────────────────

describe('M3 — pagination', () => {
  it('renvoie items, total, page, pageSize avec un ordre stable', async () => {
    const org = await createOrg();
    for (const n of ['A', 'B', 'C']) await publishedProduct(org, `Produit ${n}`, 5000);
    await publishStore(org);

    const p1 = await request(app).get('/api/v1/public/marketplace?page=1&pageSize=2');
    expect(p1.body.total).toBe(3);
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.page).toBe(1);
    expect(p1.body.pageSize).toBe(2);

    const p2 = await request(app).get('/api/v1/public/marketplace?page=2&pageSize=2');
    expect(p2.body.items).toHaveLength(1);
    expect(p2.body.total).toBe(3);

    const p3 = await request(app).get('/api/v1/public/marketplace?page=3&pageSize=2');
    expect(p3.body.items).toHaveLength(0);
    expect(p3.body.total).toBe(3);

    // Ordre identique entre deux appels.
    const again = await request(app).get('/api/v1/public/marketplace?page=1&pageSize=2');
    expect(again.body.items.map((i: { id: string }) => i.id)).toEqual(p1.body.items.map((i: { id: string }) => i.id));
  });

  it('borne page et pageSize (valeurs invalides normalisées)', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz', 5000);
    await publishStore(org);

    const big = await request(app).get('/api/v1/public/marketplace?pageSize=999');
    expect(big.body.pageSize).toBe(50);

    const zero = await request(app).get('/api/v1/public/marketplace?page=0&pageSize=0');
    expect(zero.body.page).toBe(1);
    expect(zero.body.pageSize).toBe(20);

    const nan = await request(app).get('/api/v1/public/marketplace?page=abc&pageSize=xyz');
    expect(nan.body.page).toBe(1);
    expect(nan.body.pageSize).toBe(20);
  });
});

// ─────────────────────────────── PROXIMITÉ ───────────────────────────────

describe('M3 — proximité', () => {
  it('applique le rayon réel et n\'invente aucune distance sans coordonnées', async () => {
    const org = await createOrg();
    // Boutique principale : Dakar (14.6928, -17.4467).
    const near = await publishedProduct(org, 'Riz Dakar', 14000);
    await publishStore(org, { latitude: 14.6928, longitude: -17.4467 });

    // Boutique lointaine : Thiès (~57 km).
    const far = await addStore(org, { latitude: 14.7886, longitude: -16.9246, city: 'Thiès', region: 'Thiès' });
    const farProduct = await publishedProduct(org, 'Riz Thiès', 14000, far.id);

    // Rayon 5 km : seule Dakar.
    const r5 = await request(app).get('/api/v1/public/marketplace?lat=14.6928&lng=-17.4467&radiusKm=5');
    expect(r5.body.total).toBe(1);
    expect(r5.body.items[0].id).toBe(near.productId);
    expect(r5.body.items[0].offers[0].distanceKm).toBeLessThanOrEqual(5);
    expect(r5.body.proximityApplied).toBe(true);

    // Rayon 25 km : Thiès reste hors portée (distance réelle ~57 km).
    const r25 = await request(app).get('/api/v1/public/marketplace?lat=14.6928&lng=-17.4467&radiusKm=25');
    expect(r25.body.total).toBe(1);
    expect(r25.body.items.find((i: { id: string }) => i.id === farProduct.productId)).toBeUndefined();

    // Sans coordonnées : les deux produits, aucune distance inventée.
    const none = await request(app).get('/api/v1/public/marketplace');
    expect(none.body.total).toBe(2);
    for (const it of none.body.items) {
      expect(it.minDistanceKm).toBeNull();
      for (const o of it.offers) expect(o.distanceKm).toBeNull();
    }
  });

  it('trie par distance réelle croissante', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz Dakar', 14000);
    await publishStore(org, { latitude: 14.6928, longitude: -17.4467 });
    const mid = await addStore(org, { latitude: 14.75, longitude: -17.4, city: 'Rufisque', region: 'Dakar' });
    await publishedProduct(org, 'Riz Rufisque', 14000, mid.id);

    const res = await request(app).get('/api/v1/public/marketplace?lat=14.6928&lng=-17.4467&radiusKm=25');
    expect(res.body.total).toBe(2);
    const dists = res.body.items.map((i: { minDistanceKm: number }) => i.minDistanceKm);
    expect(dists[0]).toBeLessThanOrEqual(dists[1]);
  });

  it('calcule la proximité AVANT la pagination (le plus proche reste en page 1)', async () => {
    const org = await createOrg();
    // Produit le plus proche créé en PREMIER (donc le plus ancien) : sans tri par
    // distance il serait dernier ; avec proximité avant pagination il est page 1.
    const closest = await publishedProduct(org, 'Riz proche', 14000);
    await publishStore(org, { latitude: 14.6928, longitude: -17.4467 });

    for (let i = 0; i < 3; i++) {
      const s = await addStore(org, { latitude: 14.79 + i * 0.01, longitude: -17.4, city: `Ville${i}`, region: 'Dakar' });
      await publishedProduct(org, `Riz loin ${i}`, 14000, s.id);
    }

    const page1 = await request(app).get('/api/v1/public/marketplace?lat=14.6928&lng=-17.4467&radiusKm=25&page=1&pageSize=1');
    expect(page1.body.total).toBe(4);
    expect(page1.body.items[0].id).toBe(closest.productId);
  });

  it('n\'expose jamais de coordonnées GPS et redacte la position de l\'acheteur dans les logs', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz', 14000);
    await publishStore(org, { latitude: 14.6928, longitude: -17.4467 });

    const market = await request(app).get('/api/v1/public/marketplace?lat=14.69&lng=-17.44&radiusKm=10');
    expect(JSON.stringify(market.body)).not.toContain('latitude');
    expect(JSON.stringify(market.body)).not.toContain('longitude');

    const store = await prisma.store.findUnique({ where: { id: org.storeId } });
    const shop = await request(app).get(`/api/v1/public/shops/${store!.slug}`);
    expect(shop.status).toBe(200);
    expect(shop.body.shop.latitude).toBeUndefined();
    expect(shop.body.shop.longitude).toBeUndefined();
    expect(JSON.stringify(shop.body)).not.toContain('latitude');
    expect(JSON.stringify(shop.body)).not.toContain('longitude');

    // Position acheteur absente des journaux.
    const redacted = redactUrl('/api/v1/public/marketplace?lat=14.69&lng=-17.44&radiusKm=10&search=riz');
    expect(redacted).not.toContain('14.69');
    expect(redacted).not.toContain('-17.44');
    expect(redacted).toContain('lat=%5Bredacted%5D');
    expect(redacted).toContain('search=riz');
  });

  it('la bounding box contient toujours le disque (aucun point du rayon exclu)', () => {
    const b = boundingBox(14.6928, -17.4467, 25);
    // Un point à ~24 km au nord doit tomber dans la boîte.
    const northLat = 14.6928 + 24 / 111.32;
    expect(northLat).toBeGreaterThanOrEqual(b.minLat);
    expect(northLat).toBeLessThanOrEqual(b.maxLat);
    // Cohérence Haversine.
    expect(haversineKm(14.6928, -17.4467, 14.7886, -16.9246)).toBeGreaterThan(25);
  });

  it('ne calcule la proximité que si les coordonnées sont valides', () => {
    expect(parseDiscoveryQuery({ lat: 'abc', lng: 'xyz' }).geo).toBeUndefined();
    expect(parseDiscoveryQuery({ lat: 14.69, lng: -17.44 }).geo).toEqual({ lat: 14.69, lng: -17.44, radiusKm: 25 });
    // Rayon non autorisé : repli honnête sur 25 km.
    expect(parseDiscoveryQuery({ lat: 14.69, lng: -17.44, radiusKm: 7 }).geo?.radiusKm).toBe(25);
    expect(parseDiscoveryQuery({ lat: 14.69, lng: -17.44, radiusKm: 10 }).geo?.radiusKm).toBe(10);
  });
});

// ─────────────────────────────── SÉCURITÉ ───────────────────────────────

describe('M3 — sécurité et isolation', () => {
  it('exclut un vendeur SUSPENDED (annonces et profil public)', async () => {
    const org = await createOrg();
    const seller = await createSeller(org, 'INDIVIDUAL');
    const sellerId = seller.body.seller.id as string;
    await request(app).post('/api/v1/listings').set({ Authorization: `Bearer ${org.token}` }).send({ title: 'Téléphone', price: 45000, quantity: 1 });

    expect((await request(app).get('/api/v1/public/listings')).body.total).toBe(1);
    expect((await request(app).get(`/api/v1/public/sellers/${sellerId}`)).status).toBe(200);

    await prisma.sellerProfile.update({ where: { id: sellerId }, data: { status: 'SUSPENDED' } });

    expect((await request(app).get('/api/v1/public/listings')).body.total).toBe(0);
    expect((await request(app).get(`/api/v1/public/sellers/${sellerId}`)).status).toBe(404);
  });

  it('exclut une annonce INACTIVE', async () => {
    const org = await createOrg();
    await createSeller(org, 'INDIVIDUAL');
    const created = await request(app).post('/api/v1/listings').set({ Authorization: `Bearer ${org.token}` }).send({ title: 'Article', price: 1000, quantity: 1 });
    expect((await request(app).get('/api/v1/public/listings')).body.total).toBe(1);

    await request(app).delete(`/api/v1/listings/${created.body.listing.id}`).set({ Authorization: `Bearer ${org.token}` });
    expect((await request(app).get('/api/v1/public/listings')).body.total).toBe(0);
  });

  it('exclut un produit non publié ou désactivé', async () => {
    const org = await createOrg();
    const hidden = await createProduct(org, { price: 5000, marketplaceVisible: false });
    await setStock(org, hidden.variantId, 5);
    await publishStore(org);
    expect((await request(app).get('/api/v1/public/marketplace')).body.total).toBe(0);

    const visible = await publishedProduct(org, 'Riz', 5000);
    await prisma.product.update({ where: { id: visible.productId }, data: { isActive: false } });
    expect((await request(app).get('/api/v1/public/marketplace')).body.total).toBe(0);
  });

  it('exclut une boutique privée ou inactive', async () => {
    const org = await createOrg();
    await publishedProduct(org, 'Riz', 5000);
    await publishStore(org, { isPublic: false });
    expect((await request(app).get('/api/v1/public/marketplace')).body.total).toBe(0);

    await publishStore(org, { isPublic: true });
    await prisma.store.update({ where: { id: org.storeId }, data: { isActive: false } });
    expect((await request(app).get('/api/v1/public/marketplace')).body.total).toBe(0);
  });

  it('le profil vendeur public n\'expose aucune donnée privée', async () => {
    const org = await createOrg();
    const seller = await createSeller(org, 'INDIVIDUAL', { bio: 'Bio publique', phone: '+221700000000', city: 'Thiès', region: 'Thiès' });
    const res = await request(app).get(`/api/v1/public/sellers/${seller.body.seller.id}`);
    expect(res.status).toBe(200);
    expect(res.body.seller).toMatchObject({ displayName: 'Vendeur INDIVIDUAL', sellerType: 'INDIVIDUAL', city: 'Thiès', region: 'Thiès', bio: 'Bio publique' });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('+221700000000');
    expect(raw).not.toContain(org.email);
    expect(raw).not.toContain('organizationId');
    expect(raw).not.toContain('userId');
    expect(raw).not.toContain('passwordHash');
  });
});

// ─────────────────────────────── COHÉRENCE ───────────────────────────────

describe('M3 — cohérence prix / stock / multi-offres', () => {
  it('le prix marketplace et annonce provient de resolveUnitPrice (promo comprise)', async () => {
    const org = await createOrg();
    const { productId } = await publishedProduct(org, 'Riz', 12000);
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: 11000 });
    await publishStore(org);

    const market = await request(app).get('/api/v1/public/marketplace');
    const item = market.body.items.find((i: { id: string }) => i.id === productId);
    expect(item.price).toBe(11000);
    expect(item.originalPrice).toBe(12000);

    await createSeller(org, 'MERCHANT');
    await request(app).post('/api/v1/listings').set({ Authorization: `Bearer ${org.token}` }).send({ title: 'Riz promo', productId, storeId: org.storeId });
    const listings = await request(app).get('/api/v1/public/listings');
    expect(listings.body.items[0].price).toBe(11000);
    expect(listings.body.items[0].available).toBe(5);
  });

  it('agrège plusieurs offres d\'un même produit dans plusieurs boutiques', async () => {
    const org = await createOrg();
    const { productId, variantId } = await publishedProduct(org, 'Riz', 14000);
    await publishStore(org);
    const second = await addStore(org);
    await stockIn(second.id, variantId, 8);

    const res = await request(app).get('/api/v1/public/marketplace');
    const item = res.body.items.find((i: { id: string }) => i.id === productId);
    expect(item.offers).toHaveLength(2);
    expect(item.available).toBe(13); // 5 + 8, stock réel cumulé
    expect(item.offers.map((o: { available: number }) => o.available).sort((x: number, y: number) => x - y)).toEqual([5, 8]);
  });
});

// ─────────────────────────────── CATÉGORIES ───────────────────────────────

describe('M3 — catégories publiques', () => {
  it('ne renvoie que les catégories réellement publiables', async () => {
    const org = await createOrg();
    const cat = await prisma.category.create({ data: { organizationId: org.organizationId, name: 'Céréales', slug: 'cereales' } });
    await prisma.category.create({ data: { organizationId: org.organizationId, name: 'Vide', slug: 'vide' } });
    const { productId } = await publishedProduct(org, 'Riz', 14000);
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ categoryId: cat.id });
    await publishStore(org);

    const res = await request(app).get('/api/v1/public/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { name: string }) => c.name)).toEqual(['Céréales']);
    expect(res.body.regions).toContain('Dakar');
  });
});
