import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import { intParam, parseOrThrow } from '../../lib/validate';
import { stockAdjustSchema } from '../../utils/validators';
import * as service from './service';

export async function stockHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const data = await service.getStock(req.params.storeId); res.json(data); } catch (e) { next(e); }
}
export async function adjustHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    // V3 : validation Zod (quantité numérique non nulle, type de mouvement manuel autorisé)
    const data = parseOrThrow(stockAdjustSchema, req.body);
    const result = await service.adjustStock(req.params.storeId, data.productId, data.quantity, data.type || 'ADJUSTMENT', data.reason ?? null, req.user!.userId);
    res.json(result);
  } catch (e) { next(e); }
}
export async function historyHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const take = intParam(req.query.take, 50, { min: 1, max: 50 });
    const h = await service.history(req.params.storeId, typeof req.query.productId === 'string' ? req.query.productId : undefined, take);
    res.json(h);
  } catch (e) { next(e); }
}
export async function lowStockHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const low = await service.lowStock(req.params.storeId); res.json(low); } catch (e) { next(e); }
}
