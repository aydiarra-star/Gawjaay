import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess, assertOwnOrder } from '../../middlewares/tenant';
import { intParam, parseOrThrow } from '../../lib/validate';
import { phoneSchema } from '../../utils/validators';
import * as service from './service';
import db from '../../lib/db';

const initiateSchema = z.object({
  orderId: z.string().min(1).max(64),
  provider: z.enum(service.PAYMENT_METHODS),
  phone: phoneSchema.optional(),
});

export async function capabilitiesHandler(_req: AuthRequest, res: Response) {
  res.json(service.paymentCapabilities());
}
export async function initiateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { orderId, provider, phone } = parseOrThrow(initiateSchema, req.body);
    const idempotencyKey = (req.headers['idempotency-key'] as string) || undefined;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    // CLIENT : uniquement ses propres commandes. MERCHANT/EMPLOYEE : leurs boutiques.
    if (req.user?.role === 'CLIENT') {
      assertOwnOrder(order, req.user);
    } else {
      assertStoreAccess(order.storeId, req.user);
    }
    const payment = await service.initiatePayment(orderId, provider, phone, idempotencyKey);
    res.status(201).json(payment);
  } catch (e) { next(e); }
}
export async function verifyHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const p0 = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as any;
    if (!p0) return res.status(404).json({ error: 'Paiement introuvable' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(p0.orderId) as any;
    assertOwnOrder(order, req.user);
    const p = await service.verifyPayment(req.params.id, req.user!.userId); res.json(p);
  } catch (e) { next(e); }
}
/** Encaissement espèces : MERCHANT / EMPLOYEE (boutique de la commande) ou ADMIN — jamais le client. */
export async function confirmCashHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const p0 = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id) as any;
    if (!p0) return res.status(404).json({ error: 'Paiement introuvable' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(p0.orderId) as any;
    if (!order) return res.status(404).json({ error: 'Commande introuvable' });
    assertStoreAccess(order.storeId, req.user);
    const p = await service.confirmCash(req.params.id, req.user!.userId);
    res.json(p);
  } catch (e) { next(e); }
}
export async function webhookHandler(req: any, res: Response, next: NextFunction) {
  try {
    const provider = req.params.provider;
    const { transactionId, signature, payload } = req.body || {};
    if (typeof transactionId !== 'string') return res.status(400).json({ error: 'transactionId requis' });
    const result = await service.webhookVerify(provider, transactionId, signature, payload);
    res.json(result);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
    if (storeId) assertStoreAccess(storeId, req.user);
    else if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'storeId requis' });
    const list = await service.listPayments(storeId, intParam(req.query.take, 50, { min: 1, max: 50 })); res.json(list);
  } catch (e) { next(e); }
}
