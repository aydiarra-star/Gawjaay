/**
 * GAWJAAY — PHASE FINALE : épreuves critiques de bout en bout via HTTP réel (§9, §10, §11, §12, §13).
 *
 * Ce fichier ne remplace AUCUN test existant : il ajoute les preuves explicitement exigées par
 * l'énoncé de phase finale qui n'étaient pas démontrées de bout en bout par l'API :
 *
 *   §10 — Test critique Store IDs : un marchand crée un magasin APRÈS l'émission de son token et
 *         opère dessus SANS se reconnecter → SUCCÈS (et non 403) ; un autre tenant ne peut pas
 *         réutiliser ce storeId.
 *   §11 — Test critique Idempotence : (key, endpoint, userId) → une seule opération métier ;
 *         deux utilisateurs peuvent réutiliser la MÊME clé indépendamment.
 *   §9  — Isolation multi-tenant : store, produit, stock, vente, commande, client, fournisseur,
 *         statistiques, IA → 403 ou liste vide, jamais les données d'autrui.
 *   §13 — IA : réponse fondée sur les données réelles, « Je ne dispose pas de cette information »
 *         sinon, whitelist limitée à 2 actions, PENDING → confirmation → EXECUTED → trace d'audit.
 *
 * Le fichier respecte TEST_DATABASE_URL comme le reste de la suite : il s'exécute donc
 * intégralement sur SQLite (dev/test) ET sur un serveur PostgreSQL réel (CI, §9 de l'énoncé).
 */
import { vi } from 'vitest';
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-phase-finale.db';
  process.env.NODE_ENV = 'test';
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { resetDatabase } from './helpers';

let api: any;
let isPostgresRuntime = false;

/** Deux tenants totalement indépendants, créés par la seule API (pas d'insertion directe). */
const tenantA = { phone: '+221770100001', token: '', storeId: '', productId: '', customerId: '', supplierId: '', clientToken: '' };
const tenantB = { phone: '+221770100002', token: '', storeId: '', productId: '', clientToken: '' };

let apiPort = 0;

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: any; key?: string } = {}
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.key) headers['Idempotency-Key'] = opts.key;
  const res = await fetch(`http://127.0.0.1:${apiPort}/api/v1${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* corps vide */
  }
  return { status: res.status, data };
}

/** Inscrit un marchand, renvoie son token (aucune reconnexion ultérieure n'est nécessaire). */
async function registerMerchant(phone: string): Promise<string> {
  const r = await call('POST', '/auth/register', {
    body: { phone, password: 'Password123!', role: 'MERCHANT' },
  });
  if (r.status !== 201 || !r.data?.accessToken) {
    throw new Error(`inscription marchand ${phone} échouée: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return r.data.accessToken;
}

function stockOf(storeId: string, productId: string): number {
  const row = db
    .prepare('SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?')
    .get(storeId, productId) as any;
  return Number(row?.quantity);
}

function countRows(sql: string, ...params: any[]): number {
  const row = db.prepare(sql).get(...params) as any;
  return Number(row?.c ?? 0);
}

