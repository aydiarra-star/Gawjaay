/**
 * GAWJAAY V3 — Paiements en mode PRODUCTION PAR DÉFAUT (`PAYMENTS_MODE=disabled`).
 *
 * Défaut constaté lors de la vérification du build de production (node dist/index.js, PostgreSQL) :
 * `POST /payments/initiate` avec WAVE renvoyait **500 « Erreur interne serveur »** au lieu du **503**
 * explicite prévu — le gestionnaire d'erreurs repliait tout statut ≥ 500 en 500 générique.
 *
 * Ce fichier fige le comportement attendu quand AUCUN fournisseur de paiement n'est connecté :
 *   - capabilities : mode `disabled`, WAVE / ORANGE_MONEY / CARD indisponibles, CASH disponible ;
 *   - initiate WAVE / ORANGE_MONEY / CARD → 503 + message explicite (jamais de succès simulé, aucun
 *     paiement créé) ;
 *   - CASH → PENDING, confirmé par le marchand uniquement (le client ne peut jamais forcer SUCCESS) ;
 *   - une commande ANNULEE ne peut pas être payée.
 * S'exécute sur SQLite et sur PostgreSQL réel (TEST_DATABASE_URL).
 */
import { vi } from 'vitest';
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-v3-payments-disabled.db';
  process.env.NODE_ENV = 'test';
  process.env.PAYMENTS_MODE = 'disabled';
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { resetDatabase } from './helpers';

let server: any;
let apiPort = 0;
const M = { token: '', storeId: '', productId: '' };
const C = { token: '', orderId: '', cancelledOrderId: '' };

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
  return r.data.accessToken as string;
}
function count(sql: string, ...params: any[]) {
  return Number((db.prepare(sql).get(...params) as any)?.c ?? 0);
}

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  const { buildApp } = await import('../app');
  server = buildApp().listen(0);
  await new Promise((r) => server.once('listening', () => r(null)));
  apiPort = (server.address() as any).port;

  M.token = await register('+221773000001', 'MERCHANT');
  const s = await call('POST', '/stores', { token: M.token, body: { name: 'Boutique Paiements Off' } });
  expect(s.status).toBe(201);
  M.storeId = s.data.id;
  const p = await call('POST', `/products/store/${M.storeId}`, { token: M.token, body: { name: 'Sucre', price: 1500, initialStock: 10 } });
  expect(p.status).toBe(201);
  M.productId = p.data.id;
  C.token = await register('+221763000001', 'CLIENT');
  const o = await call('POST', '/orders', { token: C.token, body: { storeId: M.storeId, items: [{ productId: M.productId, quantity: 2 }], deliveryType: 'RETRAIT' } });
  expect(o.status).toBe(201);
  C.orderId = o.data.id;
  const o2 = await call('POST', '/orders', { token: C.token, body: { storeId: M.storeId, items: [{ productId: M.productId, quantity: 1 }], deliveryType: 'RETRAIT' } });
  expect(o2.status).toBe(201);
  C.cancelledOrderId = o2.data.id;
  expect((await call('PATCH', `/orders/${C.cancelledOrderId}/status`, { token: C.token, body: { status: 'CANCELLED' } })).status).toBe(200);
}, 180000);

afterAll(async () => {
  if (server) await new Promise((r) => server.close(() => r(null)));
});

describe('PAYMENTS_MODE=disabled (production par défaut) — NOT CONNECTED TO PRODUCTION PAYMENT PROVIDER', () => {
  it('capabilities : mode disabled, aucun fournisseur de production, seul CASH disponible', async () => {
    const r = await call('GET', '/payments/capabilities', { token: C.token });
    expect(r.status).toBe(200);
    expect(r.data.mode).toBe('disabled');
    expect(r.data.productionProviderConnected).toBe(false);
    const by = Object.fromEntries(r.data.methods.map((m: any) => [m.code, m.available]));
    expect(by.CASH).toBe(true);
    expect(by.WAVE).toBe(false);
    expect(by.ORANGE_MONEY).toBe(false);
    expect(by.CARD).toBe(false);
  });

  it('WAVE / ORANGE_MONEY / CARD → 503 explicite (pas 500), message clair, AUCUN paiement créé', async () => {
    for (const provider of ['WAVE', 'ORANGE_MONEY', 'CARD']) {
      const r = await call('POST', '/payments/initiate', { token: C.token, body: { orderId: C.orderId, provider } });
      expect(r.status).toBe(503);
      expect(r.data.code).toBe('SERVICE_UNAVAILABLE');
      expect(r.data.error).toContain(provider);
      expect(r.data.error).toContain('PAYMENTS_MODE=disabled');
    }
    // La commande porte son unique enregistrement de paiement créé à la commande (CASH / PENDING) :
    // aucun paiement mobile n'a été créé ni substitué, rien n'est passé en SUCCESS.
    expect(count("SELECT COUNT(*) c FROM payments WHERE orderId = ? AND provider IN ('WAVE','ORANGE_MONEY','CARD')", C.orderId)).toBe(0);
    expect(count("SELECT COUNT(*) c FROM payments WHERE orderId = ? AND status <> 'PENDING'", C.orderId)).toBe(0);
    expect(count('SELECT COUNT(*) c FROM payments WHERE orderId = ?', C.orderId)).toBe(1);
  });

  it('CASH : PENDING à l initiation ; verify ne change rien ; client ne confirme pas ; marchand confirme (SUCCESS + audit)', async () => {
    const init = await call('POST', '/payments/initiate', { token: C.token, body: { orderId: C.orderId, provider: 'CASH' } });
    expect(init.status).toBe(201);
    expect(init.data.status).toBe('PENDING');
    const paymentId = init.data.id;
    const verify = await call('POST', `/payments/${paymentId}/verify`, { token: C.token });
    expect(verify.status).toBe(200);
    expect(verify.data.status).toBe('PENDING');
    expect((await call('POST', `/payments/${paymentId}/confirm-cash`, { token: C.token })).status).toBe(403);
    expect(count("SELECT COUNT(*) c FROM payments WHERE id = ? AND status = 'PENDING'", paymentId)).toBe(1);
    const confirm = await call('POST', `/payments/${paymentId}/confirm-cash`, { token: M.token });
    expect(confirm.status).toBe(200);
    expect(confirm.data.status).toBe('SUCCESS');
    expect(count("SELECT COUNT(*) c FROM payments WHERE id = ? AND status = 'SUCCESS'", paymentId)).toBe(1);
    expect(count("SELECT COUNT(*) c FROM audit_logs WHERE action = 'PAYMENT_STATUS' AND resourceId = ?", paymentId)).toBeGreaterThanOrEqual(1);
  });

  it('commande annulée : aucun paiement possible (400), même en CASH', async () => {
    const r = await call('POST', '/payments/initiate', { token: C.token, body: { orderId: C.cancelledOrderId, provider: 'CASH' } });
    expect(r.status).toBe(400);
    // le paiement créé à la commande a été clos par l'annulation et n'est jamais réouvert
    expect(count("SELECT COUNT(*) c FROM payments WHERE orderId = ? AND status = 'CANCELLED'", C.cancelledOrderId)).toBe(1);
    expect(count("SELECT COUNT(*) c FROM payments WHERE orderId = ? AND status <> 'CANCELLED'", C.cancelledOrderId)).toBe(0);
  });

  it('webhook sans signature → 401 ; aucun paiement ne passe en SUCCESS par ce canal', async () => {
    const r = await call('POST', '/payments/webhook/WAVE', { body: { transactionId: 'x', status: 'SUCCESS' } });
    expect(r.status).toBe(401);
  });
});
