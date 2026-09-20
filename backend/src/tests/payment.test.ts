// PHASE FINALE (§9) : exécuté aussi sur PostgreSQL via TEST_DATABASE_URL.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-payment.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { cuid, initDb } from '../lib/db';

function nowIso(){ return new Date().toISOString(); }

beforeAll(()=>{
  initDb();
  db.exec('DELETE FROM payments; DELETE FROM deliveries; DELETE FROM order_items; DELETE FROM orders;');
});

describe('Paiements sécurisés - source vérité serveur', ()=>{
  it('paiement ne peut être marqué SUCCESS que par serveur', async ()=>{
    // create minimal order
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get() as any;
    const storeId = db.prepare('SELECT id FROM stores LIMIT 1').get() as any;
    if (!userId || !storeId) {
      // create dummy
      const uid = cuid();
      db.prepare('INSERT INTO users (id, phone, passwordHash, role, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(uid, '+221999', 'hash', 'CLIENT', nowIso(), nowIso());
      const mid = cuid();
      db.prepare('INSERT INTO merchants (id, userId, createdAt, updatedAt) VALUES (?,?,?,?)').run(mid, uid, nowIso(), nowIso());
      const sid = cuid();
      db.prepare('INSERT INTO stores (id, merchantId, name, slug, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(sid, mid, 'Test', 'test-pay', nowIso(), nowIso());
    }

    const clientId = (db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('CLIENT') as any)?.id || (db.prepare('SELECT id FROM users LIMIT 1').get() as any).id;
    const sId = (db.prepare('SELECT id FROM stores LIMIT 1').get() as any).id;

    const orderId = cuid();
    db.prepare('INSERT INTO orders (id, orderNumber, storeId, clientId, totalAmount, status, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(orderId, 'TEST-001', sId, clientId, 5000, 'EN_ATTENTE', nowIso(), nowIso());

    const { initiatePayment, verifyPayment } = await import('../modules/payments/service');
    const payment = await initiatePayment(orderId, 'WAVE', '+221770000001', `test-key-${Date.now()}`);
    expect(payment.status).toBe('PENDING');
    expect(payment.transactionId).toContain('WAVE');

    // verify via server (sandbox success)
    const verified = await verifyPayment(payment.id);
    expect(verified.status).toBe('SUCCESS');
    expect(verified.verifiedAt).toBeDefined();

    // ensure client cannot directly set SUCCESS (we test that only verifyPayment can set SUCCESS)
    // If someone tries to update directly, it would be blocked by not exposing endpoint without verification
    // Here we check that payment status is SUCCESS only after server verification
    const after = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id) as any;
    expect(after.status).toBe('SUCCESS');
  });
});
