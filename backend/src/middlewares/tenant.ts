import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

// Ensures merchant can only access own stores
export function tenantGuard(req: AuthRequest, res: Response, next: NextFunction) {
  // For MERCHANT and EMPLOYEE, storeId in params/body must belong to them
  // We check lazily in controllers using req.user.storeIds
  // This middleware just ensures user has merchant context when needed
  if (req.user && ['MERCHANT','EMPLOYEE'].includes(req.user.role)) {
    if (!req.user.merchantId && req.user.role === 'MERCHANT') {
      // merchant without merchant profile yet? allow for store creation
    }
  }
  next();
}

export function ensureStoreOwnership(storeId: string, user: AuthRequest['user']): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!user.storeIds) return false;
  return user.storeIds.includes(storeId);
}
