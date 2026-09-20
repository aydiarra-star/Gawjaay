import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const debts = await service.listDebts(req.params.storeId); res.json(debts); } catch (e) { next(e); }
}
export async function payHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const d = await service.payDebt(req.params.id, req.body.amount, req.body.method, req.body.notes); res.json(d); } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const d = await service.getDebt(req.params.id); res.json(d); } catch (e) { next(e); }
}
