import { Request, Response, NextFunction } from 'express';
import { verifyAccess } from '../utils/jwt';
import db from '../lib/db';
import { AuthRequest } from './auth';

/**
 * Authentification OPTIONNELLE.
 *
 * Les routes de vitrine (catalogue public, boutique par slug, fiche produit) doivent rester
 * accessibles sans compte, tout en permettant au propriétaire (marchand/employé/admin) de recevoir
 * les champs internes (ex. `costPrice`) que l'anonyme ne doit jamais voir.
 *
 * Ce middleware n'échoue JAMAIS : token absent/invalide → on continue en anonyme.
 */
export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.split(' ')[1];
      const payload = verifyAccess(token);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as any;
      if (user && user.isActive) {
        let merchantId = (payload as any).merchantId;
        if (!merchantId) {
          const merchant = db.prepare('SELECT id FROM merchants WHERE userId = ?').get(user.id) as any;
          merchantId = merchant?.id;
        }
        // Source de vérité : storeIds relus en base (cf. middlewares/auth.ts)
        let storeIds: string[] = [];
        if (merchantId) {
          const stores = db.prepare('SELECT id FROM stores WHERE merchantId = ?').all(merchantId) as any[];
          storeIds = stores.map((s: any) => s.id);
        } else if (user.role === 'EMPLOYEE') {
          const emp = db.prepare('SELECT storeId FROM employees WHERE userId = ?').get(user.id) as any;
          if (emp) storeIds = [emp.storeId];
        }
        req.user = { userId: user.id, role: user.role, merchantId, storeIds, phone: user.phone };
      }
    }
  } catch {
    // token invalide → anonyme (jamais d'erreur sur une route publique)
  }
  next();
}

/** Le visiteur (ou l'absence de visiteur) peut-il voir les champs internes de cette boutique ? */
export function canViewInternalFields(user: any, storeId: string): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  return Array.isArray(user.storeIds) && user.storeIds.includes(storeId);
}
