import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.body.storeId, req.user); const c = await service.createCustomer(req.body); res.status(201).json(c); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const list = await service.listCustomers(req.params.storeId, req.query.search as string); res.json(list); } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const c = await service.getCustomer(req.params.id); if (c) assertStoreAccess((c as any).storeId, req.user); res.json(c); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const c = await service.getCustomer(req.params.id); if (c) assertStoreAccess((c as any).storeId, req.user); const u = await service.updateCustomer(req.params.id, req.body); res.json(u); } catch (e) { next(e); }
}
