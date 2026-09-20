import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import { intParam } from '../../lib/validate';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const sale = await service.createSale(req.params.storeId, req.body, req.user!.userId);
    res.status(201).json(sale);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    assertStoreAccess(req.params.storeId, req.user);
    const sales = await service.listSales(req.params.storeId, intParam(req.query.take, 50, { min: 1, max: 50 }), intParam(req.query.skip, 0, { min: 0, max: 1000000 }));
    res.json(sales);
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sale = await service.getSale(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Vente introuvable' });
    // V3 (audit S7) : une vente n'est lisible que par la boutique qui l'a réalisée (IDOR)
    assertStoreAccess(sale.storeId, req.user);
    res.json(sale);
  } catch (e) { next(e); }
}
