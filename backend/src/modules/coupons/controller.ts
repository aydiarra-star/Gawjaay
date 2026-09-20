import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.createCoupon(req.user!, req.body)); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.listCoupons(req.params.storeId, req.user)); } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.getCoupon(req.params.id, req.user)); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.updateCoupon(req.params.id, req.user!, req.body)); } catch (e) { next(e); }
}
export async function validateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { storeId, code, subtotal, productId } = req.body;
    const result = service.validateCoupon(storeId, code, {
      subtotal: Number(subtotal) || 0,
      clientId: req.user?.role === 'CLIENT' ? req.user.userId : undefined,
      productId,
    });
    res.json(result);
  } catch (e) { next(e); }
}
export async function redemptionsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.redemptionsForCoupon(req.params.id, req.user)); } catch (e) { next(e); }
}
