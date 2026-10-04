import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, createProduct, resetDb, setStock, type TestOrg } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

/** Rend la boutique publique et géolocalisée. */
async function publishStore(org: TestOrg, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .patch(`/api/v1/stores/${org.storeId}`)
    .set(auth(org))
    .send({ isPublic: true, city: 'Dakar', region: 'Dakar', ...overrides });
  expect(res.status).toBe(200);
}

/**
 * Crée un acheteur distinct (compte réel) et renvoie son jeton + userId.
 * L'acheteur n'est membre d'aucune organisation : il n'utilise que /me/orders.
 */
async function createBuyer(prefix = 'buyer') {
  const email = `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.test`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'Password123!',
    fullName: `Acheteur ${prefix}`,
    organizationName: `OrgAcheteur ${prefix}`,
    storeName: `StoreAcheteur ${prefix}`,
    region: 'Dakar',
    city: 'Dakar',
  });
  expect(res.status).toBe(201);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string, email };
}

const buyerAuth = (b: { token: string }) => ({ Authorization: `Bearer ${b.token}` });

function orderBody(org: TestOrg, variantId: string, quantity = 1, extra: Record<string, unknown> = {}) {
  return {
    storeId: org.storeId,
    customerName: 'Client Test',
    customerPhone: '+221770000000',
    items: [{ variantId, quantity }],
    ...extra,
  };
}

describe('M4 — parcours d’achat (commande)', () => {
  it('crée une commande au prix SERVEUR et ignore tout prix envoyé par le navigateur', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { variantId } = await createProduct(org, { price: 3000, marketplaceVisible: true });
    await setStock(org, variantId, 10);

    const res = await request(app)
      .post('/api/v1/me/orders')
      .set(buyerAuth(buyer))
      // Le client tente d'imposer un prix et un total : ils doivent être ignorés.
      .send({ ...orderBody(org, variantId, 2), unitPrice: 1, total: 1, price: 1 });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(6000);

    const order = await prisma.order.findUnique({ where: { id: res.body.orderId }, include: { items: true } });
    expect(order?.items[0].unitPrice).toBe(3000);
    expect(order?.items[0].lineTotal).toBe(6000);
  });

  it('refuse une commande dont le stock est insuffisant, sans rien modifier', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 2);

    const res = await request(app)
      .post('/api/v1/me/orders')
      .set(buyerAuth(buyer))
      .send(orderBody(org, variantId, 5));

    expect(res.status).toBe(409);
    const inv = await prisma.inventory.findFirst({ where: { variantId } });
    expect(inv?.quantity).toBe(2);
    expect(await prisma.order.count()).toBe(0);
  });

  it('conserve l’instantané du prix dans la commande (prix historique)', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { productId, variantId } = await createProduct(org, { price: 2000, marketplaceVisible: true });
    await setStock(org, variantId, 5);

    const res = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 1));
    expect(res.status).toBe(201);

    // Le prix du produit change après la commande.
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ price: 9999 });

    const detail = await request(app).get(`/api/v1/me/orders/${res.body.orderId}`).set(buyerAuth(buyer));
    expect(detail.status).toBe(200);
    expect(detail.body.order.items[0].unitPrice).toBe(2000); // figé au moment de la commande
    expect(detail.body.order.total).toBe(2000);
  });

  it('expose un identifiant lisible et factuel (GJ-…)', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 5);

    const res = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 1));
    const detail = await request(app).get(`/api/v1/me/orders/${res.body.orderId}`).set(buyerAuth(buyer));
    expect(detail.body.order.label).toMatch(/^GJ-\d{8}-[A-Z0-9]{6}$/);
  });
});

describe('M4 — idempotence des commandes', () => {
  it('un retry avec la même clé ne crée PAS une seconde commande', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { variantId } = await createProduct(org, { price: 2500, marketplaceVisible: true });
    await setStock(org, variantId, 10);

    const key = `key-${Date.now()}-retry`;
    // Requête A.
    const a = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 2, { clientRequestId: key }));
    expect(a.status).toBe(201);
    // Timeout client simulé, puis requête B avec la MÊME clé.
    const b = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 2, { clientRequestId: key }));

    expect([200, 201]).toContain(b.status);
    expect(b.body.orderId).toBe(a.body.orderId);
    expect(b.body.replayed).toBe(true);
    expect(await prisma.order.count()).toBe(1);
  });

  it('deux requêtes simultanées avec la même clé ne produisent qu’UNE commande', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 10);

    const key = `key-${Date.now()}-race`;
    const results = await Promise.allSettled([
      request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 1, { clientRequestId: key })),
      request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 1, { clientRequestId: key })),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<request.Response>).value);
    // Au moins une réussite, et TOUJOURS une seule commande en base.
    expect(fulfilled.some((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(await prisma.order.count({ where: { storeId: org.storeId, clientRequestId: key } })).toBe(1);
  });
});

