import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';
import db from '../../lib/db';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { storeId } = req.params;
    if (!req.user?.storeIds?.includes(storeId) && req.user?.role !== 'ADMIN' && req.user?.merchantId) {
      const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
      if (!store || store.merchantId !== req.user.merchantId) return res.status(403).json({ error: 'Accès refusé boutique' });
    }
    const product = await service.createProduct(storeId, req.body, req.user!.userId);
    res.status(201).json(product);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { storeId } = req.params;
    const products = await service.listProducts(storeId, {
      search: req.query.search as string,
      categoryId: req.query.categoryId as string,
      take: req.query.take ? parseInt(req.query.take as string) : 50,
      skip: req.query.skip ? parseInt(req.query.skip as string) : 0,
      onlineOnly: req.query.onlineOnly === 'true',
    });
    res.json(products);
  } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const product = await service.updateProduct(req.params.productId, req.body, req.user!.userId);
    res.json(product);
  } catch (e) { next(e); }
}
export async function deleteHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await service.deleteProduct(req.params.productId, req.user!.userId);
    res.json({ message: 'Produit supprimé' });
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const product = await service.getProduct(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Produit non trouvé' });
    res.json(product);
  } catch (e) { next(e); }
}
