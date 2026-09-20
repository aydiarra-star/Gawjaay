import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const list = await service.listNotifications(req.user!.userId, req.query.unread==='true'); res.json(list); } catch (e) { next(e); }
}
export async function readHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const n = await service.markRead(req.params.id, req.user!.userId); res.json(n); } catch (e) { next(e); }
}
export async function readAllHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { await service.markAllRead(req.user!.userId); res.json({ message: 'Tout marqué lu' }); } catch (e) { next(e); }
}
