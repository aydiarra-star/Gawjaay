import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function configureHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.configure(req.user!, req.params.storeId, req.body)); } catch (e) { next(e); }
}
export async function storeAccountsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.storeAccounts(req.user!, req.params.storeId)); } catch (e) { next(e); }
}
export async function myAccountHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.accountFor(req.params.storeId, req.user!.userId)); } catch (e) { next(e); }
}
