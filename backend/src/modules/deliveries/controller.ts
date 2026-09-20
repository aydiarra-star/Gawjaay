import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const list = await service.listDeliveries(req.params.storeId, req.query.status as string); res.json(list); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const d = await service.updateDeliveryStatus(req.params.id, req.body.status, req.body.proofUrl, req.user?.userId); res.json(d); } catch (e) { next(e); }
}
export async function assignHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const d = await service.assignDelivery(req.params.id, req.body.employeeUserId); res.json(d); } catch (e) { next(e); }
}
