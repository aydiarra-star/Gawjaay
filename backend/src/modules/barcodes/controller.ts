import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function scanHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const storeId = (req.query.storeId as string) || null;
    const result = service.findByBarcode(storeId, req.params.code, req.user);
    if (!result) return res.status(404).json({ error: 'Aucun produit avec ce code' });
    res.json(result);
  } catch (e) { next(e); }
}
export async function assignHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.assignBarcode(req.user!, req.body.productId, req.body.barcode)); } catch (e) { next(e); }
}
