import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import { parseOrThrow } from '../../lib/validate';
import { debtCreateSchema, debtPaySchema } from '../../utils/validators';
import * as service from './service';

// V3 (audit S8) : toutes les routes dettes sont isolées par boutique (via le client rattaché).
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const debts = await service.listDebts(req.params.storeId, {
      includeSettled: req.query.includeSettled === 'true',
      customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
    });
    res.json(debts);
  } catch (e) { next(e); }
}
export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const data = parseOrThrow(debtCreateSchema, req.body);
    const d = await service.createDebt(req.params.storeId, data, req.user!.userId);
    res.status(201).json(d);
  } catch (e) { next(e); }
}
export async function payHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const storeId = service.debtStoreId(req.params.id);
    if (!storeId) return res.status(404).json({ error: 'Dette introuvable' });
    assertStoreAccess(storeId, req.user);
    const data = parseOrThrow(debtPaySchema, req.body);
    const d = await service.payDebt(req.params.id, data.amount, data.method || 'CASH', data.notes, req.user!.userId);
    res.json(d);
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const d = await service.getDebt(req.params.id);
    if (!d) return res.status(404).json({ error: 'Dette introuvable' });
    assertStoreAccess(d.storeId, req.user);
    res.json(d);
  } catch (e) { next(e); }
}
