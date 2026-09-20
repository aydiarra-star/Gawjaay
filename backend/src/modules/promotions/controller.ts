import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.createPromotion(req.user!, req.body)); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.listPromotions(req.params.storeId, req.user)); } catch (e) { next(e); }
}
export async function publicActiveHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.publicActivePromotions(req.params.storeId)); } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.getPromotion(req.params.id, req.user)); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.updatePromotion(req.params.id, req.user!, req.body)); } catch (e) { next(e); }
}
export async function deleteHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { await service.deletePromotion(req.params.id, req.user!); res.json({ message: 'Promotion supprimée' }); } catch (e) { next(e); }
}
