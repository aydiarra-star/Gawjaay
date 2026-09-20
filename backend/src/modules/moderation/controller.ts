import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function listReviewsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listReviews((req.query.filter as string) || 'all')); } catch (e) { next(e); }
}
export async function hideHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.hideReview(req.user!.userId, req.params.id, req.body?.reason)); } catch (e) { next(e); }
}
export async function restoreHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.restoreReview(req.user!.userId, req.params.id, req.body?.reason)); } catch (e) { next(e); }
}
export async function deleteHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { await service.deleteReview(req.user!.userId, req.params.id, req.body?.reason); res.json({ message: 'Avis supprimé' }); } catch (e) { next(e); }
}
export async function reportsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listReports(req.query.status as string)); } catch (e) { next(e); }
}
export async function resolveReportHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.resolveReport(req.user!.userId, req.params.id, req.body.action, req.body.reason)); } catch (e) { next(e); }
}
export async function actionsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listActions()); } catch (e) { next(e); }
}
