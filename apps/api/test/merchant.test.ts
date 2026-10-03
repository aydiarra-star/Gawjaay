import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, auth, createOrg, resetDb } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

/** Petite image PNG 8×8 valide, encodée en data-URI. */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAJUlEQVR4nGNgYGCQk5OzsbGJioqqqKiYNm3ali1bLl26xDC0JABjG07Bu/EhPgAAAABJRU5ErkJggg==';

const RIZ = {
  name: 'Riz',
  packaging: 'sac',
  format: '50 kg',
  purchasePrice: 12000,
  price: 14000,
  alertThreshold: 2,
  variants: [{ name: 'Sac 50 kg' }],
};

async function createRiz(org: Awaited<ReturnType<typeof createOrg>>, initialStock = 10) {
  const res = await request(app)
    .post('/api/v1/products/merchant')
    .set(auth(org))
    .send({ ...RIZ, initialStock });
  expect(res.status).toBe(201);
  return res.body.product as {
    id: string;
    sku: string;
    packaging: string;
    format: string;
    hasImage: boolean;
    variants: Array<{ id: string; name: string }>;
  };
}

describe('parcours marchand — produit', () => {
  it('crée un produit avec conditionnement, format et SKU généré', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 0);
    expect(product.packaging).toBe('sac');
    expect(product.format).toBe('50 kg');
    expect(product.sku).toBeTruthy();
    expect(product.hasImage).toBe(false);
    expect(product.variants[0].name).toBe('Sac 50 kg');
  });

  it('enregistre le stock initial comme un vrai mouvement INITIAL', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 10);
    const inv = await prisma.inventory.findFirst({ where: { variantId: product.variants[0].id } });
    expect(inv?.quantity).toBe(10);
    const movement = await prisma.inventoryMovement.findFirst({ where: { variantId: product.variants[0].id } });
    expect(movement?.type).toBe('INITIAL');
    expect(movement?.quantity).toBe(10);
  });

  it('crée le produit et son stock dans la même transaction (aucun stock orphelin)', async () => {
    const org = await createOrg();
    const res = await request(app)
      .post('/api/v1/products/merchant')
      .set(auth(org))
      .send({ ...RIZ, initialStock: 4, price: -1 });
    // Payload invalide : rien ne doit être créé.
    expect(res.status).toBe(400);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
  });
});

