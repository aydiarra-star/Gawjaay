import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import { intParam } from '../../lib/validate';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const e = await service.createExpense(req.params.storeId, req.body, req.user!.userId); res.status(201).json(e); } catch (err) { next(err); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const list = await service.listExpenses(req.params.storeId, req.query.from as string | undefined, req.query.to as string | undefined,
      intParam(req.query.take, 50, { min: 1, max: 50 }), intParam(req.query.skip, 0, { min: 0, max: 1000000 }));
    res.json(list);
  } catch (err) { next(err); }
}
export async function deleteHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const r = await service.deleteExpense(req.params.storeId, req.params.id, req.user!.userId); res.json(r); } catch (err) { next(err); }
}
export async function summaryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const s = await service.summary(req.params.storeId); res.json(s); } catch (err) { next(err); }
}
