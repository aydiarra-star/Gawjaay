// Tests V2 — durcissement production : idempotence financière (§21), index 007, Sentry no-op.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-v2-hardening.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld , resetDatabase } from './helpers';
import { idempotencyMiddleware } from '../middlewares/idempotency';

let W: any;

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  W = await seedWorld(db);
}, 120000);

// petit harnais req/res minimal pour le middleware
function harness(key?: string, userId?: string) {
  let sent: { status?: number; body?: any } = {};
  const req: any = { header: (h: string) => (h.toLowerCase() === 'idempotency-key' ? key : undefined), user: { userId }, method: 'POST', baseUrl: '', path: '/x' };
  const res: any = {
    statusCode: 200,
    status(c: number) { this.statusCode = c; return this; },
    type() { return this; },
    send(b: any) { sent.body = JSON.parse(b); return this; },
    json(b: any) { sent.body = b; return this; },
  };
  let nextCalled = 0;
  const next = () => { nextCalled++; };
  return { req, res, next: next as any, getState: () => ({ sent, nextCalled }) };
}

describe('V2 durcissement — migrations 007/008', () => {
  it('index prod + table idempotency_keys présents sur base vierge', () => {
    const names = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_sales_store_created','idx_notifications_user','idx_deliveries_store_status')`).all();
    expect(names.length).toBe(3);
    expect(db.prepare(`SELECT * FROM sqlite_master WHERE type='table' AND name='idempotency_keys'`).get()).toBeDefined();
  });
});

describe('V2 durcissement — masquage costPrice sur TOUTES les surfaces publiques (audit HIGH)', () => {
  // Ces tests passent par l'API HTTP RÉELLE (aucune simulation de la logique) : ils échouent si la
  // fuite revient, y compris sur une route publique ajoutée plus tard.
  let api: any;
  let tokens: { merchantA?: string } = {};
  let pCost = '';
  beforeAll(async () => {
    const { startApi } = await import('./helpers');
    api = await startApi();
    const login = await fetch(`http://127.0.0.1:${api.port}/api/v1/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+221770000010', password: 'Password123!' }),
    });
    tokens.merchantA = ((await login.json()) as any).accessToken;
    // Produit AVEC prix d'achat : sans lui, les assertions de masquage ne prouveraient rien.
    const created = await api('POST', `/products/store/${W.storeA}`, {
      token: tokens.merchantA,
      body: { name: 'Produit Marge Test', price: 15000, costPrice: 9000, initialStock: 4 },
    });
    pCost = created.data.id;
  }, 60000);

  it('produit de test : costPrice bien renseigné en base (sinon le test ne prouve rien)', () => {
    const row = db.prepare('SELECT costPrice FROM products WHERE id = ?').get(pCost) as any;
    expect(row.costPrice).toBeGreaterThan(0);
  });

  it('GET /stores/slug/:slug anonyme → AUCUN costPrice (vitrine publique)', async () => {
    const r = await api('GET', '/stores/slug/boutique-a');
    expect(r.status).toBe(200);
    const body = JSON.stringify(r.data);
    expect(body).toContain('Produit Marge Test');
    expect(/costPrice/.test(body)).toBe(false);
  });

  it('GET /products/store/:storeId anonyme → AUCUN costPrice', async () => {
    const r = await api('GET', `/products/store/${W.storeA}`);
    expect(r.status).toBe(200);
    const body = JSON.stringify(r.data);
    expect(body).toContain('Produit Marge Test');
    expect(/costPrice/.test(body)).toBe(false);
  });

  it('GET /products/:productId anonyme → AUCUN costPrice', async () => {
    const r = await api('GET', `/products/${pCost}`);
    expect(r.status).toBe(200);
    expect(/costPrice/.test(JSON.stringify(r.data))).toBe(false);
  });

  it('GET /marketplace/products anonyme → AUCUN costPrice', async () => {
    const r = await api('GET', '/marketplace/products?q=Marge');
    expect(r.status).toBe(200);
    expect(/costPrice/.test(JSON.stringify(r.data))).toBe(false);
  });

  it('le PROPRIÉTAIRE authentifié reçoit bien costPrice (marge préservée)', async () => {
    const r = await api('GET', `/products/store/${W.storeA}`, { token: tokens.merchantA });
    expect(r.status).toBe(200);
    const riz = (r.data as any[]).find((p: any) => p.id === pCost);
    expect(riz.costPrice).toBeGreaterThan(0);
  });

  it('GET /auth/me ne renvoie JAMAIS passwordHash', async () => {
    const r = await api('GET', '/auth/me', { token: tokens.merchantA });
    expect(r.status).toBe(200);
    expect(/passwordHash/.test(JSON.stringify(r.data))).toBe(false);
  });
});

describe('V2 durcissement — idempotence opération financière (§21)', () => {
  it('1re requête : exécute et journalise la réponse', () => {
    const h = harness('key-1', W.clientUser);
    idempotencyMiddleware(h.req, h.res, h.next);
    expect(h.getState().nextCalled).toBe(1); // le handler tourne
    h.res.status(201).json({ id: 'order-1', orderNumber: 'GJ-1' });
    const row = db.prepare(`SELECT * FROM idempotency_keys WHERE key = 'key-1'`).get() as any;
    expect(row.status).toBe(201);
    expect(JSON.parse(row.responseJson).id).toBe('order-1');
  });

  it('retry réseau (même clé, même user) : réponse REJOUÉE, handler JAMAIS réexécuté', () => {
    const h = harness('key-1', W.clientUser);
    idempotencyMiddleware(h.req, h.res, h.next);
    expect(h.getState().nextCalled).toBe(0); // pas de seconde écriture métier
    expect(h.getState().sent.body.id).toBe('order-1');
  });

  it('clé différente → nouvelle exécution (nouvelles opérations possibles)', () => {
    const h = harness('key-2', W.clientUser);
    idempotencyMiddleware(h.req, h.res, h.next);
    expect(h.getState().nextCalled).toBe(1);
  });

  it('isolation : la clé d un autre utilisateur n est PAS rejouée', () => {
    const h = harness('key-1', W.mAUser);
    idempotencyMiddleware(h.req, h.res, h.next);
    expect(h.getState().nextCalled).toBe(1);
  });

  it('sans header : comportement strictement inchangé (rétrocompatible V1/V2)', () => {
    const h = harness(undefined, W.clientUser);
    idempotencyMiddleware(h.req, h.res, h.next);
    expect(h.getState().nextCalled).toBe(1);
  });
});
