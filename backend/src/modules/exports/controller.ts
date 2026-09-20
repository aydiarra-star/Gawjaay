import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { exportCsv } from './service';

export async function csvHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const type = String(req.params.type || '').replace(/\.csv$/, '');
    const csv = exportCsv(req.user!, req.params.storeId, type);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gawjaay-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}
