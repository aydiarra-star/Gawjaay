import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function initiateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { orderId, provider, phone } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const payment = await service.initiatePayment(orderId, provider, phone, idempotencyKey);
    res.status(201).json(payment);
  } catch (e) { next(e); }
}
export async function verifyHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const p = await service.verifyPayment(req.params.id); res.json(p); } catch (e) { next(e); }
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
  try { const list = await service.listPayments(req.query.storeId as string); res.json(list); } catch (e) { next(e); }
}
