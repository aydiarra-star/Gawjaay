import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function usersHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.listUsers()); } catch (e) { next(e); } }
export async function storesHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.listStores()); } catch (e) { next(e); } }
export async function ordersHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.listOrders()); } catch (e) { next(e); } }
export async function paymentsHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.listPayments()); } catch (e) { next(e); } }
export async function statsHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.stats()); } catch (e) { next(e); } }
export async function toggleUserHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.toggleUser(req.params.userId)); } catch (e) { next(e); } }
export async function verifyStoreHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.verifyStore(req.params.storeId)); } catch (e) { next(e); } }
export async function auditHandler(req: AuthRequest, res: Response, next: NextFunction) { try { res.json(await service.auditLogs()); } catch (e) { next(e); } }
