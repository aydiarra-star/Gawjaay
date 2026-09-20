import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function addHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(service.add(req.user!, req.body.targetType, req.body.targetId)); } catch (e) { next(e); }
}
export async function removeHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.remove(req.user!, req.params.targetType as any, req.params.targetId)); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.list(req.user!, req.query.type as any)); } catch (e) { next(e); }
}
