import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const emp = await service.createEmployee(req.params.storeId, req.body, req.user!.userId); res.status(201).json(emp); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const list = await service.listEmployees(req.params.storeId); res.json(list); } catch (e) { next(e); }
}
export async function permHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const updated = await service.updatePermissions(req.params.id, req.body.permissions, req.user!.userId); res.json(updated); } catch (e) { next(e); }
}
export async function deactivateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { await service.deactivate(req.params.id, req.user!.userId); res.json({ message: 'Désactivé' }); } catch (e) { next(e); }
}