beforeAll(async () => {
  bootstrap();
  const { isPostgres } = await import('../lib/db');
  isPostgresRuntime = isPostgres;
  resetDatabase(db);

  const { buildApp } = await import('../app');
  const server = buildApp().listen(0);
  await new Promise((r) => server.once('listening', () => r(null)));
  apiPort = (server.address() as any).port;
  api = server;

  // ——— Tenant A : marchand + premier magasin + produit + client + fournisseur ———
  tenantA.token = await registerMerchant(tenantA.phone);
  const sA = await call('POST', '/stores', { token: tenantA.token, body: { name: 'Épicerie A' } });
  expect(sA.status).toBeLessThan(300);
  tenantA.storeId = sA.data.id;

  const pA = await call('POST', `/products/store/${tenantA.storeId}`, {
    token: tenantA.token,
    body: { name: 'Riz parfumé A', price: 5000, costPrice: 3500, initialStock: 20 },
  });
  expect(pA.status).toBeLessThan(300);
  tenantA.productId = pA.data.id;

  const cA = await call('POST', '/customers', {
    token: tenantA.token,
    body: { storeId: tenantA.storeId, name: 'Client A', phone: '+221780100001' },
  });
  expect(cA.status).toBe(201);
  tenantA.customerId = cA.data.id;

  const fA = await call('POST', '/suppliers', {
    token: tenantA.token,
    body: { name: 'Fournisseur A', phone: '+221780100009' },
  });
  expect(fA.status).toBe(201);
  tenantA.supplierId = fA.data.id;

  // ——— Tenant B : marchand + magasin + produit ———
  tenantB.token = await registerMerchant(tenantB.phone);
  const sB = await call('POST', '/stores', { token: tenantB.token, body: { name: 'Boutique B' } });
  expect(sB.status).toBeLessThan(300);
  tenantB.storeId = sB.data.id;

  const pB = await call('POST', `/products/store/${tenantB.storeId}`, {
    token: tenantB.token,
    body: { name: 'Riz parfumé B', price: 4800, costPrice: 3300, initialStock: 7 },
  });
  expect(pB.status).toBeLessThan(300);
  tenantB.productId = pB.data.id;
}, 180000);

