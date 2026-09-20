import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function stockHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const data = await service.getStock(req.params.storeId); res.json(data); } catch (e) { next(e); }
}
export async function adjustHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { productId, quantity, type, reason } = req.body;
    const result = await service.adjustStock(req.params.storeId, productId, quantity, type, reason, req.user!.userId);
    res.json(result);
  } catch (e) { next(e); }
}
export async function historyHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const h = await service.history(req.params.storeId, req.query.productId as string); res.json(h); } catch (e) { next(e); }
}
export async function lowStockHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const low = await service.lowStock(req.params.storeId); res.json(low); } catch (e) { next(e); }
}