describe('parcours marchand — photo', () => {
  it('accepte une photo valide, la sert et peut la supprimer', async () => {
    const org = await createOrg();
    const res = await request(app).post('/api/v1/products/merchant').set(auth(org)).send({ ...RIZ, initialStock: 0, imageData: PNG_1PX });
    expect(res.status).toBe(201);
    const productId = res.body.product.id as string;
    expect(res.body.product.hasImage).toBe(true);
    // Le base64 ne doit pas être renvoyé dans les listes.
    expect(res.body.product.imageData).toBeUndefined();

    const photo = await request(app).get(`/api/v1/products/${productId}/photo`).set(auth(org));
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toContain('image/png');

    const del = await request(app).delete(`/api/v1/products/${productId}/photo`).set(auth(org));
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/v1/products/${productId}/photo`).set(auth(org));
    expect(after.status).toBe(404);
  });

  it('refuse une photo invalide ou trop lourde', async () => {
    const org = await createOrg();
    const bad = await request(app).post('/api/v1/products/merchant').set(auth(org)).send({ ...RIZ, imageData: 'data:image/svg+xml;base64,AAAA' });
    expect(bad.status).toBe(400);

    const tooBig = 'data:image/png;base64,' + 'A'.repeat(1_200_000);
    const big = await request(app).post('/api/v1/products/merchant').set(auth(org)).send({ ...RIZ, imageData: tooBig });
    expect(big.status).toBe(400);
  });
});

describe('parcours marchand — stock', () => {
  it('ajoute du stock à un produit existant sans le recréer', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 10);
    const res = await request(app)
      .post(`/api/v1/products/${product.id}/stock`)
      .set(auth(org))
      .send({ quantity: 5, purchasePrice: 12500 });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(15);

    const refreshed = await prisma.product.findUnique({ where: { id: product.id } });
    expect(refreshed?.purchasePrice).toBe(12500);

    const entry = await prisma.inventoryMovement.findFirst({ where: { variantId: product.variants[0].id, type: 'ENTRY' } });
    expect(entry?.quantity).toBe(5);
  });

  it('expose le seuil, l’état faible et la rupture', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 2); // seuil = 2 => faible
    const list = await request(app).get('/api/v1/inventory').set(auth(org));
    expect(list.status).toBe(200);
    const row = list.body.items.find((i: { variantId: string }) => i.variantId === product.variants[0].id);
    expect(row.packaging).toBe('sac');
    expect(row.threshold).toBe(2);
    expect(row.low).toBe(true);
    expect(row.out).toBe(false);

    await request(app).post(`/api/v1/products/${product.id}/sale`).set(auth(org)).send({ quantity: 2 });
    const after = await request(app).get('/api/v1/inventory').set(auth(org));
    const rowOut = after.body.items.find((i: { variantId: string }) => i.variantId === product.variants[0].id);
    expect(rowOut.quantity).toBe(0);
    expect(rowOut.out).toBe(true);
  });

  it('historise les mouvements avec le nom du produit', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 10);
    await request(app).post(`/api/v1/products/${product.id}/stock`).set(auth(org)).send({ quantity: 5 });
    await request(app).post(`/api/v1/products/${product.id}/sale`).set(auth(org)).send({ quantity: 1 });

    const movements = await request(app).get('/api/v1/inventory/movements').set(auth(org));
    const types = movements.body.movements.map((m: { type: string }) => m.type);
    expect(types).toContain('INITIAL');
    expect(types).toContain('ENTRY');
    expect(types).toContain('SALE');
    const sale = movements.body.movements.find((m: { type: string }) => m.type === 'SALE');
    expect(sale.productName).toBe('Riz');
    expect(sale.quantity).toBe(-1);
  });
});

describe('parcours marchand — vente', () => {
  it('vend depuis la fiche produit, décrémente le stock et met à jour le tableau de bord', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 10);

    const sale = await request(app).post(`/api/v1/products/${product.id}/sale`).set(auth(org)).send({ quantity: 1 });
    expect(sale.status).toBe(201);
    expect(sale.body.total).toBe(14000);

    const inv = await prisma.inventory.findFirst({ where: { variantId: product.variants[0].id } });
    expect(inv?.quantity).toBe(9);

    const dashboard = await request(app).get('/api/v1/reports/dashboard').set(auth(org));
    expect(dashboard.body.revenue).toBe(14000);
    expect(dashboard.body.salesCount).toBe(1);
    expect(dashboard.body.grossMargin).toBe(2000); // (14000-12000)*1
  });

  it('refuse la vente quand le stock est insuffisant (409, stock inchangé)', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 1);
    const res = await request(app).post(`/api/v1/products/${product.id}/sale`).set(auth(org)).send({ quantity: 2 });
    expect(res.status).toBe(409);
    const inv = await prisma.inventory.findFirst({ where: { variantId: product.variants[0].id } });
    expect(inv?.quantity).toBe(1);
  });
});

describe('persistance', () => {
  it('conserve produit, stock et vente après reconnexion à la base', async () => {
    const org = await createOrg();
    const product = await createRiz(org, 10);
    await request(app).post(`/api/v1/products/${product.id}/sale`).set(auth(org)).send({ quantity: 1 });

    // Simule un redémarrage de l'API : on coupe puis rouvre la connexion.
    await prisma.$disconnect();
    const product2 = await prisma.product.findUnique({ where: { id: product.id }, include: { variants: true } });
    expect(product2?.name).toBe('Riz');
    const inv = await prisma.inventory.findFirst({ where: { variantId: product.variants[0].id } });
    expect(inv?.quantity).toBe(9);
    const saleCount = await prisma.sale.count();
    expect(saleCount).toBe(1);
  });
});
