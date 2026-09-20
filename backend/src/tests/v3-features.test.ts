/**
 * GAWJAAY V3 — Fonctionnalités (docs/V3_AUDIT.md F1, F4, F8, P2) : preuves HTTP de bout en bout.
 *
 *   F1  Catégories : référentiel plateforme (migration 009), lecture publique avec compteurs RÉELS,
 *       écriture ADMIN uniquement, suppression refusée si utilisée, produit → catégorie inconnue = 400 ;
 *   F4  Marketplace : tous les filtres transmis (prix, promo, tri, catégorie, zone, boutique),
 *       proximité = Haversine réel sur coordonnées déclarées (aucune distance inventée), bornes ;
 *   F8  Notifications : registre de canaux — INTERNAL actif, EMAIL/SMS/WHATSAPP/PUSH NOT_CONNECTED,
 *       jamais marqués envoyés ;
 *   P2  Migration 009 : index FK présents (SQLite et PostgreSQL), idempotence.
 *
 * S'exécute sur SQLite et sur PostgreSQL réel (TEST_DATABASE_URL), comme le reste de la suite.
 */
import { vi } from 'vitest';
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-v3-features.db';
  process.env.NODE_ENV = 'test';
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db, { bootstrap } from '../lib/bootstrap';
import { cuid } from '../lib/db';
import { resetDatabase } from './helpers';
import { haversineKm } from '../lib/geo';
import { seedDefaultCategories, DEFAULT_CATEGORIES } from '../modules/categories/service';
import { notify, listChannels } from '../modules/notifications/channels';
import { runAllMigrations } from '../migrations/versions/009_v3_categories_indexes';

let server: any;
let apiPort = 0;

// Points GPS réels (degrés décimaux) — Dakar Plateau, Pikine, Thiès
const PLATEAU = { lat: 14.6928, lng: -17.4467 };
const PIKINE = { lat: 14.7549, lng: -17.3906 };
const THIES = { lat: 14.791, lng: -16.9359 };

const M = { token: '', userId: '', storeNear: '', storeFar: '', slugNear: '', slugFar: '', productNear: '', productFar: '', productCheap: '', productOffline: '' };
const C = { token: '', userId: '' };
let adminToken = '';
let dakarRegionId = '';
let thiesRegionId = '';
let dakarDeptId = '';
let catAlimId = '';
let catBoissonsId = '';

async function call(method: string, path: string, opts: { token?: string; body?: any } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/v1${path}`, { method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  let data: any = null;
  try { data = await res.json(); } catch { /* vide */ }
  return { status: res.status, data };
}
async function register(phone: string, role: 'MERCHANT' | 'CLIENT') {
  const r = await call('POST', '/auth/register', { body: { phone, password: 'Password123!', role } });
  if (r.status !== 201) throw new Error(`register ${phone}: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken as string, userId: r.data.user.id as string };
}
async function login(phone: string) {
  const r = await call('POST', '/auth/login', { body: { phone, password: 'Password123!' } });
  if (r.status !== 200) throw new Error(`login ${phone}: ${r.status}`);
  return r.data.accessToken as string;
}
function count(sql: string, ...params: any[]) {
  return Number((db.prepare(sql).get(...params) as any)?.c ?? 0);
}

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  seedDefaultCategories(db); // resetDatabase vide aussi le référentiel posé par la migration 009
  const { buildApp } = await import('../app');
  server = buildApp().listen(0);
  await new Promise((r) => server.once('listening', () => r(null)));
  apiPort = (server.address() as any).port;

  const adminId = cuid();
  db.prepare('INSERT INTO users (id, phone, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,1,?,?)')
    .run(adminId, '+221770000002', await bcrypt.hash('Password123!', 12), 'ADMIN', new Date().toISOString(), new Date().toISOString());
  adminToken = await login('+221770000002');
  expect((await call('POST', '/regions/seed', { token: adminToken })).status).toBe(200);
  const regions = (await call('GET', '/regions')).data as any[];
  const dakar = regions.find((r) => r.code === 'DK');
  const thies = regions.find((r) => r.code === 'TH');
  dakarRegionId = dakar.id; thiesRegionId = thies.id;
  dakarDeptId = dakar.departments.find((d: any) => d.name === 'Dakar').id;

  const cats = (await call('GET', '/categories')).data as any[];
  catAlimId = cats.find((c) => c.slug === 'alimentaire').id;
  catBoissonsId = cats.find((c) => c.slug === 'boissons').id;

  const m = await register('+221772000001', 'MERCHANT'); M.token = m.token; M.userId = m.userId;
  const near = await call('POST', '/stores', { token: M.token, body: { name: 'Épicerie Plateau', category: 'Épicerie', regionId: dakarRegionId, departmentId: dakarDeptId, latitude: PLATEAU.lat, longitude: PLATEAU.lng, quartier: 'Plateau' } });
  expect(near.status).toBe(201);
  M.storeNear = near.data.id; M.slugNear = near.data.slug;
  const far = await call('POST', '/stores', { token: M.token, body: { name: 'Boutique Thiès', category: 'Quincaillerie', regionId: thiesRegionId, latitude: THIES.lat, longitude: THIES.lng, quartier: 'Centre' } });
  expect(far.status).toBe(201);
  M.storeFar = far.data.id; M.slugFar = far.data.slug;

  const pNear = await call('POST', `/products/store/${M.storeNear}`, { token: M.token, body: { name: 'Riz parfumé 25kg', price: 15000, costPrice: 13000, initialStock: 10, categoryId: catAlimId } });
  expect(pNear.status).toBe(201); M.productNear = pNear.data.id;
  const pCheap = await call('POST', `/products/store/${M.storeNear}`, { token: M.token, body: { name: 'Eau minérale 1.5L', price: 500, initialStock: 50, categoryId: catBoissonsId } });
  expect(pCheap.status).toBe(201); M.productCheap = pCheap.data.id;
  const pOff = await call('POST', `/products/store/${M.storeNear}`, { token: M.token, body: { name: 'Riz brisé hors ligne', price: 9000, initialStock: 5, isOnline: false, categoryId: catAlimId } });
  expect(pOff.status).toBe(201); M.productOffline = pOff.data.id;
  const pFar = await call('POST', `/products/store/${M.storeFar}`, { token: M.token, body: { name: 'Riz local Thiès', price: 12000, initialStock: 8, categoryId: catAlimId } });
  expect(pFar.status).toBe(201); M.productFar = pFar.data.id;

  const c = await register('+221762000001', 'CLIENT'); C.token = c.token; C.userId = c.userId;
}, 180000);

