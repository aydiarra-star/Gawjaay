// Tests V2 — durcissement production : idempotence financière (§21), index 007, Sentry no-op.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = 'file:./test-v2-hardening.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld } from './helpers';
import { idempotencyMiddleware } from '../middlewares/idempotency';

let W: any;

beforeAll(async () => {
  bootstrap();
  db.exec(`PRAGMA foreign_keys = OFF;
    DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM notifications; DELETE FROM employees;
    DELETE FROM idempotency_keys; DELETE FROM delivery_proofs; DELETE FROM deliveries;
    DELETE FROM payments; DELETE FROM debt_payments; DELETE FROM debts;
    DELETE FROM order_items; DELETE FROM orders; DELETE FROM sale_items; DELETE FROM sales;
    DELETE FROM b2b_order_items; DELETE FROM b2b_orders; DELETE FROM b2b_catalog_items; DELETE FROM b2b_catalogs;
    DELETE FROM b2b_profiles; DELETE FROM replenishment_suggestions;
    DELETE FROM loyalty_transactions; DELETE FROM loyalty_accounts; DELETE FROM favorites;
    DELETE FROM coupon_redemptions; DELETE FROM coupons; DELETE FROM promotion_products; DELETE FROM promotions;
    DELETE FROM review_reports; DELETE FROM moderation_actions; DELETE FROM reviews;
    DELETE FROM inventory_count_items; DELETE FROM inventory_counts;
    DELETE FROM purchase_items; DELETE FROM purchases; DELETE FROM expenses;
    DELETE FROM inventory_movements; DELETE FROM inventories; DELETE FROM products;
    DELETE FROM drivers; DELETE FROM stores; DELETE FROM merchants; DELETE FROM users; DELETE FROM categories;
    PRAGMA foreign_keys = ON;`);
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
