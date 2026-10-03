import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

export const app: Express = createApp();

/** Supprime toutes les données (ordre respectant les clés étrangères). */
export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.salePayment.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.purchasePayment.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.courier.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.store.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.phoneVerification.deleteMany();
  await prisma.user.deleteMany();
}

export interface TestOrg {
  token: string;
  organizationId: string;
  storeId: string;
  userId: string;
  email: string;
}

let counter = 0;

/** Crée une organisation complète (propriétaire + boutique) via l'API réelle. */
export async function createOrg(prefix = 'org'): Promise<TestOrg> {
  counter += 1;
  const email = `${prefix}.${counter}.${Date.now()}@example.test`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'Password123!',
    fullName: `Owner ${prefix}`,
    organizationName: `Org ${prefix} ${counter}`,
    storeName: `Store ${prefix} ${counter}`,
    region: 'Dakar',
    city: 'Dakar',
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    token: res.body.accessToken,
    organizationId: res.body.organization.id,
    storeId: res.body.store.id,
    userId: res.body.user.id,
    email,
  };
}

/** En-têtes authentifiés pour une organisation. */
export function auth(org: TestOrg): Record<string, string> {
  return { Authorization: `Bearer ${org.token}`, 'x-organization-id': org.organizationId };
}

/** Crée un produit simple (une variante) et renvoie l'id de la variante. */
export async function createProduct(
  org: TestOrg,
  overrides: { price?: number; purchasePrice?: number; alertThreshold?: number; marketplaceVisible?: boolean } = {},
): Promise<{ productId: string; variantId: string }> {
  const res = await request(app)
    .post('/api/v1/products')
    .set(auth(org))
    .send({
      name: `Produit test ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sku: `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      purchasePrice: overrides.purchasePrice ?? 1000,
      price: overrides.price ?? 2000,
      alertThreshold: overrides.alertThreshold ?? 0,
      marketplaceVisible: overrides.marketplaceVisible ?? false,
      variants: [{ name: 'Standard', sku: `V-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }],
    });
  if (res.status !== 201) throw new Error(`createProduct failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { productId: res.body.product.id, variantId: res.body.product.variants[0].id };
}

/** Fixe le stock d'une variante via un ajustement réel (mouvement INITIAL). */
export async function setStock(org: TestOrg, variantId: string, quantity: number): Promise<void> {
  const res = await request(app)
    .post('/api/v1/inventory/adjust')
    .set(auth(org))
    .send({ storeId: org.storeId, variantId, quantity, type: 'INITIAL' });
  if (res.status !== 200) throw new Error(`setStock failed: ${res.status} ${JSON.stringify(res.body)}`);
}
