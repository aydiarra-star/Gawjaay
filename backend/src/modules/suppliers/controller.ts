import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { assertStoreAccess } from '../../middlewares/tenant';
import { intParam, parseOrThrow } from '../../lib/validate';
import { purchaseReceiveSchema } from '../../utils/validators';
import * as service from './service';

function merchantContext(req: AuthRequest) {
  if (req.user!.role === 'ADMIN') return { merchantId: req.user!.merchantId || null, isAdmin: true };
  if (!req.user!.merchantId) throw Object.assign(new Error('Profil commerçant requis'), { status: 403 });
  return { merchantId: req.user!.merchantId, isAdmin: false };
}

export async function createHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const { merchantId } = merchantContext(req); if (!merchantId) return res.status(400).json({ error: 'merchantId requis' }); const s = await service.createSupplier(merchantId, req.body, req.user!.userId); res.status(201).json(s); } catch (e) { next(e); }
}
export async function listHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const { merchantId } = merchantContext(req); const list = merchantId ? await service.listSuppliers(merchantId) : []; res.json(list); } catch (e) { next(e); }
}
export async function getHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const { merchantId, isAdmin } = merchantContext(req); const s = await service.getSupplier(req.params.supplierId, merchantId, isAdmin); res.json(s); } catch (e) { next(e); }
}
export async function updateHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { const { merchantId, isAdmin } = merchantContext(req); const s = await service.updateSupplier(req.params.supplierId, merchantId, req.body, req.user!.userId, isAdmin); res.json(s); } catch (e) { next(e); }
}
export async function purchasesHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { assertStoreAccess(req.params.storeId, req.user); const list = await service.listPurchases(req.params.storeId, intParam(req.query.take, 50, { min: 1, max: 50 })); res.json(list); } catch (e) { next(e); }
}
export async function receiveHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // V3 (audit S8) : fournisseur du commerçant + boutique du commerçant + produits de la boutique
    const { merchantId, isAdmin } = merchantContext(req);
    service.getSupplierForMerchant(req.params.supplierId, merchantId, isAdmin);
    const data = parseOrThrow(purchaseReceiveSchema, req.body);
    assertStoreAccess(data.storeId, req.user);
    const p = await service.receivePurchase(req.params.supplierId, data.storeId, data.items, req.user!.userId, data.notes);
    res.json(p);
  } catch (e) { next(e); }
}