describe('M4 — protection contre la survente', () => {
  it('stock = 1 : deux commandes concurrentes, une seule confirmation réussit', async () => {
    const org = await createOrg();
    const buyerA = await createBuyer('oversell-a');
    const buyerB = await createBuyer('oversell-b');
    const { variantId } = await createProduct(org, { price: 5000, marketplaceVisible: true });
    await setStock(org, variantId, 1);

    // Deux acheteurs commandent le dernier article (vérification de dispo à la création).
    const a = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyerA)).send(orderBody(org, variantId, 1));
    const b = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyerB)).send(orderBody(org, variantId, 1));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    // Le marchand confirme les deux : la première décrémente, la seconde est refusée.
    const c1 = await request(app).post(`/api/v1/orders/${a.body.orderId}/transition`).set(auth(org)).send({ to: 'CONFIRMED' });
    const c2 = await request(app).post(`/api/v1/orders/${b.body.orderId}/transition`).set(auth(org)).send({ to: 'CONFIRMED' });

    const statuses = [c1.status, c2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const inv = await prisma.inventory.findFirst({ where: { variantId } });
    expect(inv?.quantity).toBe(0); // jamais négatif
  });

  it('restitue le stock après annulation, sans jamais passer sous zéro', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { variantId } = await createProduct(org, { price: 3000, marketplaceVisible: true });
    await setStock(org, variantId, 3);

    const order = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 2));
    await request(app).post(`/api/v1/orders/${order.body.orderId}/transition`).set(auth(org)).send({ to: 'CONFIRMED' });
    expect((await prisma.inventory.findFirst({ where: { variantId } }))?.quantity).toBe(1);

    const cancel = await request(app).post(`/api/v1/me/orders/${order.body.orderId}/cancel`).set(buyerAuth(buyer));
    expect(cancel.status).toBe(200);
    expect((await prisma.inventory.findFirst({ where: { variantId } }))?.quantity).toBe(3);

    // L'événement d'annulation est conservé (historique préservé).
    const events = await prisma.orderEvent.findMany({ where: { orderId: order.body.orderId }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.toStatus)).toContain('CANCELLED');
  });
});

describe('M4 — isolation et permissions acheteur', () => {
  it('un acheteur ne voit que ses propres commandes', async () => {
    const org = await createOrg();
    const buyerA = await createBuyer('iso-a');
    const buyerB = await createBuyer('iso-b');
    const { variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 10);

    const order = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyerA)).send(orderBody(org, variantId, 1));
    expect(order.status).toBe(201);

    const listB = await request(app).get('/api/v1/me/orders').set(buyerAuth(buyerB));
    expect(listB.body.orders).toHaveLength(0);

    const detailB = await request(app).get(`/api/v1/me/orders/${order.body.orderId}`).set(buyerAuth(buyerB));
    expect(detailB.status).toBe(404);
  });

  it('un acheteur ne peut pas annuler la commande d’un autre', async () => {
    const org = await createOrg();
    const buyerA = await createBuyer('iso-c');
    const buyerB = await createBuyer('iso-d');
    const { variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 10);

    const order = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyerA)).send(orderBody(org, variantId, 1));
    const cancelB = await request(app).post(`/api/v1/me/orders/${order.body.orderId}/cancel`).set(buyerAuth(buyerB));
    expect(cancelB.status).toBe(404);
    // La commande de A est intacte.
    expect((await prisma.order.findUnique({ where: { id: order.body.orderId } }))?.status).toBe('PENDING');
  });

  it('la création de commande exige une authentification', async () => {
    const org = await createOrg();
    const { variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 5);
    const res = await request(app).post('/api/v1/me/orders').send(orderBody(org, variantId, 1));
    expect(res.status).toBe(401);
  });
});

describe('M4 — cohérence du statut (machine à états serveur)', () => {
  it('le bouton d’annulation n’est autorisé que pour les statuts ouvrables', async () => {
    const org = await createOrg();
    const buyer = await createBuyer();
    const { variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 5);

    const order = await request(app).post('/api/v1/me/orders').set(buyerAuth(buyer)).send(orderBody(org, variantId, 1));
    const pending = await request(app).get(`/api/v1/me/orders/${order.body.orderId}`).set(buyerAuth(buyer));
    expect(pending.body.cancellable).toBe(true);

    // Amène la commande jusqu'à DELIVERED (plus annulable).
    for (const to of ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED']) {
      const t = await request(app).post(`/api/v1/orders/${order.body.orderId}/transition`).set(auth(org)).send({ to });
      expect(t.status).toBe(200);
    }
    const delivered = await request(app).get(`/api/v1/me/orders/${order.body.orderId}`).set(buyerAuth(buyer));
    expect(delivered.body.cancellable).toBe(false);
    expect(delivered.body.order.status).toBe('DELIVERED');

    const cancel = await request(app).post(`/api/v1/me/orders/${order.body.orderId}/cancel`).set(buyerAuth(buyer));
    expect(cancel.status).toBe(409);
  });
});

