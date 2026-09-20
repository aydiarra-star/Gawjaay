import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertOwnOrder } from '../../middlewares/tenant';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const order = await service.createOrder(req.user!.userId, req.body); res.status(201).json(order); } catch (e) { next(e); }
}
export async function updateStatusHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const order = await service.updateStatus(req.params.id, req.body.status, req.user!); res.json(order); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const filters: any = {
      storeId: req.query.storeId as string,
      clientId: req.query.clientId as string,
      status: req.query.status as string,
      take: req.query.take ? parseInt(req.query.take as string) : 50,
      skip: req.query.skip ? parseInt(req.query.skip as string) : 0,
    };
    // enforce tenant
    if (req.user?.role === 'MERCHANT') {
      // if storeId not in own stores, block
      if (filters.storeId && !req.user.storeIds?.includes(filters.storeId)) return res.status(403).json({ error: 'Accès refusé' });
      if (!filters.storeId) filters.storeId = undefined; // will list all own? service needs to handle - we filter after
    }
    if (req.user?.role === 'CLIENT') filters.clientId = req.user.userId;
    const orders = await service.listOrders(filters);
    // filter for merchant own stores if no storeId provided
    let result = orders;
    if (req.user?.role === 'MERCHANT' && !filters.storeId) {
      result = orders.filter(o=>req.user!.storeIds?.includes(o.storeId));
    }
    if (req.user?.role === 'EMPLOYEE') {
      result = orders.filter(o=>req.user!.storeIds?.includes(o.storeId));
    }
    res.json(result);
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const order = await service.getOrder(req.params.id); if (!order) return res.status(404).json({ error: 'Commande non trouvée' }); assertOwnOrder(order as any, req.user); res.json(order); } catch (e) { next(e); }
}
