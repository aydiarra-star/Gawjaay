import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess, assertOwnOrder } from '../../middlewares/tenant';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const sale = await service.createSale(req.params.storeId, req.body, req.user!.userId);
    res.status(201).json(sale);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const sales = await service.listSales(req.params.storeId, parseInt(req.query.take as string)||50, parseInt(req.query.skip as string)||0);
    res.json(sales);
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const sale = await service.getSale(req.params.id); res.json(sale); } catch (e) { next(e); }
}
