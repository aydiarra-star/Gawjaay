import db, { cuid } from '../../lib/db';
import crypto from 'crypto';
import { env } from '../../config/env';

function nowIso(){ return new Date().toISOString(); }

interface PaymentProvider {
  initiate(amount: number, phone?: string): Promise<{ providerRef: string; transactionId: string }>;
  verify(transactionId: string): Promise<{ status: 'SUCCESS'|'FAILED'|'PENDING'; raw: any }>;
}

class WaveSandbox implements PaymentProvider {
  async initiate(amount: number, phone?: string) {
    const transactionId = `WAVE-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const providerRef = `wave_ref_${transactionId}`;
    return { transactionId, providerRef };
  }
  async verify(transactionId: string) {
    if (transactionId.includes('FAIL')) return { status: 'FAILED' as const, raw: { reason: 'Simulated failure' } };
    return { status: 'SUCCESS' as const, raw: { verifiedAt: new Date().toISOString(), provider: 'WAVE_SANDBOX' } };
  }
}
class OrangeMoneySandbox implements PaymentProvider {
  async initiate(amount: number, phone?: string) {
    const transactionId = `OM-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const providerRef = `om_ref_${transactionId}`;
    return { transactionId, providerRef };
  }
  async verify(transactionId: string) {
    if (transactionId.includes('FAIL')) return { status: 'FAILED' as const, raw: { reason: 'Simulated failure' } };
    return { status: 'SUCCESS' as const, raw: { verifiedAt: new Date().toISOString(), provider: 'OM_SANDBOX' } };
  }
}

const providers: Record<string, PaymentProvider> = {
  WAVE: new WaveSandbox(),
  ORANGE_MONEY: new OrangeMoneySandbox(),
};

export async function initiatePayment(orderId: string, provider: string, phone?: string, idempotencyKey?: string) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
  const existingPayment = db.prepare('SELECT * FROM payments WHERE orderId = ?').get(orderId) as any;
  if (existingPayment && existingPayment.status === 'SUCCESS') throw Object.assign(new Error('Déjà payé'), { status: 400 });

  const key = idempotencyKey || `${orderId}-${provider}-${Date.now()}`;
  const existingByKey = db.prepare('SELECT * FROM payments WHERE idempotencyKey = ?').get(key) as any;
  if (existingByKey) return existingByKey;

  const prov = providers[provider];
  if (!prov) throw Object.assign(new Error('Provider non supporté'), { status: 400 });

  const { transactionId, providerRef } = await prov.initiate(order.totalAmount, phone);

  if (existingPayment) {
    db.prepare('UPDATE payments SET provider = ?, status = ?, amount = ?, transactionId = ?, providerRef = ?, idempotencyKey = ?, updatedAt = ? WHERE orderId = ?')
      .run(provider, 'PENDING', order.totalAmount, transactionId, providerRef, key, nowIso(), orderId);
  } else {
    db.prepare('INSERT INTO payments (id, orderId, provider, status, amount, transactionId, providerRef, idempotencyKey, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(cuid(), orderId, provider, 'PENDING', order.totalAmount, transactionId, providerRef, key, nowIso(), nowIso());
  }
  return db.prepare('SELECT * FROM payments WHERE orderId = ?').get(orderId);
}

export async function verifyPayment(paymentId: string) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
  if (!payment) throw Object.assign(new Error('Paiement introuvable'), { status: 404 });
  const prov = providers[payment.provider];
  if (!prov) throw Object.assign(new Error('Provider non supporté'), { status: 400 });
  const result = await prov.verify(payment.transactionId!);

  let newStatus = 'PENDING';
  if (result.status === 'SUCCESS') newStatus = 'SUCCESS';
  else if (result.status === 'FAILED') newStatus = 'FAILED';

  db.prepare('UPDATE payments SET status = ?, rawResponse = ?, verifiedAt = ?, updatedAt = ? WHERE id = ?')
    .run(newStatus, JSON.stringify(result.raw), newStatus === 'SUCCESS' ? nowIso() : null, nowIso(), paymentId);

  if (newStatus === 'SUCCESS') {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.orderId) as any;
    if (order) {
      db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
        .run(cuid(), order.clientId, 'Paiement confirmé', `Paiement ${payment.amount} FCFA confirmé pour commande ${order.orderNumber}`, 'PAYMENT', JSON.stringify({ orderId: order.id, paymentId }), nowIso());
      const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.storeId) as any;
      if (store) {
        const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(store.merchantId) as any;
        if (merchant) {
          db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
            .run(cuid(), merchant.userId, 'Paiement reçu', `Paiement ${payment.amount} FCFA pour commande ${order.orderNumber}`, 'PAYMENT', JSON.stringify({ orderId: order.id }), nowIso());
        }
      }
    }
  }

  return db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
}

export async function webhookVerify(provider: string, transactionId: string, signature: string, payload: any) {
  const secret = provider === 'WAVE' ? env.WAVE_WEBHOOK_SECRET : env.OM_WEBHOOK_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  if (signature !== expected) throw Object.assign(new Error('Signature webhook invalide'), { status: 401 });
  const payment = db.prepare('SELECT * FROM payments WHERE transactionId = ?').get(transactionId) as any;
  if (!payment) throw Object.assign(new Error('Paiement introuvable pour webhook'), { status: 404 });
  return verifyPayment(payment.id);
}

export async function listPayments(storeId?: string) {
  if (storeId) {
    const orders = db.prepare('SELECT id FROM orders WHERE storeId = ?').all(storeId) as any[];
    const ids = orders.map(o=>o.id);
    if (!ids.length) return [];
    const placeholders = ids.map(()=>'?').join(',');
    return db.prepare(`SELECT * FROM payments WHERE orderId IN (${placeholders}) ORDER BY createdAt DESC`).all(...ids);
  }
  return db.prepare('SELECT * FROM payments ORDER BY createdAt DESC LIMIT 100').all();
}
