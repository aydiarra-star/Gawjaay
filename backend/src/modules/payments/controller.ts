import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess, assertOwnOrder } from '../../middlewares/tenant';
import * as service from './service';
import db from '../../lib/db';

export async function initiateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { orderId, provider, phone } = req.body;
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
    const p = await service.verifyPayment(req.params.id); res.json(p);
  } catch (e) { next(e); }
}
export async function webhookHandler(req: any, res: Response, next: NextFunction) {
  try {
    const provider = req.params.provider;
    const { transactionId, signature, payload } = req.body;
    const result = await service.webhookVerify(provider, transactionId, signature, payload);
    res.json(result);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const storeId = req.query.storeId as string;
    if (storeId) assertStoreAccess(storeId, req.user);
    else if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'storeId requis' });
    const list = await service.listPayments(storeId); res.json(list);
  } catch (e) { next(e); }
}
