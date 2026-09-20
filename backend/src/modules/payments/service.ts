import db, { cuid } from '../../lib/db';
import crypto from 'crypto';
import { env } from '../../config/env';
import { withTransaction } from '../../lib/transaction';
import { recordAudit } from '../../lib/audit';

function nowIso(){ return new Date().toISOString(); }

/**
 * Paiements (PROJECT_RULES §6, cahier §19).
 *
 * ÉTAT RÉEL : **NOT CONNECTED TO PRODUCTION PAYMENT PROVIDER.**
 * - `PAYMENTS_MODE=sandbox` (dev/test/démo) : fournisseurs SIMULÉS côté serveur (WAVE / ORANGE_MONEY / CARD).
 *   Le statut SUCCESS n'est jamais décidé par le client : il résulte d'une vérification serveur (`verify`)
 *   ou d'un webhook signé HMAC. Le mode sandbox est REFUSÉ en production (config/env.ts).
 * - `PAYMENTS_MODE=disabled` (production par défaut) : aucun fournisseur → 503 explicite, seul CASH
 *   (encaissement confirmé par le marchand / livreur) est possible.
 * Un connecteur réel devra implémenter `PaymentProvider` ci-dessous (initiate + verify) et être branché
 * dans `providers` sans toucher au reste du flux (idempotence, notifications, audit).
 */
export interface PaymentProvider {
  readonly code: string;
  initiate(amount: number, phone?: string): Promise<{ providerRef: string; transactionId: string }>;
  verify(transactionId: string): Promise<{ status: 'SUCCESS'|'FAILED'|'PENDING'; raw: any }>;
}

export const MOBILE_PROVIDERS = ['WAVE', 'ORANGE_MONEY', 'CARD'] as const;
export const PAYMENT_METHODS = ['CASH', ...MOBILE_PROVIDERS] as const;

