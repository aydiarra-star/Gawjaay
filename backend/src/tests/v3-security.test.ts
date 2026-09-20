/**
 * GAWJAAY V3 — Audit sécurité & durcissement (docs/V3_AUDIT.md) : preuves HTTP de bout en bout.
 *
 * Couvre les correctifs V3 sans modifier aucun test antérieur :
 *   S1  validation Zod sur toutes les écritures (400 structuré, jamais 500, jamais d'effet de bord) ;
 *   S6  création produit par un EMPLOYÉ d'une autre boutique → 403 ;
 *   S7  GET /sales/:id isolé par boutique ;
 *   S8  dettes / employés / réceptions fournisseur isolés par boutique ;
 *   S9  machine à états commandes : CLIENT (sa commande, EN_ATTENTE → ANNULEE uniquement), alias anglais,
 *       REJETEE, transitions interdites, `statusCode` ;
 *   S10 refresh refusé pour un compte désactivé ;
 *   S11 seed régions réservé à l'ADMIN (14 régions / 46 départements) ;
 *   S12 paiements : capacités réelles exposées, CASH confirmé par le marchand uniquement, jamais par le client ;
 *   S13 vitrine publique : produits hors ligne invisibles, projection publique de la boutique ;
 *   T1  atomicité : une vente partiellement invalide ne laisse AUCUNE trace (stock, vente, dette).
 *
 * S'exécute sur SQLite et sur PostgreSQL réel (TEST_DATABASE_URL), comme le reste de la suite.
 */
import { vi } from 'vitest';
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-v3-security.db';
  process.env.NODE_ENV = 'test';
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db, { bootstrap } from '../lib/bootstrap';
import { cuid } from '../lib/db';
import { resetDatabase } from './helpers';

let server: any;
let apiPort = 0;

const A = { token: '', storeId: '', productId: '', offlineProductId: '', customerId: '', supplierId: '', debtId: '', saleId: '', employeeId: '', employeeToken: '', employeePhone: '+221771000003' };
const B = { token: '', storeId: '', productId: '', supplierId: '', employeeToken: '', employeeId: '', employeePhone: '+221771000004' };
const C1 = { token: '', userId: '' };
const C2 = { token: '', userId: '' };
let adminToken = '';

