import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(service.createDriver(req.user!, req.body)); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listDrivers(req.user!)); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.updateDriver(req.user!, req.params.id, req.body)); } catch (e) { next(e); }
}
