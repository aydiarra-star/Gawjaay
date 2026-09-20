import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { parseOrThrow } from '../../lib/validate';
import { categorySchema } from '../../utils/validators';
import * as service from './service';

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const withCounts = req.query.withCounts === undefined ? true : req.query.withCounts !== 'false';
    res.json(await service.listCategories({ withCounts }));
  } catch (e) { next(e); }
}
export async function getHandler(req: Request, res: Response, next: NextFunction) {
  try { res.json(await service.getCategory(req.params.idOrSlug)); } catch (e) { next(e); }
}
export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = parseOrThrow(categorySchema, req.body);
    res.status(201).json(await service.createCategory(req.user!.userId, data));
  } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data = parseOrThrow(categorySchema.partial(), req.body);
    res.json(await service.updateCategory(req.user!.userId, req.params.id, data));
  } catch (e) { next(e); }
}
export async function deleteHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.deleteCategory(req.user!.userId, req.params.id)); } catch (e) { next(e); }
}
