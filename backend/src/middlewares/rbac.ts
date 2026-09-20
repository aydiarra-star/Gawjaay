import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import db from '../lib/db';

export function authorize(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

export function requirePermission(resource: string, action: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Non authentifié' });
    if (req.user.role === 'MERCHANT' || req.user.role === 'ADMIN') return next();
    if (req.user.role === 'EMPLOYEE') {
      const emp = db.prepare('SELECT * FROM employees WHERE userId = ?').get(req.user.userId) as any;
      if (!emp || !emp.isActive) return res.status(403).json({ error: 'Employé inactif' });
      const perms: string[] = JSON.parse(emp.permissions || '[]');
      const needed = `${resource}:${action}`;
      const wildcard = `${resource}:*`;
      if (perms.includes(needed) || perms.includes(wildcard) || perms.includes('*:*')) {
        return next();
      }
      return res.status(403).json({ error: `Permission manquante ${needed}` });
    }
    return res.status(403).json({ error: 'Permission refusée' });
  };
}
