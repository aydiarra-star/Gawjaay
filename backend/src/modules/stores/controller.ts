import { Request, Response, NextFunction } from 'express';
import * as service from './service';
import { AuthRequest } from '../../middlewares/auth';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const store = await service.createStore(req.user, req.body); res.status(201).json(store); } catch (e) { next(e); }
}
export async function myStoresHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const stores = await service.listMyStores(req.user); res.json(stores); } catch (e) { next(e); }
}
export async function getBySlugHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const store = await service.getStoreBySlug(req.params.slug, req.user); if (!store) return res.status(404).json({ error: 'Boutique non trouvée' }); res.json(store); } catch (e) { next(e); }
}
export async function getByIdHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const store = await service.getStoreById(req.params.id, req.user); res.json(store); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const store = await service.updateStore(req.user, req.params.id, req.body); res.json(store); } catch (e) { next(e); }
}
export async function publicListHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const stores = await service.publicList({ search: req.query.search as string, category: req.query.category as string, take: req.query.take ? parseInt(req.query.take as string) : 50 }); res.json(stores); } catch (e) { next(e); }
}
