import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as service from './service';

export async function storeHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json(await service.storeAnalytics(req.user!, req.params.storeId, {
      from: req.query.from as string,
      to: req.query.to as string,
    }));
  } catch (e) { next(e); }
}
