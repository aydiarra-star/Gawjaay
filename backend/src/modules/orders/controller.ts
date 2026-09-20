import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertOwnOrder } from '../../middlewares/tenant';
import { intParam, parseOrThrow } from '../../lib/validate';
import { orderStatusSchema } from '../../utils/validators';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const order = await service.createOrder(req.user!.userId, req.body); res.status(201).json(order); } catch (e) { next(e); }
}
export async function updateStatusHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // V3 : statut validé (alias anglais du cahier acceptés), motif optionnel journalisé
    const { status, reason } = parseOrThrow(orderStatusSchema, req.body);
    const order = await service.updateStatus(req.params.id, status, req.user!, reason);
    res.json(order);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const filters: any = {
      storeId: typeof req.query.storeId === 'string' ? req.query.storeId : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      take: intParam(req.query.take, 50, { min: 1, max: 50 }),
      skip: intParam(req.query.skip, 0, { min: 0, max: 1000000 }),
    };
    // Isolation tenant : appliquée DANS la requête SQL (jamais après coup)
    if (user.role === 'CLIENT') {
      filters.clientId = user.userId;
      filters.storeId = undefined;
      filters.publicStore = true;
    } else if (user.role === 'MERCHANT' || user.role === 'EMPLOYEE') {
      const own = user.storeIds || [];
      if (filters.storeId) {
        if (!own.includes(filters.storeId)) return res.status(403).json({ error: 'Accès refusé' });
      } else {
        filters.storeIds = own;
      }
    } else if (user.role === 'ADMIN') {
      if (typeof req.query.clientId === 'string') filters.clientId = req.query.clientId;
    } else {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const orders = await service.listOrders(filters);
    res.json(orders);
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const order = await service.getOrder(req.params.id, req.user);
    if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
    assertOwnOrder(order as any, req.user);
    res.json(order);
  } catch (e) { next(e); }
}