class SandboxProvider implements PaymentProvider {
  constructor(public readonly code: string) {}
  async initiate(_amount: number, _phone?: string) {
    const transactionId = `${this.code === 'ORANGE_MONEY' ? 'OM' : this.code}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const providerRef = `${this.code.toLowerCase()}_ref_${transactionId}`;
    return { transactionId, providerRef };
  }
  async verify(transactionId: string) {
    if (transactionId.includes('FAIL')) return { status: 'FAILED' as const, raw: { reason: 'Simulated failure', provider: `${this.code}_SANDBOX` } };
    return { status: 'SUCCESS' as const, raw: { verifiedAt: new Date().toISOString(), provider: `${this.code}_SANDBOX`, sandbox: true } };
  }
}

/** Fournisseur « non connecté » : refuse explicitement (jamais de succès fictif). */
class DisabledProvider implements PaymentProvider {
  constructor(public readonly code: string) {}
  async initiate(): Promise<never> {
    throw Object.assign(new Error(`Paiement ${this.code} indisponible : aucun fournisseur de paiement n est connecté (PAYMENTS_MODE=disabled)`), { status: 503 });
  }
  async verify(): Promise<never> {
    throw Object.assign(new Error(`Vérification ${this.code} indisponible : aucun fournisseur de paiement n est connecté`), { status: 503 });
  }
}

const providers: Record<string, PaymentProvider> = Object.fromEntries(
  MOBILE_PROVIDERS.map((code) => [code, env.PAYMENTS_MODE === 'sandbox' ? new SandboxProvider(code) : new DisabledProvider(code)]),
);

/** Capacités réelles exposées à l'UI (jamais de promesse non tenue). */
export function paymentCapabilities() {
  return {
    mode: env.PAYMENTS_MODE,
    productionProviderConnected: false,
    methods: PAYMENT_METHODS.map((m) => ({
      code: m,
      available: m === 'CASH' || env.PAYMENTS_MODE === 'sandbox',
      label: m === 'CASH' ? 'Espèces (confirmé par le marchand)' : env.PAYMENTS_MODE === 'sandbox' ? `${m} — SANDBOX (simulation)` : `${m} — non connecté`,
    })),
  };
}

export async function initiatePayment(orderId: string, provider: string, phone?: string, idempotencyKey?: string) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
  if (['ANNULEE','REJETEE'].includes(order.status)) throw Object.assign(new Error('Commande annulée : paiement impossible'), { status: 400 });
  const existingPayment = db.prepare('SELECT * FROM payments WHERE orderId = ? ORDER BY createdAt ASC').get(orderId) as any;
  if (existingPayment && existingPayment.status === 'SUCCESS') throw Object.assign(new Error('Déjà payé'), { status: 400 });

  const key = idempotencyKey || `${orderId}-${provider}-${Date.now()}`;
  const existingByKey = db.prepare('SELECT * FROM payments WHERE idempotencyKey = ?').get(key) as any;
  if (existingByKey) return existingByKey;

  if (provider === 'CASH') {
    // Espèces : le paiement reste PENDING jusqu'à confirmation d'encaissement par le marchand (confirmCash)
    if (existingPayment) {
      db.prepare('UPDATE payments SET provider = ?, status = ?, amount = ?, idempotencyKey = ?, updatedAt = ? WHERE id = ?')
        .run('CASH', 'PENDING', order.totalAmount, key, nowIso(), existingPayment.id);
    } else {
      db.prepare('INSERT INTO payments (id, orderId, provider, status, amount, idempotencyKey, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
        .run(cuid(), orderId, 'CASH', 'PENDING', order.totalAmount, key, nowIso(), nowIso());
    }
    return db.prepare('SELECT * FROM payments WHERE orderId = ? ORDER BY createdAt ASC').get(orderId);
  }

  const prov = providers[provider];
  if (!prov) throw Object.assign(new Error('Provider non supporté'), { status: 400 });

  const { transactionId, providerRef } = await prov.initiate(order.totalAmount, phone);

  if (existingPayment) {
    db.prepare('UPDATE payments SET provider = ?, status = ?, amount = ?, transactionId = ?, providerRef = ?, idempotencyKey = ?, updatedAt = ? WHERE id = ?')
      .run(provider, 'PENDING', order.totalAmount, transactionId, providerRef, key, nowIso(), existingPayment.id);
  } else {
    db.prepare('INSERT INTO payments (id, orderId, provider, status, amount, transactionId, providerRef, idempotencyKey, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(cuid(), orderId, provider, 'PENDING', order.totalAmount, transactionId, providerRef, key, nowIso(), nowIso());
  }
  return db.prepare('SELECT * FROM payments WHERE orderId = ? ORDER BY createdAt ASC').get(orderId);
}

/** Applique un statut final vérifié serveur (transactionnel : statut + notifications + audit). */
function applyVerifiedStatus(payment: any, newStatus: 'SUCCESS'|'FAILED'|'PENDING', raw: any, actorUserId?: string | null, source = 'VERIFY') {
  return withTransaction(() => {
    db.prepare('UPDATE payments SET status = ?, rawResponse = ?, verifiedAt = ?, updatedAt = ? WHERE id = ?')
      .run(newStatus, JSON.stringify(raw), newStatus === 'SUCCESS' ? nowIso() : null, nowIso(), payment.id);

    if (newStatus === 'SUCCESS') {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(payment.orderId) as any;
      if (order) {
        db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
          .run(cuid(), order.clientId, 'Paiement confirmé', `Paiement ${payment.amount} FCFA confirmé pour commande ${order.orderNumber}`, 'PAYMENT', JSON.stringify({ orderId: order.id, paymentId: payment.id }), nowIso());
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
    recordAudit(actorUserId, 'PAYMENT_STATUS', 'Payment', payment.id, { from: payment.status, to: newStatus, provider: payment.provider, source });
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(payment.id);
  });
}

export async function verifyPayment(paymentId: string, actorUserId?: string | null) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
  if (!payment) throw Object.assign(new Error('Paiement introuvable'), { status: 404 });
  // Idempotent : un paiement déjà final n'est jamais re-vérifié (ni re-notifié)
  if (['SUCCESS','FAILED','CANCELLED','REFUNDED'].includes(payment.status)) return payment;
  if (payment.provider === 'CASH') return payment; // espèces : confirmation par le marchand uniquement (confirmCash)
  const prov = providers[payment.provider];
  if (!prov) throw Object.assign(new Error('Provider non supporté'), { status: 400 });
  if (!payment.transactionId) throw Object.assign(new Error('Paiement non initié'), { status: 400 });
  const result = await prov.verify(payment.transactionId);
  const newStatus = result.status === 'SUCCESS' ? 'SUCCESS' : result.status === 'FAILED' ? 'FAILED' : 'PENDING';
  return applyVerifiedStatus(payment, newStatus, result.raw, actorUserId, 'VERIFY');
}

/**
 * Encaissement espèces confirmé par le MARCHAND / EMPLOYÉ (ou livreur à la remise) — action humaine réelle,
 * journalisée. Jamais accessible au CLIENT.
 */
export async function confirmCash(paymentId: string, actorUserId: string) {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
  if (!payment) throw Object.assign(new Error('Paiement introuvable'), { status: 404 });
  if (payment.status === 'SUCCESS') return payment;
  if (payment.provider !== 'CASH') throw Object.assign(new Error('Seul un paiement en espèces peut être confirmé manuellement'), { status: 400 });
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(payment.orderId) as any;
  if (!order || ['ANNULEE','REJETEE'].includes(order.status)) throw Object.assign(new Error('Commande annulée : encaissement impossible'), { status: 400 });
  return applyVerifiedStatus(payment, 'SUCCESS', { confirmedBy: actorUserId, method: 'CASH', confirmedAt: nowIso() }, actorUserId, 'CASH_CONFIRM');
}

export async function webhookVerify(provider: string, transactionId: string, signature: string, payload: any) {
  if (!(MOBILE_PROVIDERS as readonly string[]).includes(provider)) throw Object.assign(new Error('Provider non supporté'), { status: 400 });
  const secret = provider === 'WAVE' ? env.WAVE_WEBHOOK_SECRET : env.OM_WEBHOOK_SECRET;
  if (!secret || typeof signature !== 'string') throw Object.assign(new Error('Signature webhook invalide'), { status: 401 });
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(payload ?? {})).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw Object.assign(new Error('Signature webhook invalide'), { status: 401 });
  const payment = db.prepare('SELECT * FROM payments WHERE transactionId = ?').get(transactionId) as any;
  if (!payment) throw Object.assign(new Error('Paiement introuvable pour webhook'), { status: 404 });
  return verifyPayment(payment.id, null);
}

export async function listPayments(storeId?: string, take = 100) {
  if (storeId) {
    return db.prepare(`SELECT p.* FROM payments p JOIN orders o ON o.id = p.orderId WHERE o.storeId = ? ORDER BY p.createdAt DESC LIMIT ?`).all(storeId, take);
  }
  return db.prepare('SELECT * FROM payments ORDER BY createdAt DESC LIMIT ?').all(take);
}