async function call(method: string, path: string, opts: { token?: string; body?: any; key?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.key) headers['Idempotency-Key'] = opts.key;
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/v1${path}`, {
    method,
    headers,
    body: opts.raw !== undefined ? opts.raw : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* vide */ }
  return { status: res.status, data };
}

async function register(phone: string, role: 'MERCHANT' | 'CLIENT') {
  const r = await call('POST', '/auth/register', { body: { phone, password: 'Password123!', role } });
  if (r.status !== 201) throw new Error(`register ${phone}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken as string, userId: r.data.user.id as string, refreshToken: r.data.refreshToken as string };
}
async function login(phone: string) {
  const r = await call('POST', '/auth/login', { body: { phone, password: 'Password123!' } });
  if (r.status !== 200) throw new Error(`login ${phone}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken as string, refreshToken: r.data.refreshToken as string };
}
function stockOf(storeId: string, productId: string) {
  return Number((db.prepare('SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?').get(storeId, productId) as any)?.quantity);
}
function count(sql: string, ...params: any[]) {
  return Number((db.prepare(sql).get(...params) as any)?.c ?? 0);
}
async function newOrder(token: string, storeId: string, productId: string, extra: any = {}) {
  const r = await call('POST', '/orders', { body: { storeId, items: [{ productId, quantity: 1 }], deliveryType: 'RETRAIT', ...extra }, token });
  expect(r.status).toBe(201);
  return r.data;
}

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  const { buildApp } = await import('../app');
  server = buildApp().listen(0);
  await new Promise((r) => server.once('listening', () => r(null)));
  apiPort = (server.address() as any).port;

  // ADMIN (insertion directe : aucune route publique ne crée d'admin — c'est voulu)
  const adminId = cuid();
  db.prepare('INSERT INTO users (id, phone, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,1,?,?)')
    .run(adminId, '+221770000001', await bcrypt.hash('Password123!', 12), 'ADMIN', new Date().toISOString(), new Date().toISOString());
  adminToken = (await login('+221770000001')).token;

  // Tenant A
  A.token = (await register('+221771000001', 'MERCHANT')).token;
  const sA = await call('POST', '/stores', { token: A.token, body: { name: 'Épicerie Sécurité A', allowDelivery: false } });
  expect(sA.status).toBe(201);
  A.storeId = sA.data.id;
  const pA = await call('POST', `/products/store/${A.storeId}`, { token: A.token, body: { name: 'Riz A', price: 5000, costPrice: 4000, initialStock: 20 } });
  expect(pA.status).toBe(201);
  A.productId = pA.data.id;
  const pOff = await call('POST', `/products/store/${A.storeId}`, { token: A.token, body: { name: 'Produit caché A', price: 900, initialStock: 3, isOnline: false } });
  expect(pOff.status).toBe(201);
  A.offlineProductId = pOff.data.id;
  const cA = await call('POST', '/customers', { token: A.token, body: { storeId: A.storeId, name: 'Client A', phone: '+221780100001' } });
  expect(cA.status).toBe(201);
  A.customerId = cA.data.id;
  const fA = await call('POST', '/suppliers', { token: A.token, body: { name: 'Fournisseur A' } });
  expect(fA.status).toBe(201);
  A.supplierId = fA.data.id;
  const saleA = await call('POST', `/sales/store/${A.storeId}`, { token: A.token, body: { customerId: A.customerId, items: [{ productId: A.productId, quantity: 1 }], paymentMethod: 'CREDIT', amountPaid: 0 } });
  expect(saleA.status).toBe(201);
  A.saleId = saleA.data.id;
  const debts = await call('GET', `/debts/store/${A.storeId}`, { token: A.token });
  expect(debts.status).toBe(200);
  A.debtId = debts.data[0].id;
  const eA = await call('POST', `/employees/store/${A.storeId}`, { token: A.token, body: { phone: A.employeePhone, password: 'Password123!', roleLabel: 'Caissier', permissions: ['sales:create', 'products:create'] } });
  expect(eA.status).toBe(201);
  A.employeeId = eA.data.employee.id;
  A.employeeToken = (await login(A.employeePhone)).token;

  // Tenant B
  B.token = (await register('+221771000002', 'MERCHANT')).token;
  const sB = await call('POST', '/stores', { token: B.token, body: { name: 'Boutique Sécurité B' } });
  B.storeId = sB.data.id;
  const pB = await call('POST', `/products/store/${B.storeId}`, { token: B.token, body: { name: 'Sucre B', price: 700, initialStock: 10 } });
  B.productId = pB.data.id;
  const fB = await call('POST', '/suppliers', { token: B.token, body: { name: 'Fournisseur B' } });
  B.supplierId = fB.data.id;
  const eB = await call('POST', `/employees/store/${B.storeId}`, { token: B.token, body: { phone: B.employeePhone, password: 'Password123!', roleLabel: 'Vendeur', permissions: ['products:create', 'sales:create', 'orders:update'] } });
  expect(eB.status).toBe(201);
  B.employeeId = eB.data.employee.id;
  B.employeeToken = (await login(B.employeePhone)).token;

  // Deux clients
  const c1 = await register('+221761000001', 'CLIENT'); C1.token = c1.token; C1.userId = c1.userId;
  const c2 = await register('+221761000002', 'CLIENT'); C2.token = c2.token; C2.userId = c2.userId;
}, 180000);

afterAll(async () => {
  if (server) await new Promise((r) => server.close(() => r(null)));
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('S1 — Validation serveur (Zod) sur les écritures : 400 structuré, aucun effet de bord', () => {
  it('boutique sans nom → 400 (plus de 500)', async () => {
    const r = await call('POST', '/stores', { token: A.token, body: {} });
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('Validation échouée');
    expect(r.data.details.some((d: any) => d.path === 'name')).toBe(true);
  });
  it('produit prix négatif / nom manquant → 400', async () => {
    const r1 = await call('POST', `/products/store/${A.storeId}`, { token: A.token, body: { name: 'X', price: -5 } });
    expect(r1.status).toBe(400);
    const r2 = await call('POST', `/products/store/${A.storeId}`, { token: A.token, body: { price: 100 } });
    expect(r2.status).toBe(400);
  });
  it('vente avec quantité négative → 400 et stock inchangé (plus de stock gonflé)', async () => {
    const before = stockOf(A.storeId, A.productId);
    const r = await call('POST', `/sales/store/${A.storeId}`, { token: A.token, body: { items: [{ productId: A.productId, quantity: -5 }], paymentMethod: 'CASH' } });
    expect(r.status).toBe(400);
    expect(stockOf(A.storeId, A.productId)).toBe(before);
  });
  it('vente avec quantité en chaîne / items vides → 400', async () => {
    const r1 = await call('POST', `/sales/store/${A.storeId}`, { token: A.token, body: { items: [{ productId: A.productId, quantity: '2' }] } });
    expect(r1.status).toBe(400);
    const r2 = await call('POST', `/sales/store/${A.storeId}`, { token: A.token, body: { items: [] } });
    expect(r2.status).toBe(400);
  });
  it('ajustement de stock : quantité nulle, type inconnu, texte → 400 ; alias IN accepté', async () => {
    const before = stockOf(A.storeId, A.productId);
    expect((await call('POST', `/inventory/${A.storeId}/adjust`, { token: A.token, body: { productId: A.productId, quantity: 0 } })).status).toBe(400);
    expect((await call('POST', `/inventory/${A.storeId}/adjust`, { token: A.token, body: { productId: A.productId, quantity: 'abc' } })).status).toBe(400);
    expect((await call('POST', `/inventory/${A.storeId}/adjust`, { token: A.token, body: { productId: A.productId, quantity: 1, type: 'HACK' } })).status).toBe(400);
    expect((await call('POST', `/inventory/${A.storeId}/adjust`, { token: A.token, body: { productId: A.productId, quantity: 1, type: 'SALE' } })).status).toBe(400);
    expect(stockOf(A.storeId, A.productId)).toBe(before);
    const ok = await call('POST', `/inventory/${A.storeId}/adjust`, { token: A.token, body: { productId: A.productId, quantity: 2, type: 'IN', reason: 'réassort' } });
    expect(ok.status).toBe(200);
    expect(ok.data.movement.type).toBe('ADJUSTMENT');
    expect(stockOf(A.storeId, A.productId)).toBe(before + 2);
  });
  it('commande : quantité 0, produit manquant, deliveryType inconnu → 400', async () => {
    expect((await call('POST', '/orders', { token: C1.token, body: { storeId: A.storeId, items: [{ productId: A.productId, quantity: 0 }] } })).status).toBe(400);
    expect((await call('POST', '/orders', { token: C1.token, body: { storeId: A.storeId, items: [{ quantity: 1 }] } })).status).toBe(400);
    expect((await call('POST', '/orders', { token: C1.token, body: { storeId: A.storeId, items: [{ productId: A.productId, quantity: 1 }], deliveryType: 'DRONE' } })).status).toBe(400);
  });
  it('JSON malformé → 400 (pas de 500)', async () => {
    const r = await call('POST', '/stores', { token: A.token, raw: '{"name": ' });
    expect(r.status).toBe(400);
  });
  it('champs inconnus/internes ignorés : merchantId injecté à la création de boutique', async () => {
    const r = await call('POST', '/stores', { token: A.token, body: { name: 'Boutique A2', merchantId: 'hack', isVerified: 1 } });
    expect(r.status).toBe(201);
    expect(r.data.merchantId).not.toBe('hack');
    expect(Number(r.data.isVerified || 0)).toBe(0);
  });
  it('mise à jour boutique : champs géographiques / paiement / livraison persistés', async () => {
    const seed = await call('POST', '/regions/seed', { token: adminToken });
    expect(seed.status).toBe(200);
    const regions = await call('GET', '/regions');
    const dakar = regions.data.find((r: any) => r.code === 'DK');
    const dep = dakar.departments.find((d: any) => d.name === 'Dakar');
    const commune = dep.communes[0];
    const r = await call('PUT', `/stores/${A.storeId}`, { token: A.token, body: {
      regionId: dakar.id, departmentId: dep.id, communeId: commune.id, latitude: 14.6928, longitude: -17.4467,
      category: 'alimentation', deliveryDelayMinutes: 45, deliveryZones: ['Plateau', 'Médina'], paymentMethods: ['CASH', 'WAVE'], allowDelivery: false,
    } });
    expect(r.status).toBe(200);
    expect(r.data.regionId).toBe(dakar.id);
    expect(r.data.communeId).toBe(commune.id);
    expect(Number(r.data.latitude)).toBeCloseTo(14.6928, 3);
    expect(JSON.parse(r.data.paymentMethods)).toEqual(['CASH', 'WAVE']);
    expect(Number(r.data.allowDelivery)).toBe(0);
    // incohérence géographique refusée : commune de Dakar rattachée à la région de Thiès
    const thies = regions.data.find((r: any) => r.code === 'TH');
    const bad = await call('PUT', `/stores/${A.storeId}`, { token: A.token, body: { regionId: thies.id, departmentId: dep.id } });
    expect(bad.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('S6/S7/S8 — Isolation multi-tenant : produits (employé), ventes, dettes, employés, fournisseurs', () => {
  it('S6 : un EMPLOYÉ de B (permission products:create) ne crée pas de produit dans A → 403', async () => {
    const r = await call('POST', `/products/store/${A.storeId}`, { token: B.employeeToken, body: { name: 'Intrusion', price: 100 } });
    expect(r.status).toBe(403);
    expect(count('SELECT COUNT(*) as c FROM products WHERE storeId = ? AND name = ?', A.storeId, 'Intrusion')).toBe(0);
  });
  it('S6 : le même employé crée bien dans SA boutique → 201', async () => {
    const r = await call('POST', `/products/store/${B.storeId}`, { token: B.employeeToken, body: { name: 'Produit employé B', price: 100 } });
    expect(r.status).toBe(201);
  });
  it('S7 : B ne lit pas une vente de A (403), A la lit (200), inconnue → 404', async () => {
    expect((await call('GET', `/sales/${A.saleId}`, { token: B.token })).status).toBe(403);
    const own = await call('GET', `/sales/${A.saleId}`, { token: A.token });
    expect(own.status).toBe(200);
    expect(own.data.items.length).toBe(1);
    expect((await call('GET', `/sales/inexistante`, { token: A.token })).status).toBe(404);
  });
  it('S8 dettes : B ne liste / lit / paie pas les dettes de A', async () => {
    expect((await call('GET', `/debts/store/${A.storeId}`, { token: B.token })).status).toBe(403);
    expect((await call('GET', `/debts/${A.debtId}`, { token: B.token })).status).toBe(403);
    const pay = await call('POST', `/debts/${A.debtId}/pay`, { token: B.token, body: { amount: 100, method: 'CASH' } });
    expect(pay.status).toBe(403);
    const debt = db.prepare('SELECT paidAmount FROM debts WHERE id = ?').get(A.debtId) as any;
    expect(Number(debt.paidAmount)).toBe(0);
    // un CLIENT n'a jamais accès aux dettes
    expect((await call('GET', `/debts/store/${A.storeId}`, { token: C1.token })).status).toBe(403);
  });
  it('S8 dettes : montant invalide → 400 ; paiement partiel par A → solde mis à jour et audité', async () => {
    expect((await call('POST', `/debts/${A.debtId}/pay`, { token: A.token, body: { amount: -10 } })).status).toBe(400);
    expect((await call('POST', `/debts/${A.debtId}/pay`, { token: A.token, body: { amount: 'x' } })).status).toBe(400);
    const r = await call('POST', `/debts/${A.debtId}/pay`, { token: A.token, body: { amount: 1000, method: 'CASH' } });
    expect(r.status).toBe(200);
    expect(Number(r.data.balance)).toBe(4000);
    expect(count(`SELECT COUNT(*) as c FROM audit_logs WHERE action = 'DEBT_PAY' AND resourceId = ?`, A.debtId)).toBe(1);
    // création manuelle d'une dette : client d'une autre boutique refusé
    const bad = await call('POST', `/debts/store/${B.storeId}`, { token: B.token, body: { customerId: A.customerId, totalAmount: 500 } });
    expect(bad.status).toBe(404);
  });
  it('S8 employés : B ne crée / liste / modifie / désactive pas dans A', async () => {
    expect((await call('POST', `/employees/store/${A.storeId}`, { token: B.token, body: { phone: '+221771009999', password: 'Password123!', roleLabel: 'X', permissions: [] } })).status).toBe(403);
    expect((await call('GET', `/employees/store/${A.storeId}`, { token: B.token })).status).toBe(403);
    expect((await call('PATCH', `/employees/${A.employeeId}/permissions`, { token: B.token, body: { permissions: ['*:*'] } })).status).toBe(403);
    expect((await call('POST', `/employees/${A.employeeId}/deactivate`, { token: B.token })).status).toBe(403);
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(A.employeeId) as any;
    expect(Number(emp.isActive)).toBe(1);
    expect(JSON.parse(emp.permissions)).toEqual(['sales:create', 'products:create']);
  });
  it('S8 employés : permission mal formée → 400 ; liste sans passwordHash', async () => {
    expect((await call('PATCH', `/employees/${A.employeeId}/permissions`, { token: A.token, body: { permissions: ['DROP TABLE'] } })).status).toBe(400);
    const list = await call('GET', `/employees/store/${A.storeId}`, { token: A.token });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.data)).not.toContain('passwordHash');
  });
  it('S8 fournisseurs : réception croisée refusée (fournisseur de B / boutique de A / produit de B)', async () => {
    const before = stockOf(A.storeId, A.productId);
    // B tente d'utiliser son fournisseur pour livrer la boutique de A
    const r1 = await call('POST', `/suppliers/${B.supplierId}/receive`, { token: B.token, body: { storeId: A.storeId, items: [{ productId: A.productId, quantity: 50, unitPrice: 100 }] } });
    expect(r1.status).toBe(403);
    // B tente d'utiliser le fournisseur de A
    const r2 = await call('POST', `/suppliers/${A.supplierId}/receive`, { token: B.token, body: { storeId: B.storeId, items: [{ productId: B.productId, quantity: 5, unitPrice: 100 }] } });
    expect(r2.status).toBe(403);
    // A réceptionne un produit de B dans sa boutique → 404 (produit hors boutique), rien n'est écrit
    const r3 = await call('POST', `/suppliers/${A.supplierId}/receive`, { token: A.token, body: { storeId: A.storeId, items: [{ productId: B.productId, quantity: 5, unitPrice: 100 }] } });
    expect(r3.status).toBe(404);
    expect(stockOf(A.storeId, A.productId)).toBe(before);
    expect(count('SELECT COUNT(*) as c FROM purchases WHERE storeId = ?', A.storeId)).toBe(0);
    // quantité négative → 400
    const r4 = await call('POST', `/suppliers/${A.supplierId}/receive`, { token: A.token, body: { storeId: A.storeId, items: [{ productId: A.productId, quantity: -5, unitPrice: 100 }] } });
    expect(r4.status).toBe(400);
    // réception légitime
    const ok = await call('POST', `/suppliers/${A.supplierId}/receive`, { token: A.token, body: { storeId: A.storeId, items: [{ productId: A.productId, quantity: 5, unitPrice: 4000 }] } });
    expect(ok.status).toBe(200);
    expect(stockOf(A.storeId, A.productId)).toBe(before + 5);
    // B ne lit/modifie pas le fournisseur de A
    expect((await call('GET', `/suppliers/${A.supplierId}`, { token: B.token })).status).toBe(403);
    expect((await call('PUT', `/suppliers/${A.supplierId}`, { token: B.token, body: { name: 'Piraté' } })).status).toBe(403);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('S9 — Machine à états des commandes (contrôlée serveur, par rôle)', () => {
  it('CLIENT : annule SA commande EN_ATTENTE (alias CANCELLED accepté) → ANNULEE, livraison et paiement clos', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    expect(o.status).toBe('EN_ATTENTE');
    expect(o.statusCode).toBe('PENDING');
    const r = await call('PATCH', `/orders/${o.id}/status`, { token: C1.token, body: { status: 'CANCELLED' } });
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('ANNULEE');
    expect(r.data.statusCode).toBe('CANCELLED');
    const d = db.prepare('SELECT status FROM deliveries WHERE orderId = ?').get(o.id) as any;
    expect(d.status).toBe('ANNULE');
    const p = db.prepare('SELECT status FROM payments WHERE orderId = ?').get(o.id) as any;
    expect(p.status).toBe('CANCELLED');
  });
  it('CLIENT : ne peut PAS confirmer / livrer sa propre commande → 403', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: C1.token, body: { status: 'CONFIRMED' } })).status).toBe(403);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: C1.token, body: { status: 'LIVREE' } })).status).toBe(403);
    expect((db.prepare('SELECT status FROM orders WHERE id = ?').get(o.id) as any).status).toBe('EN_ATTENTE');
  });
  it('CLIENT : ne touche pas à la commande d un AUTRE client → 403', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    const r = await call('PATCH', `/orders/${o.id}/status`, { token: C2.token, body: { status: 'ANNULEE' } });
    expect(r.status).toBe(403);
    expect((await call('GET', `/orders/${o.id}`, { token: C2.token })).status).toBe(403);
  });
  it('MERCHANT : refuse une commande (REJECTED → REJETEE) ; puis aucune transition possible', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    const r = await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: { status: 'REJECTED', reason: 'Rupture' } });
    expect(r.status).toBe(200);
    expect(r.data.status).toBe('REJETEE');
    expect(r.data.statusCode).toBe('REJECTED');
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: { status: 'CONFIRMEE' } })).status).toBe(400);
    const n = db.prepare(`SELECT body FROM notifications WHERE userId = ? AND body LIKE '%REJETEE%' ORDER BY createdAt DESC`).get(C1.userId) as any;
    expect(n.body).toContain('Rupture');
  });
  it('transitions interdites → 400 : EN_ATTENTE→LIVREE, EN_ATTENTE→PRETE, statut inconnu', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: { status: 'LIVREE' } })).status).toBe(400);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: { status: 'READY' } })).status).toBe(400);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: { status: 'BANANA' } })).status).toBe(400);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: {} })).status).toBe(400);
  });
  it('flux nominal complet avec alias anglais : PENDING→CONFIRMED→PREPARING→READY→OUT_FOR_DELIVERY→DELIVERED ; états finaux verrouillés', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    const before = stockOf(A.storeId, A.productId);
    for (const [code, fr] of [['CONFIRMED', 'CONFIRMEE'], ['PREPARING', 'EN_PREPARATION'], ['READY', 'PRETE'], ['OUT_FOR_DELIVERY', 'EN_LIVRAISON'], ['DELIVERED', 'LIVREE']]) {
      const r = await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: { status: code } });
      expect(r.status).toBe(200);
      expect(r.data.status).toBe(fr);
    }
    expect(stockOf(A.storeId, A.productId)).toBe(before - 1); // stock réservé une seule fois (à CONFIRMEE)
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: A.token, body: { status: 'CANCELLED' } })).status).toBe(400);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: C1.token, body: { status: 'CANCELLED' } })).status).toBe(403);
    const detail = await call('GET', `/orders/${o.id}`, { token: A.token });
    expect(detail.data.allowedTransitions).toEqual([]);
    // la livraison a suivi : PRETE → colis PRET (puis inchangé par la suite côté commande)
    expect(count(`SELECT COUNT(*) as c FROM audit_logs WHERE action = 'ORDER_STATUS' AND resourceId = ?`, o.id)).toBe(5);
  });
  it('MERCHANT B / EMPLOYÉ B (orders:update) ne changent pas une commande de A → 403', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: B.token, body: { status: 'CONFIRMEE' } })).status).toBe(403);
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: B.employeeToken, body: { status: 'CONFIRMEE' } })).status).toBe(403);
    // employé de A SANS permission orders:update → 403 (permission fine)
    expect((await call('PATCH', `/orders/${o.id}/status`, { token: A.employeeToken, body: { status: 'CONFIRMEE' } })).status).toBe(403);
  });
  it('liste : le client ne voit que ses commandes ; le marchand ne filtre pas sur une boutique étrangère', async () => {
    const mine = await call('GET', '/orders', { token: C2.token });
    expect(mine.status).toBe(200);
    expect(mine.data.every((o: any) => o.clientId === C2.userId)).toBe(true);
    const c1 = await call('GET', '/orders', { token: C1.token });
    expect(c1.data.length).toBeGreaterThan(0);
    expect(c1.data.every((o: any) => o.clientId === C1.userId && typeof o.statusCode === 'string')).toBe(true);
    // la projection de la boutique dans la liste client est publique (pas de merchantId)
    expect(c1.data[0].store.merchantId).toBeUndefined();
    // actions valides calculées PAR RÔLE : un client ne peut qu'annuler une commande EN_ATTENTE (la sienne)
    for (const o of c1.data) {
      expect(Array.isArray(o.allowedTransitions)).toBe(true);
      expect(o.allowedTransitions).toEqual(o.status === 'EN_ATTENTE' ? ['ANNULEE'] : []);
      expect(o.client).toBeNull(); // aucune identité d'autrui exposée côté client
    }
    expect((await call('GET', `/orders?storeId=${A.storeId}`, { token: B.token })).status).toBe(403);
    const bList = await call('GET', '/orders', { token: B.token });
    expect(bList.data.every((o: any) => o.storeId === B.storeId)).toBe(true);
    // vue marchand : téléphone du client + transitions de la machine à états
    const aList = await call('GET', `/orders?storeId=${A.storeId}`, { token: A.token });
    expect(aList.status).toBe(200);
    const pending = aList.data.find((o: any) => o.status === 'EN_ATTENTE');
    expect(pending.client.phone).toMatch(/^\+221/);
    expect(pending.allowedTransitions).toEqual(expect.arrayContaining(['CONFIRMEE', 'ANNULEE', 'REJETEE']));
    const delivered = aList.data.find((o: any) => o.status === 'LIVREE');
    expect(delivered.allowedTransitions).toEqual([]);
  });
  it('la boutique décide des modes proposés : livraison désactivée → commande LIVRAISON refusée', async () => {
    const r = await call('POST', '/orders', { token: C1.token, body: { storeId: A.storeId, items: [{ productId: A.productId, quantity: 1 }], deliveryType: 'LIVRAISON' } });
    expect(r.status).toBe(400);
    expect(r.data.error).toContain('livraison');
  });
  it('livraison legacy : statut inconnu → 400, transition interdite → 400', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    const d = db.prepare('SELECT id FROM deliveries WHERE orderId = ?').get(o.id) as any;
    expect((await call('PATCH', `/deliveries/${d.id}/status`, { token: A.token, body: { status: 'TELEPORTE' } })).status).toBe(400);
    expect((await call('PATCH', `/deliveries/${d.id}/status`, { token: A.token, body: { status: 'LIVRE' } })).status).toBe(200);
    expect((db.prepare('SELECT status FROM orders WHERE id = ?').get(o.id) as any).status).toBe('LIVREE');
    expect((await call('PATCH', `/deliveries/${d.id}/status`, { token: A.token, body: { status: 'EN_LIVRAISON' } })).status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('T1 — Atomicité des ventes (transactions)', () => {
  it('vente à 2 lignes dont la 2e est en rupture → 400, AUCUNE écriture (stock, vente, mouvement)', async () => {
    const before = stockOf(A.storeId, A.productId);
    const beforeOff = stockOf(A.storeId, A.offlineProductId);
    const sales = count('SELECT COUNT(*) as c FROM sales WHERE storeId = ?', A.storeId);
    const r = await call('POST', `/sales/store/${A.storeId}`, { token: A.token, body: { items: [{ productId: A.productId, quantity: 1 }, { productId: A.offlineProductId, quantity: 999 }], paymentMethod: 'CASH' } });
    expect(r.status).toBe(400);
    expect(stockOf(A.storeId, A.productId)).toBe(before);
    expect(stockOf(A.storeId, A.offlineProductId)).toBe(beforeOff);
    expect(count('SELECT COUNT(*) as c FROM sales WHERE storeId = ?', A.storeId)).toBe(sales);
  });
  it('paiement partiel sans client → 400 (plus de dette orpheline ni de 500), rien n est écrit', async () => {
    const before = stockOf(A.storeId, A.productId);
    const debts = count('SELECT COUNT(*) as c FROM debts');
    const r = await call('POST', `/sales/store/${A.storeId}`, { token: A.token, body: { items: [{ productId: A.productId, quantity: 1 }], paymentMethod: 'CASH', amountPaid: 100 } });
    expect(r.status).toBe(400);
    expect(stockOf(A.storeId, A.productId)).toBe(before);
    expect(count('SELECT COUNT(*) as c FROM debts')).toBe(debts);
  });
  it('client d une autre boutique dans une vente → 404', async () => {
    const cB = await call('POST', '/customers', { token: B.token, body: { storeId: B.storeId, name: 'Client B', phone: '+221780100002' } });
    const r = await call('POST', `/sales/store/${A.storeId}`, { token: A.token, body: { customerId: cB.data.id, items: [{ productId: A.productId, quantity: 1 }] } });
    expect(r.status).toBe(404);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('S13 — Vitrine publique : visibilité et projection', () => {
  it('produit hors ligne : invisible en public, visible pour le propriétaire', async () => {
    const pub = await call('GET', `/products/store/${A.storeId}`);
    expect(pub.status).toBe(200);
    expect(pub.data.some((p: any) => p.id === A.offlineProductId)).toBe(false);
    expect(JSON.stringify(pub.data)).not.toContain('costPrice');
    const own = await call('GET', `/products/store/${A.storeId}`, { token: A.token });
    expect(own.data.some((p: any) => p.id === A.offlineProductId)).toBe(true);
    expect((await call('GET', `/products/${A.offlineProductId}`)).status).toBe(404);
    expect((await call('GET', `/products/${A.offlineProductId}`, { token: A.token })).status).toBe(200);
    const pubDetail = await call('GET', `/products/${A.productId}`);
    expect(pubDetail.status).toBe(200);
    expect(pubDetail.data.costPrice).toBeUndefined();
    expect(pubDetail.data.store.merchantId).toBeUndefined();
  });
  it('boutique : GET /stores/:id par un CLIENT → projection publique ; par le propriétaire → complète', async () => {
    const asClient = await call('GET', `/stores/${A.storeId}`, { token: C1.token });
    expect(asClient.status).toBe(200);
    expect(asClient.data.merchantId).toBeUndefined();
    expect(asClient.data.name).toBe('Épicerie Sécurité A');
    const asOwner = await call('GET', `/stores/${A.storeId}`, { token: A.token });
    expect(asOwner.data.merchantId).toBeDefined();
    expect((await call('GET', `/stores/${A.storeId}`, { token: B.token })).status).toBe(403);
    const slug = await call('GET', `/stores/slug/${asOwner.data.slug}`);
    expect(slug.status).toBe(200);
    expect(slug.data.merchantId).toBeUndefined();
    expect(slug.data.products.some((p: any) => p.id === A.offlineProductId)).toBe(false);
    expect(Array.isArray(slug.data.categories)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('S10 — Auth : refresh et compte désactivé', () => {
  it('un employé désactivé ne peut plus rafraîchir son accès (403) ni se connecter', async () => {
    const before = await login(A.employeePhone);
    const ok = await call('POST', '/auth/refresh', { body: { refreshToken: before.refreshToken } });
    expect(ok.status).toBe(200);
    expect((await call('POST', `/employees/${A.employeeId}/deactivate`, { token: A.token })).status).toBe(200);
    const refused = await call('POST', '/auth/refresh', { body: { refreshToken: before.refreshToken } });
    expect(refused.status).toBe(403);
    const loginRefused = await call('POST', '/auth/login', { body: { phone: A.employeePhone, password: 'Password123!' } });
    expect(loginRefused.status).toBe(403);
    // réactivation par le propriétaire → connexion à nouveau possible
    expect((await call('POST', `/employees/${A.employeeId}/reactivate`, { token: A.token })).status).toBe(200);
    expect((await call('POST', '/auth/login', { body: { phone: A.employeePhone, password: 'Password123!' } })).status).toBe(200);
  });
  it('changement de mot de passe : entrée invalide → 400', async () => {
    expect((await call('POST', '/auth/change-password', { token: A.token, body: { oldPassword: 'Password123!', newPassword: 'court' } })).status).toBe(400);
  });
  it('rotation du refresh token : nouveau token à chaque refresh, rejeu de l ancien → 401 + session révoquée + audit', async () => {
    const first = await login('+221761000002');
    const r1 = await call('POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } });
    expect(r1.status).toBe(200);
    expect(r1.data.accessToken).toBeDefined();
    expect(r1.data.refreshToken).toBeDefined();
    expect(r1.data.refreshToken).not.toBe(first.refreshToken);
    // le nouveau token fonctionne (chaîne de rotation)
    const r2 = await call('POST', '/auth/refresh', { body: { refreshToken: r1.data.refreshToken } });
    expect(r2.status).toBe(200);
    expect(r2.data.refreshToken).not.toBe(r1.data.refreshToken);
    // rejeu d'un token déjà consommé → détection : 401, session entière révoquée, audit
    const replay = await call('POST', '/auth/refresh', { body: { refreshToken: first.refreshToken } });
    expect(replay.status).toBe(401);
    expect(count("SELECT COUNT(*) c FROM audit_logs WHERE action = 'REFRESH_REUSE_DETECTED' AND userId = ?", C2.userId)).toBe(1);
    const afterReplay = await call('POST', '/auth/refresh', { body: { refreshToken: r2.data.refreshToken } });
    expect(afterReplay.status).toBe(401);
    // un token forgé / illisible → 401 sans effet de bord
    expect((await call('POST', '/auth/refresh', { body: { refreshToken: 'abc.def.ghi' } })).status).toBe(401);
    // une nouvelle connexion ouvre une nouvelle session, indépendante
    expect((await call('POST', '/auth/refresh', { body: { refreshToken: (await login('+221761000002')).refreshToken } })).status).toBe(200);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('S11 — Régions : seed ADMIN uniquement, 14 régions / 46 départements', () => {
  it('seed anonyme → 401, marchand → 403, admin → 200', async () => {
    expect((await call('POST', '/regions/seed')).status).toBe(401);
    expect((await call('POST', '/regions/seed', { token: A.token })).status).toBe(403);
    expect((await call('POST', '/regions/seed', { token: adminToken })).status).toBe(200);
  });
  it('arbre complet : 14 régions, 46 départements, communes non vides ; endpoints départements/communes', async () => {
    const regions = await call('GET', '/regions');
    expect(regions.data.length).toBe(14);
    const deps = regions.data.flatMap((r: any) => r.departments);
    expect(deps.length).toBe(46);
    expect(deps.every((d: any) => d.communes.length > 0)).toBe(true);
    const list = await call('GET', '/regions/departments');
    expect(list.data.length).toBe(46);
    const communes = await call('GET', `/regions/departments/${deps[0].id}/communes`);
    expect(communes.data.length).toBeGreaterThan(0);
    // Guédiawaye est un département (plus une commune de Pikine)
    const dakar = regions.data.find((r: any) => r.code === 'DK');
    expect(dakar.departments.map((d: any) => d.name).sort()).toEqual(['Dakar', 'Guédiawaye', 'Keur Massar', 'Pikine', 'Rufisque']);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('S12 — Paiements : capacités réelles, CASH confirmé par le marchand, jamais par le client', () => {
  it('capabilities : mode sandbox en test, aucun fournisseur de production connecté', async () => {
    const r = await call('GET', '/payments/capabilities');
    expect(r.status).toBe(200);
    expect(r.data.productionProviderConnected).toBe(false);
    expect(['sandbox', 'disabled']).toContain(r.data.mode);
    expect(r.data.methods.find((m: any) => m.code === 'CASH').available).toBe(true);
  });
  it('CASH : PENDING à l initiation ; verify ne change rien ; le CLIENT ne peut pas confirmer ; le marchand oui (audité)', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    const init = await call('POST', '/payments/initiate', { token: C1.token, body: { orderId: o.id, provider: 'CASH' } });
    expect(init.status).toBe(201);
    expect(init.data.status).toBe('PENDING');
    const v = await call('POST', `/payments/${init.data.id}/verify`, { token: C1.token });
    expect(v.data.status).toBe('PENDING');
    expect((await call('POST', `/payments/${init.data.id}/confirm-cash`, { token: C1.token })).status).toBe(403);
    expect((await call('POST', `/payments/${init.data.id}/confirm-cash`, { token: B.token })).status).toBe(403);
    const ok = await call('POST', `/payments/${init.data.id}/confirm-cash`, { token: A.token });
    expect(ok.status).toBe(200);
    expect(ok.data.status).toBe('SUCCESS');
    expect(count(`SELECT COUNT(*) as c FROM audit_logs WHERE action = 'PAYMENT_STATUS' AND resourceId = ?`, init.data.id)).toBe(1);
    // idempotent : seconde confirmation → même statut, pas de 2e notification
    const notifs = count(`SELECT COUNT(*) as c FROM notifications WHERE type = 'PAYMENT' AND userId = ?`, C1.userId);
    await call('POST', `/payments/${init.data.id}/confirm-cash`, { token: A.token });
    expect(count(`SELECT COUNT(*) as c FROM notifications WHERE type = 'PAYMENT' AND userId = ?`, C1.userId)).toBe(notifs);
  });
  it('provider invalide → 400 ; commande annulée → 400 ; un paiement WAVE (sandbox) ne peut pas être « confirmé cash »', async () => {
    const o = await newOrder(C1.token, A.storeId, A.productId);
    expect((await call('POST', '/payments/initiate', { token: C1.token, body: { orderId: o.id, provider: 'PAYPAL' } })).status).toBe(400);
    const wave = await call('POST', '/payments/initiate', { token: C1.token, body: { orderId: o.id, provider: 'WAVE' } });
    expect(wave.status).toBe(201);
    expect((await call('POST', `/payments/${wave.data.id}/confirm-cash`, { token: A.token })).status).toBe(400);
    await call('PATCH', `/orders/${o.id}/status`, { token: C1.token, body: { status: 'ANNULEE' } });
    const o2 = await newOrder(C1.token, A.storeId, A.productId);
    await call('PATCH', `/orders/${o2.id}/status`, { token: C1.token, body: { status: 'ANNULEE' } });
    expect((await call('POST', '/payments/initiate', { token: C1.token, body: { orderId: o2.id, provider: 'WAVE' } })).status).toBe(400);
  });
  it('webhook : signature absente / mauvais provider → 401/400, jamais de succès', async () => {
    expect((await call('POST', '/payments/webhook/WAVE', { body: { transactionId: 'x', payload: {} } })).status).toBe(401);
    expect((await call('POST', '/payments/webhook/PAYPAL', { body: { transactionId: 'x', signature: 'a', payload: {} } })).status).toBe(400);
  });
});