afterAll(async () => {
  if (server) await new Promise((r) => server.close(() => r(null)));
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('F1 — Catégories (référentiel plateforme, ADMIN)', () => {
  it('GET /categories public : référentiel de base + compteurs de produits EN LIGNE réels', async () => {
    const r = await call('GET', '/categories');
    expect(r.status).toBe(200);
    expect(r.data.length).toBeGreaterThanOrEqual(DEFAULT_CATEGORIES.length);
    const alim = r.data.find((c: any) => c.slug === 'alimentaire');
    // Riz parfumé (near, en ligne) + Riz local (far, en ligne) ; le produit hors ligne ne compte pas
    expect(alim.productCount).toBe(2);
    expect(r.data.find((c: any) => c.slug === 'boissons').productCount).toBe(1);
    expect(r.data.find((c: any) => c.slug === 'autres').productCount).toBe(0);
  });

  it('GET /categories/:slug → fiche + sous-catégories ; inconnue → 404', async () => {
    const r = await call('GET', '/categories/alimentaire');
    expect(r.status).toBe(200);
    expect(r.data.id).toBe(catAlimId);
    expect(Array.isArray(r.data.children)).toBe(true);
    expect((await call('GET', '/categories/inexistante')).status).toBe(404);
  });

  it('écriture : anonyme 401, MERCHANT 403, CLIENT 403, ADMIN 201 (+ slug + audit)', async () => {
    expect((await call('POST', '/categories', { body: { name: 'Test' } })).status).toBe(401);
    expect((await call('POST', '/categories', { token: M.token, body: { name: 'Test' } })).status).toBe(403);
    expect((await call('POST', '/categories', { token: C.token, body: { name: 'Test' } })).status).toBe(403);
    const r = await call('POST', '/categories', { token: adminToken, body: { name: 'Produits Laitiers', parentId: catAlimId } });
    expect(r.status).toBe(201);
    expect(r.data.slug).toBe('produits-laitiers');
    expect(r.data.parentId).toBe(catAlimId);
    expect(count("SELECT COUNT(*) c FROM audit_logs WHERE action = 'CATEGORY_CREATE' AND resourceId = ?", r.data.id)).toBe(1);
    // doublon de nom → 409 ; nom vide → 400 ; parent inconnu → 400 ; 2 niveaux max → 400
    expect((await call('POST', '/categories', { token: adminToken, body: { name: 'Produits Laitiers' } })).status).toBe(409);
    expect((await call('POST', '/categories', { token: adminToken, body: { name: '' } })).status).toBe(400);
    expect((await call('POST', '/categories', { token: adminToken, body: { name: 'X', parentId: 'nope' } })).status).toBe(400);
    expect((await call('POST', '/categories', { token: adminToken, body: { name: 'Yaourts', parentId: r.data.id } })).status).toBe(400);
    const fiche = await call('GET', '/categories/alimentaire');
    expect(fiche.data.children.map((c: any) => c.slug)).toContain('produits-laitiers');
  });

  it('PUT renomme (slug recalculé) ; DELETE refusé si des produits la référencent (409), accepté sinon', async () => {
    const created = await call('POST', '/categories', { token: adminToken, body: { name: 'Temporaire' } });
    const upd = await call('PUT', `/categories/${created.data.id}`, { token: adminToken, body: { name: 'Temporaire Renommée' } });
    expect(upd.status).toBe(200);
    expect(upd.data.slug).toBe('temporaire-renommee');
    expect((await call('PUT', `/categories/${created.data.id}`, { token: M.token, body: { name: 'Hack' } })).status).toBe(403);
    // utilisée → 409 avec le nombre de produits
    const del = await call('DELETE', `/categories/${catAlimId}`, { token: adminToken });
    expect(del.status).toBe(409);
    expect(del.data.details?.productCount).toBe(3);
    expect(count('SELECT COUNT(*) c FROM categories WHERE id = ?', catAlimId)).toBe(1);
    // non utilisée → supprimée
    expect((await call('DELETE', `/categories/${created.data.id}`, { token: adminToken })).status).toBe(200);
    expect(count('SELECT COUNT(*) c FROM categories WHERE id = ?', created.data.id)).toBe(0);
    expect((await call('DELETE', `/categories/${created.data.id}`, { token: adminToken })).status).toBe(404);
  });

  it('produit rattaché à une catégorie inconnue → 400 (référentiel serveur)', async () => {
    const r = await call('POST', `/products/store/${M.storeNear}`, { token: M.token, body: { name: 'Sans catégorie valide', price: 100, categoryId: 'cat_inexistante' } });
    expect(r.status).toBe(400);
    const ok = await call('POST', `/products/store/${M.storeNear}`, { token: M.token, body: { name: 'Jus de bissap', price: 800, initialStock: 4, categoryId: catBoissonsId } });
    expect(ok.status).toBe(201);
    expect(ok.data.categoryId).toBe(catBoissonsId);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('F4 — Marketplace : filtres réellement appliqués + proximité Haversine réelle', () => {
  it('sans filtre : uniquement produits EN LIGNE, en stock, sans données internes', async () => {
    const r = await call('GET', '/marketplace/products');
    expect(r.status).toBe(200);
    const ids = r.data.map((p: any) => p.id);
    expect(ids).toContain(M.productNear);
    expect(ids).toContain(M.productFar);
    expect(ids).not.toContain(M.productOffline);
    for (const p of r.data) {
      expect(p.costPrice).toBeUndefined();
      expect(p.store.merchantId).toBeUndefined();
      expect(p.inStock).toBe(true);
      expect(p.distance).toBeUndefined(); // aucune distance sans position fournie
    }
  });

  it('minPrice / maxPrice / sort / category / store / region sont appliqués côté serveur', async () => {
    const cheap = await call('GET', '/marketplace/products?maxPrice=1000');
    expect(cheap.data.map((p: any) => p.id)).toEqual(expect.arrayContaining([M.productCheap]));
    expect(cheap.data.every((p: any) => p.price <= 1000)).toBe(true);
    const expensive = await call('GET', '/marketplace/products?minPrice=10000');
    expect(expensive.data.every((p: any) => p.price >= 10000)).toBe(true);
    expect(expensive.data.map((p: any) => p.id)).toEqual(expect.arrayContaining([M.productNear, M.productFar]));

    const asc = await call('GET', '/marketplace/products?sort=price_asc');
    const prices = asc.data.map((p: any) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const desc = await call('GET', '/marketplace/products?sort=price_desc');
    expect(desc.data[0].price).toBe(Math.max(...prices));

    const boissons = await call('GET', '/marketplace/products?category=boissons');
    expect(boissons.data.length).toBeGreaterThan(0);
    expect(boissons.data.every((p: any) => p.category === 'boissons')).toBe(true);
    const byId = await call('GET', `/marketplace/products?category=${catBoissonsId}`);
    expect(byId.data.length).toBe(boissons.data.length);

    const byStore = await call('GET', `/marketplace/products?store=${M.slugFar}`);
    expect(byStore.data.every((p: any) => p.storeId === M.storeFar)).toBe(true);
    expect(byStore.data.length).toBe(1);

    const thies = await call('GET', `/marketplace/products?region=${thiesRegionId}`);
    expect(thies.data.map((p: any) => p.id)).toEqual([M.productFar]);
    const dakarDept = await call('GET', `/marketplace/products?department=${dakarDeptId}`);
    expect(dakarDept.data.every((p: any) => p.storeId === M.storeNear)).toBe(true);
    expect(dakarDept.data.length).toBeGreaterThanOrEqual(2);
  });

  it('inStock=false inclut les ruptures ; promo=true ne renvoie rien sans promotion active', async () => {
    const rupture = await call('POST', `/products/store/${M.storeNear}`, { token: M.token, body: { name: 'Huile en rupture', price: 1200, initialStock: 0, categoryId: catAlimId } });
    expect(rupture.status).toBe(201);
    const def = await call('GET', '/marketplace/products?q=Huile');
    expect(def.data.length).toBe(0);
    const all = await call('GET', '/marketplace/products?q=Huile&inStock=false');
    expect(all.data.map((p: any) => p.id)).toEqual([rupture.data.id]);
    expect(all.data[0].inStock).toBe(false);
    const promo = await call('GET', '/marketplace/products?promo=true');
    expect(promo.data).toEqual([]);
  });

  it('proximité : distance Haversine réelle, rayon respecté, tri par distance', async () => {
    const r = await call('GET', `/marketplace/products?lat=${PIKINE.lat}&lng=${PIKINE.lng}&radiusKm=15`);
    expect(r.status).toBe(200);
    const ids = r.data.map((p: any) => p.id);
    expect(ids).toContain(M.productNear); // Plateau ≈ 9 km de Pikine
    expect(ids).not.toContain(M.productFar); // Thiès ≈ 50 km
    const expected = haversineKm(PIKINE.lat, PIKINE.lng, PLATEAU.lat, PLATEAU.lng);
    expect(expected).toBeGreaterThan(5);
    expect(expected).toBeLessThan(15);
    for (const p of r.data) {
      expect(Math.abs(p.distance - expected)).toBeLessThan(0.02);
      expect(p.distance).toBeLessThanOrEqual(15);
    }
    // rayon large : Thiès apparaît, après les produits du Plateau
    const wide = await call('GET', `/marketplace/products?lat=${PIKINE.lat}&lng=${PIKINE.lng}&radiusKm=80`);
    const dists = wide.data.map((p: any) => p.distance);
    expect(dists).toEqual([...dists].sort((a, b) => a - b));
    expect(wide.data.map((p: any) => p.id)).toContain(M.productFar);
    const far = wide.data.find((p: any) => p.id === M.productFar);
    expect(Math.abs(far.distance - haversineKm(PIKINE.lat, PIKINE.lng, THIES.lat, THIES.lng))).toBeLessThan(0.02);
    // rayon minuscule : rien (aucune distance inventée)
    const none = await call('GET', `/marketplace/products?lat=${THIES.lat + 0.5}&lng=${THIES.lng + 0.5}&radiusKm=1`);
    expect(none.data).toEqual([]);
  });

  it('coordonnées invalides → 400 ; rayon plafonné ; take plafonné à 50', async () => {
    expect((await call('GET', '/marketplace/products?lat=abc&lng=-17')).status).toBe(400);
    expect((await call('GET', '/marketplace/products?lat=95&lng=-17')).status).toBe(400);
    expect((await call('GET', '/marketplace/products?lat=14&lng=-17&radiusKm=-3')).status).toBe(400);
    expect((await call('GET', '/marketplace/nearby?lat=14')).status).toBe(400);
    const ok = await call('GET', `/marketplace/products?lat=${PIKINE.lat}&lng=${PIKINE.lng}&radiusKm=100000&take=5000`);
    expect(ok.status).toBe(200);
    expect(ok.data.length).toBeLessThanOrEqual(50);
  });

  it('boutiques : recherche par région / catégorie, proximité, projection publique + onlineProductCount', async () => {
    const all = await call('GET', '/marketplace/stores');
    expect(all.status).toBe(200);
    const near = all.data.find((s: any) => s.id === M.storeNear);
    expect(near.merchantId).toBeUndefined();
    expect(near.onlineProductCount).toBe(4); // Riz parfumé, Eau, Jus de bissap, Huile (en ligne même en rupture) — jamais le produit hors ligne
    const thies = await call('GET', `/marketplace/stores?region=${thiesRegionId}`);
    expect(thies.data.map((s: any) => s.id)).toEqual([M.storeFar]);
    const quinc = await call('GET', '/marketplace/stores?category=Quincaillerie');
    expect(quinc.data.map((s: any) => s.id)).toEqual([M.storeFar]);
    const geo = await call('GET', `/marketplace/stores?lat=${PIKINE.lat}&lng=${PIKINE.lng}&radiusKm=20`);
    expect(geo.data.map((s: any) => s.id)).toEqual([M.storeNear]);
    expect(geo.data[0].distance).toBeGreaterThan(5);
    const nearby = await call('GET', `/marketplace/nearby?lat=${PIKINE.lat}&lng=${PIKINE.lng}&radiusKm=80`);
    expect(nearby.data.map((s: any) => s.id)).toEqual([M.storeNear, M.storeFar]);
    expect(nearby.data[0].distance).toBeLessThan(nearby.data[1].distance);
    const byQuartier = await call('GET', '/marketplace/stores?q=Plateau');
    expect(byQuartier.data.map((s: any) => s.id)).toEqual([M.storeNear]);
  });

  it('une boutique fermée numériquement disparaît de la marketplace (produits ET boutiques)', async () => {
    expect((await call('PUT', `/stores/${M.storeFar}`, { token: M.token, body: { digitalStatus: 'CLOSED' } })).status).toBe(200);
    const products = await call('GET', '/marketplace/products?q=Thiès');
    expect(products.data).toEqual([]);
    const stores = await call('GET', '/marketplace/stores?q=Thiès');
    expect(stores.data).toEqual([]);
    expect((await call('PUT', `/stores/${M.storeFar}`, { token: M.token, body: { digitalStatus: 'OPEN' } })).status).toBe(200);
    expect((await call('GET', '/marketplace/stores?q=Thiès')).data.length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('F8 — Canaux de notification : INTERNAL actif, externes NOT_CONNECTED (jamais simulés)', () => {
  it('GET /notifications/channels (auth) expose l état réel des canaux', async () => {
    expect((await call('GET', '/notifications/channels')).status).toBe(401);
    const r = await call('GET', '/notifications/channels', { token: C.token });
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.data.channels.map((c: any) => [c.channel, c]));
    expect(by.INTERNAL.status).toBe('ACTIVE');
    for (const ch of ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']) {
      expect(by[ch].status).toBe('NOT_CONNECTED');
      expect(by[ch].provider).toBeNull();
    }
    expect(listChannels().filter((c) => c.status === 'ACTIVE').map((c) => c.channel)).toEqual(['INTERNAL']);
  });

  it('notify() : une seule ligne interne créée, canaux externes NOT_SENT / NOT_CONNECTED, aucune exception', async () => {
    const before = count('SELECT COUNT(*) c FROM notifications WHERE userId = ?', C.userId);
    const results = await notify({ userId: C.userId, title: 'Test canaux', body: 'Corps', type: 'SYSTEM', data: { k: 1 } }, ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']);
    expect(results.find((r) => r.channel === 'INTERNAL')?.status).toBe('SENT');
    for (const ch of ['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']) {
      const res = results.find((r) => r.channel === ch)!;
      expect(res.status).toBe('NOT_SENT');
      expect(res.reason).toBe('NOT_CONNECTED');
    }
    expect(count('SELECT COUNT(*) c FROM notifications WHERE userId = ?', C.userId)).toBe(before + 1);
    const list = await call('GET', '/notifications', { token: C.token });
    expect(list.data.some((n: any) => n.title === 'Test canaux')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('P2 — Migration 009 : index FK + référentiel, idempotente', () => {
  it('les index V3 existent et la migration est journalisée une seule fois', () => {
    const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as any[]).map((r) => r.name);
    for (const name of ['idx_debts_customer', 'idx_customers_store', 'idx_expenses_store_date', 'idx_sale_items_sale', 'idx_order_items_order', 'idx_employees_store', 'idx_products_store_online', 'idx_orders_store_status', 'idx_audit_logs_created']) {
      expect(idx).toContain(name);
    }
    expect(runAllMigrations(db)).toBe(0); // rien à ré-appliquer
    expect(count("SELECT COUNT(*) c FROM _migrations WHERE name = '009_v3_categories_indexes'")).toBe(1);
  });

  it('seedDefaultCategories est idempotent (0 insertion au 2e appel) et ne duplique pas un nom existant', () => {
    expect(seedDefaultCategories(db)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM categories WHERE slug = 'alimentaire'")).toBe(1);
  });
});
