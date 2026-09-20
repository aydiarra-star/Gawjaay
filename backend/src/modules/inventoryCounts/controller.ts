import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function startHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.startCount(req.user!, req.params.storeId, req.body?.notes)); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.listCounts(req.params.storeId, req.user!)); } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.getCount(req.params.id, req.user!)); } catch (e) { next(e); }
}
export async function itemHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.setCountedQty(req.user!, req.params.id, req.body.productId, Number(req.body.countedQty))); } catch (e) { next(e); }
}
export async function confirmHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.confirmCount(req.user!, req.params.id)); } catch (e) { next(e); }
}
export async function cancelHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { await service.cancelCount(req.user!, req.params.id); res.json({ message: 'Inventaire annulé' }); } catch (e) { next(e); }
}
