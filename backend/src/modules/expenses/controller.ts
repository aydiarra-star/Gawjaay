import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const e = await service.createExpense(req.params.storeId, req.body); res.status(201).json(e); } catch (err) { next(err); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const list = await service.listExpenses(req.params.storeId, req.query.from as string, req.query.to as string); res.json(list); } catch (err) { next(err); }
}
export async function summaryHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const s = await service.summary(req.params.storeId); res.json(s); } catch (err) { next(err); }
}
