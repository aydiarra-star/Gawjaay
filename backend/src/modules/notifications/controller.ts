import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';
import db from '../../lib/db';

export async function unreadHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.unreadCount(req.user!.userId)); } catch (e) { next(e); }
}

export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const list = await service.listNotifications(req.user!.userId, req.query.unread === 'true', req.query.type as string | undefined);
    res.json(list);
  } catch (e) { next(e); }
}
export async function readHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const n = await service.markRead(req.params.id, req.user!.userId); res.json(n); } catch (e) { next(e); }
}
export async function readAllHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { await service.markAllRead(req.user!.userId); res.json({ message: 'Tout marqué lu' }); } catch (e) { next(e); }
}
