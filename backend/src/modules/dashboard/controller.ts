import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import * as service from './service';

export async function dashboardHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const data = await service.getDashboard(req.params.storeId); res.json(data); } catch (e) { next(e); }
}
export async function overviewHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const data = await service.merchantOverview(req.user!.merchantId!); res.json(data); } catch (e) { next(e); }
}
