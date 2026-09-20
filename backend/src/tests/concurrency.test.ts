// Tests de CONCURRENCE (§7/§12) — pas de stock négatif, pas de double vente, pas de double action IA.
// Ces tests passent par l'API HTTP réelle (Promise.all) : c'est la seule façon crédible de
// reproduire deux caissiers agissant en même temps sur le dernier article en stock.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-concurrency.db'; });

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { resetDatabase } from './helpers';

let api: any;
let token: string;
let storeId: string;

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  const { startApi } = await import('./helpers');
  api = await startApi();

  const reg = await fetch(`http://127.0.0.1:${api.port}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+221770009999', password: 'Password123!', role: 'MERCHANT' }),
  });
  const regBody = (await reg.json()) as any;
  token = regBody.accessToken;
  const store = await apiFetch('POST', '/stores', { body: { name: 'Boutique Concurrence' } });
  storeId = store.data.id;
}, 120000);

afterAll(async () => { if (api) await api.close(); });

async function apiFetch(method: string, path: string, opts: { body?: any; key?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (opts.key) headers['Idempotency-Key'] = opts.key;
  const res = await fetch(`http://127.0.0.1:${api.port}/api/v1${path}`, {
    method, headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* vide */ }
  return { status: res.status, data };
}

async function createProduct(name: string, stock: number) {
  const r = await apiFetch('POST', `/products/store/${storeId}`, { body: { name, price: 1000, initialStock: stock } });
  return r.data.id as string;
}

function stockOf(productId: string): number {
  const row = db.prepare('SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?').get(storeId, productId) as any;
  return Number(row?.quantity);
}

describe('Concurrence — ventes simultanées sur stock limité', () => {
  it('10 ventes concurrentes pour 5 articles → 5 succès, 5 refus, stock = 0 (jamais négatif)', async () => {
    const pid = await createProduct('Article Rare', 5);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        apiFetch('POST', `/sales/store/${storeId}`, { body: { items: [{ productId: pid, quantity: 1 }], paymentMethod: 'CASH' } })
      )
    );
    const ok = results.filter((r) => r.status === 201).length;
    const refused = results.filter((r) => r.status === 400 || r.status === 409).length;
    expect(ok).toBe(5);
    expect(refused).toBe(5);
    expect(stockOf(pid)).toBe(0);
  }, 60000);

  it('ventes concurrentes multi-lignes : aucune ne descend le stock sous zéro', async () => {
    // Le stock du produit B est volontairement le point de contention : la 1re ligne (A, stock
    // abondant) force un point de suspension (await) avant le traitement de B.
    const a = await createProduct('Article Abondant', 100);
    const b = await createProduct('Article Conteste', 1);
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        apiFetch('POST', `/sales/store/${storeId}`, {
          body: { items: [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }], paymentMethod: 'CASH' },
        })
      )
    );
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(1);
    expect(stockOf(b)).toBe(0);
    expect(stockOf(b)).toBeGreaterThanOrEqual(0);
  }, 60000);

  it('deux ventes concurrentes du MÊME produit : le stock total débité correspond aux ventes acceptées', async () => {
    const pid = await createProduct('Article Compte', 10);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        apiFetch('POST', `/sales/store/${storeId}`, { body: { items: [{ productId: pid, quantity: 2 }], paymentMethod: 'CASH' } })
      )
    );
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(5); // 5 × 2 = 10
    expect(stockOf(pid)).toBe(0);
    const movements = db.prepare(`SELECT COUNT(*) as c FROM inventory_movements WHERE productId = ? AND type = 'SALE'`).get(pid) as any;
    expect(Number(movements.c)).toBe(5); // autant de mouvements que de ventes acceptées
  }, 60000);
});

describe('Concurrence — commandes et actions IA', () => {
  it('confirmation concurrente d une action IA → une seule exécution (pas de double traitement)', async () => {
    const action = await apiFetch('POST', '/assistant/actions', {
      body: { storeId, actionType: 'SEND_LOW_STOCK_ALERT' },
    });
    expect(action.status).toBe(201);
    const id = action.data.id;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => apiFetch('POST', `/assistant/actions/${id}/confirm`, { body: { confirmed: true } }))
    );
    const executed = results.filter((r) => r.status === 200 && r.data?.status === 'EXECUTED').length;
    expect(executed).toBeLessThanOrEqual(1);
    const row = db.prepare('SELECT status FROM ai_action_requests WHERE id = ?').get(id) as any;
    expect(row.status).toBe('EXECUTED');
  }, 60000);
});
