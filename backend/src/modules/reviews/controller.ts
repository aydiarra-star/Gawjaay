import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.createReview(req.user!, req.body)); } catch (e) { next(e); }
}
export async function storeHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listForStore(req.params.storeId)); } catch (e) { next(e); }
}
export async function productHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listForProduct(req.params.productId)); } catch (e) { next(e); }
}
export async function mineHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.myReviews(req.user!)); } catch (e) { next(e); }
}
export async function reportHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(service.reportReview(req.user!, req.params.id, req.body.reason, req.body.details)); } catch (e) { next(e); }
}
