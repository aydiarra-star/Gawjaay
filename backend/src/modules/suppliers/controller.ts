import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const s = await service.createSupplier(req.user!.merchantId!, req.body); res.status(201).json(s); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const list = await service.listSuppliers(req.user!.merchantId!); res.json(list); } catch (e) { next(e); }
}
export async function receiveHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const p = await service.receivePurchase(req.params.supplierId, req.body.storeId, req.body.items, req.user!.userId); res.json(p); } catch (e) { next(e); }
}
