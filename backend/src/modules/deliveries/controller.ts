import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import db from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';
import { listHandler as v1List, updateHandler as v1Update, assignHandler as v1Assign } from './controller-v1';
import * as service from './service';
import * as v2 from './service-v2';

// LOT E : le contrôleur V1 est conservé (list, status legacy, assign employé legacy).
export const listHandler = v1List;
export const updateHandler = v1Update;
export const assignHandler = v1Assign;

/** LOT E — assignation avancée : si body.driverId → flux livreur V2 (OTP, machine à états). */
export async function assignHandlerV2(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const d0 = db.prepare('SELECT storeId FROM deliveries WHERE id = ?').get(req.params.id) as any;
    if (!d0) return res.status(404).json({ error: 'Livraison introuvable' });
    assertStoreAccess(d0.storeId, req.user);
    if (req.body.driverId) return res.json(await v2.assignDriver(req.params.id, req.body.driverId, req.user!));
    return v1Assign(req, res, next);
  } catch (e) { next(e); }
}

export async function readyHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(v2.markReady(req.params.id, req.user!)); } catch (e) { next(e); }
}
export async function cancelHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(v2.cancelDelivery(req.params.id, req.user!)); } catch (e) { next(e); }
}
export async function driverDeliveriesHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(v2.driverDeliveries(req.user!)); } catch (e) { next(e); }
}
export async function pickupHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(v2.driverPickup(req.params.id, req.user!)); } catch (e) { next(e); }
}
export async function completeHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await v2.driverComplete(req.params.id, req.user!, req.body || {})); } catch (e) { next(e); }
}
export async function failHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(v2.driverFail(req.params.id, req.user!, req.body?.reason || '')); } catch (e) { next(e); }
}
export async function proofsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const d0 = db.prepare('SELECT storeId FROM deliveries WHERE id = ?').get(req.params.id) as any;
    if (!d0) return res.status(404).json({ error: 'Livraison introuvable' });
    assertStoreAccess(d0.storeId, req.user);
    res.json(db.prepare('SELECT id, type, data, latitude, longitude, createdAt FROM delivery_proofs WHERE deliveryId = ? ORDER BY createdAt').all(req.params.id));
  } catch (e) { next(e); }
}
