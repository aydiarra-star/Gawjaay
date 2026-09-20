import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
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
    // SÉCURITÉ (audit pilote) : costPrice (prix d'achat) = donnée commerciale confidentielle.
    // La liste est publique (vitrine boutique) — on la masque comme pour le détail
    // sauf pour le propriétaire / ADMIN (l'anonyme ne doit JAMAIS voir les marges).
    const isOwner = req.user?.role === 'ADMIN' || !!req.user?.storeIds?.includes(storeId);
    const safe = isOwner ? products : products.map(({ costPrice, ...rest }: any) => rest);
    res.json(safe);
  } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const existing = db.prepare('SELECT storeId FROM products WHERE id = ?').get(req.params.productId) as any;
    if (!existing) return res.status(404).json({ error: 'Produit non trouvé' });
    assertStoreAccess(existing.storeId, req.user);
    const product = await service.updateProduct(req.params.productId, req.body, req.user!.userId);
    res.json(product);
  } catch (e) { next(e); }
}
export async function deleteHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const existing = db.prepare('SELECT storeId FROM products WHERE id = ?').get(req.params.productId) as any;
    if (!existing) return res.status(404).json({ error: 'Produit non trouvé' });
    assertStoreAccess(existing.storeId, req.user);
    await service.deleteProduct(req.params.productId, req.user!.userId);
    res.json({ message: 'Produit supprimé' });
  } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const product = await service.getProduct(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Produit non trouvé' });
    // masque le prix d'achat (marge) aux non-propriétaires
    const isOwner = req.user && (req.user.role === 'ADMIN' || req.user.storeIds?.includes(product.storeId));
    if (!isOwner) { const { costPrice, ...rest } = product as any; return res.json(rest); }
    res.json(product);
  } catch (e) { next(e); }
}
