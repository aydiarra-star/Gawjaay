import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import * as service from './service';

// V3 (audit S8) : chaque opération est rattachée à une boutique du commerçant connecté.
export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const emp = await service.createEmployee(req.params.storeId, req.body, req.user!.userId); res.status(201).json(emp); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const list = await service.listEmployees(req.params.storeId); res.json(list); } catch (e) { next(e); }
}
export async function permHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const emp = service.getEmployee(req.params.id);
    assertStoreAccess(emp.storeId, req.user);
    const updated = await service.updatePermissions(req.params.id, req.body?.permissions, req.user!.userId);
    res.json(updated);
  } catch (e) { next(e); }
}
export async function deactivateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const emp = service.getEmployee(req.params.id);
    assertStoreAccess(emp.storeId, req.user);
    await service.deactivate(req.params.id, req.user!.userId);
    res.json({ message: 'Désactivé' });
  } catch (e) { next(e); }
}
export async function reactivateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const emp = service.getEmployee(req.params.id);
    assertStoreAccess(emp.storeId, req.user);
    const updated = await service.reactivate(req.params.id, req.user!.userId);
    res.json(updated);
  } catch (e) { next(e); }
}
export async function catalogHandler(_req: AuthRequest, res: Response) {
  res.json({ permissions: service.PERMISSION_CATALOG });
}
