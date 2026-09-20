import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function upsertProfileHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.upsertProfile(req.user!, req.body)); } catch (e) { next(e); }
}
export async function myProfileHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.myProfile(req.user!)); } catch (e) { next(e); }
}
export async function createCatalogHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(service.createCatalog(req.user!, req.body)); } catch (e) { next(e); }
}
export async function addItemHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.addCatalogItem(req.user!, req.params.id, req.body)); } catch (e) { next(e); }
}
export async function myCatalogsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.myCatalogs(req.user!)); } catch (e) { next(e); }
}
export async function publicCatalogsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.publicCatalogs()); } catch (e) { next(e); }
}
export async function getCatalogHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.getCatalog(req.params.id, req.user)); } catch (e) { next(e); }
}
export async function createOrderHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.status(201).json(await service.createOrder(req.user!, req.body)); } catch (e) { next(e); }
}
export async function listOrdersHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.listOrders(req.user!, (req.query.role as string) === 'wholesaler' ? 'wholesaler' : 'buyer')); } catch (e) { next(e); }
}
export async function getOrderHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.getOrder(req.params.id, req.user!)); } catch (e) { next(e); }
}
export async function statusHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(await service.updateStatus(req.user!, req.params.id, req.body.status)); } catch (e) { next(e); }
}
export async function suggestionsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(service.suggestions(req.user!, req.params.storeId)); } catch (e) { next(e); }
}
