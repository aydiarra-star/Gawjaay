import { Request, Response, NextFunction } from 'express';
import * as service from './service';

export async function listHandler(req: Request, res: Response, next: NextFunction) {
  try { const regions = await service.listRegions(); res.json(regions); } catch (e) { next(e); }
}
export async function seedHandler(req: Request, res: Response, next: NextFunction) {
  try { await service.seedRegions(); res.json({ message: 'Régions seedées' }); } catch (e) { next(e); }
}