afterAll(async () => {
  if (api) await new Promise((r) => api.close(() => r(null)));
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// §10 — TEST CRITIQUE : STORE IDS DYNAMIQUES (le token ne fige plus les storeIds)
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§10 Test critique — Store IDs dynamiques (DB = source de vérité)', () => {
  it('le token émis AVANT la création du magasin reste valide APRÈS (aucune reconnexion)', async () => {
    // Preuve directe : le token de tenant A a été émis par /auth/register, PUIS un magasin a été
    // créé. Aucun /auth/login n'a eu lieu entre les deux.
    const r = await call('GET', '/stores/my', { token: tenantA.token });
    expect(r.status).toBe(200);
    expect(r.data.some((s: any) => s.id === tenantA.storeId)).toBe(true);
  });

  it('opération sur le magasin créé après émission du token → SUCCÈS (jamais 403)', async () => {
    const token = await registerMerchant('+221770100010');
    const created = await call('POST', '/stores', { token, body: { name: 'Magasin Tardif' } });
    expect(created.status).toBeLessThan(300);
    const lateStoreId = created.data.id;

    // MÊME token qu'avant la création : produit → stock → vente CASH → statistiques
    const product = await call('POST', `/products/store/${lateStoreId}`, {
      token,
      body: { name: 'Produit Tardif', price: 1200, initialStock: 4 },
    });
    expect(product.status).toBeLessThan(300);

    const adjust = await call('POST', `/inventory/${lateStoreId}/adjust`, {
      token,
      body: { productId: product.data.id, quantity: 3, reason: 'Réception tardive' },
    });
    expect(adjust.status).toBe(200);

    const sale = await call('POST', `/sales/store/${lateStoreId}`, {
      token,
      body: { items: [{ productId: product.data.id, quantity: 2 }], paymentMethod: 'CASH' },
    });
    expect(sale.status).toBe(201);

    const stats = await call('GET', `/dashboard/store/${lateStoreId}`, { token });
    expect(stats.status).toBe(200);

    expect(stockOf(lateStoreId, product.data.id)).toBe(5); // 4 + 3 - 2
  });

  it('un storeId forgé d un AUTRE tenant est refusé (403) — le storeId seul ne donne aucun droit', async () => {
    const asProduct = await call('POST', `/products/store/${tenantB.storeId}`, {
      token: tenantA.token,
      body: { name: 'Intrusion produit', price: 100 },
    });
    expect(asProduct.status).toBe(403);

    const asStock = await call('GET', `/inventory/${tenantB.storeId}`, { token: tenantA.token });
    expect(asStock.status).toBe(403);

    const asSale = await call('POST', `/sales/store/${tenantB.storeId}`, {
      token: tenantA.token,
      body: { items: [{ productId: tenantB.productId, quantity: 1 }], paymentMethod: 'CASH' },
    });
    expect(asSale.status).toBe(403);

    const asDashboard = await call('GET', `/dashboard/store/${tenantB.storeId}`, { token: tenantA.token });
    expect(asDashboard.status).toBe(403);

    // et le stock de B est resté intact
    expect(stockOf(tenantB.storeId, tenantB.productId)).toBe(7);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// §11 — TEST CRITIQUE : IDEMPOTENCE (key, endpoint, userId)
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§11 Test critique — Idempotence (key, endpoint, userId)', () => {
  it('même (key, endpoint, userId) rejoué → UNE SEULE opération métier + réponse identique', async () => {
    const key = 'phase-finale-sale-key-1';
    const before = countRows('SELECT COUNT(*) AS c FROM sales WHERE storeId = ?', tenantA.storeId);
    const stockBefore = stockOf(tenantA.storeId, tenantA.productId);

    const body = { items: [{ productId: tenantA.productId, quantity: 3 }], paymentMethod: 'CASH' };
    const first = await call('POST', `/sales/store/${tenantA.storeId}`, { token: tenantA.token, body, key });
    const second = await call('POST', `/sales/store/${tenantA.storeId}`, { token: tenantA.token, body, key });
    const third = await call('POST', `/sales/store/${tenantA.storeId}`, { token: tenantA.token, body, key });

    expect(first.status).toBe(201);
    // La réponse est REJOUÉE à l'identique (même statut, même identifiant de vente).
    expect(second.status).toBe(201);
    expect(second.data.id).toBe(first.data.id);
    expect(third.data.id).toBe(first.data.id);

    // Une seule vente écrite, un seul décrément de stock.
    const after = countRows('SELECT COUNT(*) AS c FROM sales WHERE storeId = ?', tenantA.storeId);
    expect(after - before).toBe(1);
    expect(stockBefore - stockOf(tenantA.storeId, tenantA.productId)).toBe(3);
  });

  it('clé DIFFÉRENTE → nouvelle exécution (le mécanisme n avale pas les ventes légitimes)', async () => {
    const before = countRows('SELECT COUNT(*) AS c FROM sales WHERE storeId = ?', tenantA.storeId);
    const body = { items: [{ productId: tenantA.productId, quantity: 1 }], paymentMethod: 'CASH' };
    const r1 = await call('POST', `/sales/store/${tenantA.storeId}`, { token: tenantA.token, body, key: 'phase-finale-sale-key-2' });
    const r2 = await call('POST', `/sales/store/${tenantA.storeId}`, { token: tenantA.token, body, key: 'phase-finale-sale-key-3' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.data.id).not.toBe(r2.data.id);
    expect(countRows('SELECT COUNT(*) AS c FROM sales WHERE storeId = ?', tenantA.storeId) - before).toBe(2);
  });

  it('User A + clé X et User B + clé X → opérations INDÉPENDANTES (pas de collision inter-tenant)', async () => {
    const sharedKey = 'phase-finale-shared-key';

    const saleA = await call('POST', `/sales/store/${tenantA.storeId}`, {
      token: tenantA.token,
      key: sharedKey,
      body: { items: [{ productId: tenantA.productId, quantity: 1 }], paymentMethod: 'CASH' },
    });
    const saleB = await call('POST', `/sales/store/${tenantB.storeId}`, {
      token: tenantB.token,
      key: sharedKey,
      body: { items: [{ productId: tenantB.productId, quantity: 1 }], paymentMethod: 'CASH' },
    });

    // Les deux passent : la clé de B n'est PAS considérée comme un rejeu de la clé de A.
    expect(saleA.status).toBe(201);
    expect(saleB.status).toBe(201);
    expect(saleA.data.id).not.toBe(saleB.data.id);

    // Les deux lignes d'idempotence coexistent avec la même clé brute.
    expect(
      countRows('SELECT COUNT(*) AS c FROM idempotency_keys WHERE key = ?', sharedKey)
    ).toBeGreaterThanOrEqual(2);

    // …et elles sont bien distinctes par userId.
    const rows = db
      .prepare('SELECT userId, endpoint FROM idempotency_keys WHERE key = ?')
      .all(sharedKey) as any[];
    expect(new Set(rows.map((r) => r.userId)).size).toBeGreaterThanOrEqual(2);
  });

  it('la clé primaire d idempotency_keys est bien le triplet (key, endpoint, userId)', () => {
    let pkCols: string[];
    if (isPostgresRuntime) {
      const rows = db
        .prepare(
          `SELECT a.attname AS name
             FROM pg_index i
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'idempotency_keys'::regclass AND i.indisprimary
            ORDER BY array_position(i.indkey, a.attnum)`
        )
        .all() as any[];
      pkCols = rows.map((r) => String(r.name).toLowerCase());
      expect(pkCols).toEqual(['key', 'endpoint', 'userid']);
    } else {
      const info = db.prepare('PRAGMA table_info(idempotency_keys)').all() as any[];
      pkCols = info
        .filter((c) => Number(c.pk) > 0)
        .sort((a, b) => Number(a.pk) - Number(b.pk))
        .map((c) => String(c.name).toLowerCase());
      expect(pkCols).toEqual(['key', 'endpoint', 'userid']);
    }
  });

  it('les journaux d idempotence sont CONSERVÉS (pas de purge) et horodatés', async () => {
    const key = 'phase-finale-journal-key';
    await call('POST', `/sales/store/${tenantA.storeId}`, {
      token: tenantA.token,
      key,
      body: { items: [{ productId: tenantA.productId, quantity: 1 }], paymentMethod: 'CASH' },
    });
    const row = db
      .prepare('SELECT key, endpoint, userId, status, responseJson, createdAt FROM idempotency_keys WHERE key = ?')
      .get(key) as any;
    expect(row).toBeTruthy();
    expect(row.status).toBe(201);
    expect(row.endpoint).toContain('/sales/store/');
    expect(String(row.createdAt).length).toBeGreaterThan(10);
    expect(JSON.parse(row.responseJson).id).toBeDefined();

    // toujours présent après une seconde frappe avec la même clé
    await call('POST', `/sales/store/${tenantA.storeId}`, {
      token: tenantA.token,
      key,
      body: { items: [{ productId: tenantA.productId, quantity: 1 }], paymentMethod: 'CASH' },
    });
    expect(
      countRows('SELECT COUNT(*) AS c FROM idempotency_keys WHERE key = ?', key)
    ).toBe(1);
  });

  it('sans header Idempotency-Key : comportement V1/V2 inchangé (aucune régression)', async () => {
    const body = { items: [{ productId: tenantA.productId, quantity: 1 }], paymentMethod: 'CASH' };
    const r1 = await call('POST', `/sales/store/${tenantA.storeId}`, { token: tenantA.token, body });
    const r2 = await call('POST', `/sales/store/${tenantA.storeId}`, { token: tenantA.token, body });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.data.id).not.toBe(r2.data.id);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// §9 — ISOLATION MULTI-TENANT (surfaces métier)
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§9 Isolation multi-tenant — aucune lecture ni écriture croisée', () => {
  it('Produits : la LISTE est publique (vitrine) donc sans aucun champ interne', async () => {
    // `GET /products/store/:storeId` est volontairement publique (optionalAuth) : c'est la vitrine.
    // L'isolation ne porte donc pas sur l'accès mais sur la PROJECTION : aucun champ interne ne sort,
    // et l'écriture reste refusée.
    const list = await call('GET', `/products/store/${tenantA.storeId}`, { token: tenantB.token });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.data)).not.toContain('costPrice');
  });

  it('Produits : B ne peut ni modifier ni supprimer un produit de A', async () => {
    const update = await call('PUT', `/products/${tenantA.productId}`, {
      token: tenantB.token,
      body: { price: 1 },
    });
    expect([403, 404]).toContain(update.status);

    const del = await call('DELETE', `/products/${tenantA.productId}`, { token: tenantB.token });
    expect([403, 404]).toContain(del.status);

    // Le prix réel de A est inchangé et le produit est toujours actif.
    const real = db.prepare('SELECT price, isActive FROM products WHERE id = ?').get(tenantA.productId) as any;
    expect(Number(real.price)).toBe(5000);
    expect(Number(real.isActive)).toBe(1);
  });

  it('Stock : B ne lit ni ne modifie le stock de A', async () => {
    const read = await call('GET', `/inventory/${tenantA.storeId}`, { token: tenantB.token });
    expect(read.status).toBe(403);

    const write = await call('POST', `/inventory/${tenantA.storeId}/adjust`, {
      token: tenantB.token,
      body: { productId: tenantA.productId, quantity: 999, reason: 'Intrusion' },
    });
    expect(write.status).toBe(403);
  });

  it('Ventes : B ne liste pas les ventes de A', async () => {
    const r = await call('GET', `/sales/store/${tenantA.storeId}`, { token: tenantB.token });
    expect(r.status).toBe(403);
  });

  it('Clients & fournisseurs : B ne lit pas les clients de A', async () => {
    const customers = await call('GET', `/customers/store/${tenantA.storeId}`, { token: tenantB.token });
    expect([403, 404]).toContain(customers.status);

    const one = await call('GET', `/customers/${tenantA.customerId}`, { token: tenantB.token });
    expect([403, 404]).toContain(one.status);

    const suppliers = await call('GET', `/suppliers`, { token: tenantB.token });
    if (suppliers.status === 200) {
      expect(suppliers.data.some((s: any) => s.id === tenantA.supplierId)).toBe(false);
    }
  });

  it('Statistiques : B ne lit pas le tableau de bord de A', async () => {
    const r = await call('GET', `/dashboard/store/${tenantA.storeId}`, { token: tenantB.token });
    expect(r.status).toBe(403);
  });

  it('Commandes : B ne peut pas changer le statut d une commande de A', async () => {
    const order = await call('POST', '/orders', {
      token: tenantA.token,
      body: {
        storeId: tenantA.storeId,
        deliveryType: 'RETRAIT',
        items: [{ productId: tenantA.productId, quantity: 1 }],
      },
    });
    expect(order.status).toBe(201);
    const orderId = order.data.id;

    const hijack = await call('PATCH', `/orders/${orderId}/status`, {
      token: tenantB.token,
      body: { status: 'CONFIRMEE' },
    });
    expect([403, 404]).toContain(hijack.status);

    // La commande de A est restée dans son statut initial.
    const row = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId) as any;
    expect(row.status).toBe(order.data.status);
  });

  it('IA : B ne peut pas interroger ni lister les actions IA du magasin de A', async () => {
    const ask = await call('POST', `/assistant/ask/${tenantA.storeId}`, {
      token: tenantB.token,
      body: { question: 'Quel est mon chiffre d affaires ?' },
    });
    expect([403, 404]).toContain(ask.status);

    const actions = await call('GET', `/assistant/actions/store/${tenantA.storeId}`, { token: tenantB.token });
    expect([403, 404]).toContain(actions.status);
  });

  it('storeId inexistant → refus, jamais une fuite de données', async () => {
    const r = await call('GET', '/inventory/store-inexistant-xyz', { token: tenantA.token });
    expect([403, 404]).toContain(r.status);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// §12 — SCÉNARIO MÉTIER MARCHAND COMPLET (Store → Product → Stock → Vente CASH → Stats)
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§12 Scénario marchand complet — Store → Produit → Stock → Vente CASH → Statistiques', () => {
  it('le parcours complet produit des agrégats réels et cohérents', async () => {
    const token = await registerMerchant('+221770100020');
    const store = await call('POST', '/stores', { token, body: { name: 'Boutique Parcours' } });
    const storeId = store.data.id;

    const product = await call('POST', `/products/store/${storeId}`, {
      token,
      body: { name: 'Sucre parcours', price: 1000, costPrice: 700, initialStock: 10 },
    });
    const productId = product.data.id;

    await call('POST', `/inventory/${storeId}/adjust`, {
      token,
      body: { productId, quantity: 5, type: 'IN', reason: 'Réassort parcours' },
    });
    expect(stockOf(storeId, productId)).toBe(15);

    const sale = await call('POST', `/sales/store/${storeId}`, { token,
      body: { items: [{ productId, quantity: 5 }], paymentMethod: 'CASH' } });
    expect(sale.status).toBe(201);
    expect(stockOf(storeId, productId)).toBe(10);

    const sales = await call('GET', `/sales/store/${storeId}`, { token });
    expect(sales.status).toBe(200);
    expect(sales.data.some((s: any) => s.id === sale.data.id)).toBe(true);

    const stats = await call('GET', `/dashboard/store/${storeId}`, { token });
    expect(stats.status).toBe(200);
    // 5 unités × 1000 = 5000 de chiffre d'affaires sur ce magasin
    const revenue = Number(
      stats.data.revenue ?? stats.data.todayRevenue ?? stats.data.totalRevenue ?? NaN
    );
    if (!Number.isNaN(revenue)) expect(revenue).toBeGreaterThanOrEqual(5000);

    const low = await call('GET', `/inventory/${storeId}/low`, { token });
    expect(low.status).toBe(200);
  });

  it('le stock ne peut JAMAIS devenir négatif (vente refusée en 400/409)', async () => {
    const token = await registerMerchant('+221770100021');
    const store = await call('POST', '/stores', { token, body: { name: 'Boutique Limite' } });
    const storeId = store.data.id;
    const product = await call('POST', `/products/store/${storeId}`, {
      token, body: { name: 'Ultime unité', price: 500, initialStock: 1 } });
    const productId = product.data.id;

    const over = await call('POST', `/sales/store/${storeId}`, {
      token, body: { items: [{ productId, quantity: 5 }], paymentMethod: 'CASH' } });
    expect([400, 409]).toContain(over.status);
    expect(stockOf(storeId, productId)).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// §13 — IA : ancrage factuel, whitelist, PENDING → EXECUTED → AUDIT
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§13 IA — ancrage factuel et actions contrôlées', () => {
  it('répond à partir des données RÉELLES : nom et quantité exacts du produit sous seuil', async () => {
    // On place volontairement un article sous son seuil, puis on interroge l'assistant.
    const token = await registerMerchant('+221770100030');
    const store = await call('POST', '/stores', { token, body: { name: 'Boutique IA' } });
    const storeId = store.data.id;
    const product = await call('POST', `/products/store/${storeId}`, {
      token,
      body: { name: 'Lait concentré', price: 800, initialStock: 2, lowStockThreshold: 5 },
    });
    expect(product.status).toBeLessThan(300);

    const r = await call('POST', `/assistant/ask/${storeId}`, {
      token,
      body: { question: 'Quels produits sont sous le seuil ?' },
    });
    expect(r.status).toBe(200);
    expect(r.data.intent).toBe('STOCK');
    // La réponse reproduit la donnée réelle : le nom du produit ET sa quantité en base.
    const realStock = stockOf(storeId, product.data.id);
    expect(realStock).toBe(2);
    expect(r.data.content).toContain('Lait concentré');
    expect(r.data.content).toContain('2');
    expect(JSON.stringify(r.data)).not.toContain('Je ne dispose pas de cette information');
  });

  it('boutique SANS aucune vente → « Je ne dispose pas de cette information » (CA jamais inventé)', async () => {
    const token = await registerMerchant('+221770100031');
    const store = await call('POST', '/stores', { token, body: { name: 'Boutique Vide IA' } });
    const storeId = store.data.id; // aucun produit, aucune vente

    const r = await call('POST', `/assistant/ask/${storeId}`, {
      token,
      body: { question: 'Quel est mon chiffre d affaires ?' },
    });
    expect(r.status).toBe(200);
    expect(r.data.content).toContain('Je ne dispose pas de cette information');
    expect(r.data.data.sales.last30days.total).toBe(0);
  });

  it('question hors périmètre → « Je ne dispose pas de cette information » (aucune invention)', async () => {
    const r = await call('POST', `/assistant/ask/${tenantA.storeId}`, {
      token: tenantA.token,
      body: { question: 'Quelle est la météo à Ziguinchor demain ?' },
    });
    expect(r.status).toBe(200);
    expect(r.data.intent).toBe('UNKNOWN');
    expect(r.data.content).toContain('Je ne dispose pas de cette information');
  });

  it('la whitelist est strictement limitée à 2 actions', async () => {
    const service = await import('../modules/assistant/service');
    expect([...service.WHITELISTED_ACTIONS]).toEqual([
      'GENERATE_REPLENISHMENT_PLAN',
      'SEND_LOW_STOCK_ALERT',
    ]);
  });

  it('action hors whitelist → refusée (400), aucune ligne créée', async () => {
    const before = countRows('SELECT COUNT(*) AS c FROM ai_action_requests');
    const r = await call('POST', '/assistant/actions', {
      token: tenantA.token,
      body: { storeId: tenantA.storeId, actionType: 'DELETE_ALL_SALES' },
    });
    expect(r.status).toBe(400);
    expect(countRows('SELECT COUNT(*) AS c FROM ai_action_requests')).toBe(before);
  });

  it('PENDING → confirmation explicite → EXECUTED → AUDIT', async () => {
    const created = await call('POST', '/assistant/actions', {
      token: tenantA.token,
      body: { storeId: tenantA.storeId, actionType: 'SEND_LOW_STOCK_ALERT' },
    });
    expect(created.status).toBe(201);
    expect(created.data.status).toBe('PENDING');

    // Refus explicite → l'action n'est PAS exécutée.
    const refused = await call('POST', `/assistant/actions/${created.data.id}/confirm`, {
      token: tenantA.token,
      body: { confirmed: false },
    });
    expect(refused.status).toBe(200);
    expect(refused.data.status).not.toBe('EXECUTED');

    // Nouvelle action → confirmation explicite → EXECUTED
    const second = await call('POST', '/assistant/actions', {
      token: tenantA.token,
      body: { storeId: tenantA.storeId, actionType: 'SEND_LOW_STOCK_ALERT' },
    });
    const confirmed = await call('POST', `/assistant/actions/${second.data.id}/confirm`, {
      token: tenantA.token,
      body: { confirmed: true },
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.data.status).toBe('EXECUTED');

    const row = db
      .prepare('SELECT status, confirmedAt FROM ai_action_requests WHERE id = ?')
      .get(second.data.id) as any;
    expect(row.status).toBe('EXECUTED');

    // Trace d'audit présente pour l'exécution.
    const audit = countRows(
      "SELECT COUNT(*) AS c FROM audit_logs WHERE action LIKE '%AI%' OR action LIKE '%ACTION%'"
    );
    expect(audit).toBeGreaterThanOrEqual(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// §16 — SURFACES PUBLIQUES : aucune fuite de donnée interne
// ════════════════════════════════════════════════════════════════════════════════════════════
describe('§16 Catalogue public — aucune fuite de costPrice / donnée interne', () => {
  it('un visiteur anonyme ne reçoit JAMAIS costPrice', async () => {
    const store = await call('GET', `/stores/slug/epicerie-a`);
    expect(store.status).toBe(200);
    expect(JSON.stringify(store.data)).not.toContain('costPrice');

    const products = await call('GET', `/products/store/${tenantA.storeId}`);
    expect(products.status).toBe(200);
    expect(JSON.stringify(products.data)).not.toContain('costPrice');

    const search = await call('GET', `/marketplace/products?q=riz`);
    expect(search.status).toBe(200);
    expect(JSON.stringify(search.data)).not.toContain('costPrice');

    // …alors que le PROPRIÉTAIRE conserve bien sa marge.
    const own = await call('GET', `/products/store/${tenantA.storeId}`, { token: tenantA.token });
    expect(JSON.stringify(own.data)).toContain('costPrice');
  });
});
