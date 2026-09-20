import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import { intParam } from '../../lib/validate';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.body || typeof req.body.storeId !== 'string') return res.status(400).json({ error: 'Validation échouée', details: [{ path: 'storeId', message: 'storeId requis' }] });
    assertStoreAccess(req.body.storeId, req.user);
    const c = await service.createCustomer(req.body, req.user!.userId);
    res.status(201).json(c);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const list = await service.listCustomers(req.params.storeId, typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined,
      intParam(req.query.take, 50, { min: 1, max: 50 }), intParam(req.query.skip, 0, { min: 0, max: 1000000 }));
    res.json(list);
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const c = await service.getCustomer(req.params.id);
    if (!c) return res.status(404).json({ error: 'Client introuvable' });
    assertStoreAccess((c as any).storeId, req.user);
    res.json(c);
  } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const c = await service.getCustomer(req.params.id);
    if (!c) return res.status(404).json({ error: 'Client introuvable' });
    assertStoreAccess((c as any).storeId, req.user);
    const u = await service.updateCustomer(req.params.id, req.body, req.user!.userId);
    res.json(u);
  } catch (e) { next(e); }
}
