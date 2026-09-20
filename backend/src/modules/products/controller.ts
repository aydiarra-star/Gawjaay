import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import { canViewInternalFields } from '../../middlewares/optionalAuth';
import { intParam } from '../../lib/validate';
import * as service from './service';
import db from '../../lib/db';

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { storeId } = req.params;
    // V3 (audit S6) : contrôle tenant UNIFORME — MERCHANT, EMPLOYEE et ADMIN passent par la même règle
    // (l'ancienne condition « && merchantId » laissait passer un employé vers une autre boutique).
    assertStoreAccess(storeId, req.user);
    const product = await service.createProduct(storeId, req.body, req.user!.userId);
    res.status(201).json(product);
  } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { storeId } = req.params;
    // SÉCURITÉ (audit pilote) : costPrice (prix d'achat) = donnée commerciale confidentielle.
    // La liste est publique (vitrine boutique) — on la masque comme pour le détail
    // sauf pour le propriétaire / ADMIN (l'anonyme ne doit JAMAIS voir les marges).
    const isOwner = canViewInternalFields(req.user, storeId);
    const products = await service.listProducts(storeId, {
      search: typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : undefined,
      categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
      take: intParam(req.query.take, 50, { min: 1, max: 50 }),
      skip: intParam(req.query.skip, 0, { min: 0, max: 100000 }),
      // V3 (audit S13) : un visiteur non propriétaire ne voit que les produits publiés en ligne
      onlineOnly: req.query.onlineOnly === 'true' || !isOwner,
      includeInactive: isOwner && req.query.includeInactive === 'true',
    });
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
    const isOwner = canViewInternalFields(req.user, product.storeId);
    if (!isOwner) {
      // V3 (audit S13) : un produit retiré ou hors ligne n'existe pas pour le public
      if (!product.isActive || !product.isOnline) return res.status(404).json({ error: 'Produit non trouvé' });
      return res.json(service.toPublicProduct(product));
    }
    res.json(product);
  } catch (e) { next(e); }
}
