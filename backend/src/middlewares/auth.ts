import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../utils/jwt';
import db from '../lib/db';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    merchantId?: string;
    storeIds?: string[];
    phone?: string;
  };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    const token = header.split(' ')[1];
    const payload = verifyAccess(token);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user || !user.isActive) return res.status(401).json({ error: 'Utilisateur inactif' });

    let merchantId = (payload as any).merchantId;
    let storeIds: string[] = (payload as any).storeIds || [];

    if (!merchantId) {
      const merchant = db.prepare('SELECT id FROM merchants WHERE userId = ?').get(user.id) as any;
      merchantId = merchant?.id;
    }
    if (!storeIds.length) {
      if (merchantId) {
        const stores = db.prepare('SELECT id FROM stores WHERE merchantId = ?').all(merchantId) as any[];
        storeIds = stores.map(s=>s.id);
      }
      if (user.role === 'EMPLOYEE') {
        const emp = db.prepare('SELECT storeId FROM employees WHERE userId = ?').get(user.id) as any;
        if (emp) storeIds = [emp.storeId];
      }
    }

    req.user = {
      userId: user.id,
      role: user.role,
      merchantId,
      storeIds,
      phone: user.phone,
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}
