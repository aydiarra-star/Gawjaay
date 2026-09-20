import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import db from '../../lib/db';
import * as service from './service';

export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const list = await service.listDeliveries(req.params.storeId, req.query.status as string); res.json(list); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const d0 = db.prepare('SELECT storeId FROM deliveries WHERE id = ?').get(req.params.id) as any; if (!d0) return res.status(404).json({ error: 'Livraison introuvable' }); assertStoreAccess(d0.storeId, req.user); const d = await service.updateDeliveryStatus(req.params.id, req.body.status, req.body.proofUrl, req.user?.userId); res.json(d); } catch (e) { next(e); }
}
export async function assignHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const d0 = db.prepare('SELECT storeId FROM deliveries WHERE id = ?').get(req.params.id) as any; if (!d0) return res.status(404).json({ error: 'Livraison introuvable' }); assertStoreAccess(d0.storeId, req.user); const d = await service.assignDelivery(req.params.id, req.body.employeeUserId); res.json(d); } catch (e) { next(e); }
}