describe('M4 — détail produit public', () => {
  it('expose les offres réelles et la variante, sans coordonnées ni prix d’achat', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 12000, purchasePrice: 9000, marketplaceVisible: true });
    await request(app).patch(`/api/v1/products/${productId}`).set(auth(org)).send({ promoPrice: 11000 });
    await setStock(org, variantId, 7);
    await publishStore(org);

    const res = await request(app).get(`/api/v1/public/products/${productId}`);
    expect(res.status).toBe(200);
    expect(res.body.product.price).toBe(11000);
    expect(res.body.product.originalPrice).toBe(12000);
    expect(res.body.product.variants[0].id).toBe(variantId);
    expect(res.body.product.variants[0].available).toBe(7);
    expect(res.body.product.offers[0].variantId).toBe(variantId);
    // Confidentialité : jamais de coordonnées ni de prix d'achat / SKU.
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/latitude|longitude|purchasePrice|"sku"/);
  });

  it('renvoie 404 pour un produit non publié', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 1000, marketplaceVisible: false });
    await setStock(org, variantId, 5);
    await publishStore(org);
    const res = await request(app).get(`/api/v1/public/products/${productId}`);
    expect(res.status).toBe(404);
  });
});

describe('M4 — coordonnées boutique et proximité', () => {
  it('le marchand peut renseigner latitude/longitude sans les exposer publiquement', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 5);
    await publishStore(org, { latitude: 14.6928, longitude: -17.4467 });

    // La proximité fonctionne avec de vraies coordonnées.
    const geo = await request(app).get(`/api/v1/public/marketplace?lat=14.6928&lng=-17.4467&radiusKm=5`);
    expect(geo.status).toBe(200);
    expect(geo.body.proximityApplied).toBe(true);
    expect(geo.body.items.some((i: { id: string }) => i.id === productId)).toBe(true);
    expect(geo.body.items[0].minDistanceKm).toBe(0);

    // Mais les coordonnées exactes ne sont JAMAIS publiques.
    const raw = JSON.stringify(geo.body);
    expect(raw).not.toMatch(/latitude|longitude|14\.6928|-17\.4467/);
  });

  it('sans coordonnées, la marketplace fonctionne normalement (aucune distance inventée)', async () => {
    const org = await createOrg();
    const { productId, variantId } = await createProduct(org, { price: 1000, marketplaceVisible: true });
    await setStock(org, variantId, 5);
    await publishStore(org); // sans latitude/longitude

    const geo = await request(app).get(`/api/v1/public/marketplace?lat=14.69&lng=-17.44&radiusKm=5`);
    expect(geo.status).toBe(200);
    expect(geo.body.proximityApplied).toBe(true);
    // Boutique non géolocalisée : exclue honnêtement, aucune distance fabriquée.
    expect(geo.body.items.some((i: { id: string }) => i.id === productId)).toBe(false);

    const all = await request(app).get('/api/v1/public/marketplace');
    expect(all.body.items.some((i: { id: string }) => i.id === productId)).toBe(true);
  });
});

describe('M4 — photo produit intégrée en cross-origin', () => {
  // PNG opaque minimal — image réelle, jamais une donnée inventée.
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('la photo publique autorise le chargement depuis une autre origine (frontend GitHub Pages)', async () => {
    const org = await createOrg();
    const created = await request(app)
      .post('/api/v1/products')
      .set(auth(org))
      .send({
        name: 'Produit photo public',
        price: 2500,
        marketplaceVisible: true,
        imageData: PNG,
        variants: [{ name: 'Standard' }],
      });
    expect(created.status).toBe(201);
    const productId = created.body.product.id as string;
    const variantId = created.body.product.variants[0].id as string;
    await setStock(org, variantId, 5);
    await publishStore(org);

    const photo = await request(app).get(`/api/v1/public/products/${productId}/photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toMatch(/image\/png/);
    // Sans cet en-tête, le navigateur bloque l'image (ERR_BLOCKED_BY_RESPONSE).
    expect(photo.headers['cross-origin-resource-policy']).toBe('cross-origin');
    // Les autres routes restent verrouillées en `same-origin` (Helmet).
    const health = await request(app).get('/api/v1/health');
    expect(health.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('une photo de produit non découvrable n’est jamais servie', async () => {
    const org = await createOrg();
    const created = await request(app)
      .post('/api/v1/products')
      .set(auth(org))
      .send({
        name: 'Produit caché',
        price: 1000,
        marketplaceVisible: false,
        imageData: PNG,
        variants: [{ name: 'Standard' }],
      });
    expect(created.status).toBe(201);
    const productId = created.body.product.id as string;

    const photo = await request(app).get(`/api/v1/public/products/${productId}/photo`);
    expect(photo.status).toBe(404);
  });
});
