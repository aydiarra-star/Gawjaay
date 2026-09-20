import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function askHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.ask(req.user!, req.params.storeId || req.body.storeId, req.body.question)); } catch (e) { next(e); }
}
export async function historyHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.history(req.user!, req.params.storeId)); } catch (e) { next(e); }
}
export async function requestActionHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(service.requestAction(req.user!, req.body.storeId, req.body.actionType, req.body.params)); } catch (e) { next(e); }
}
export async function confirmActionHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.confirmAction(req.user!, req.params.id, req.body.confirmed !== false)); } catch (e) { next(e); }
}
export async function listActionsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listActions(req.user!, req.params.storeId)); } catch (e) { next(e); }
}
