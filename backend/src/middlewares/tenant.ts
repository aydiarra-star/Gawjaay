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

/**
 * V2 hardening: lève une erreur 403 si l'utilisateur n'a pas accès à la boutique.
 * ADMIN : accès total. MERCHANT/EMPLOYEE : uniquement leurs boutiques (storeIds).
 * CLIENT : jamais (les routes privées boutique ne le concernent pas).
 */
export function assertStoreAccess(storeId: string, user: AuthRequest['user']): void {
  if (!user) throw Object.assign(new Error('Non authentifié'), { status: 401 });
  if (user.role === 'ADMIN') return;
  if (!ensureStoreOwnership(storeId, user)) {
    throw Object.assign(new Error('Accès refusé à cette boutique'), { status: 403 });
  }
}

/** Variante souple pour CLIENT : accès à SA ressource uniquement. */
export function assertOwnOrder(order: { clientId: string; storeId: string }, user: AuthRequest['user']): void {
  if (!user) throw Object.assign(new Error('Non authentifié'), { status: 401 });
  if (user.role === 'ADMIN') return;
  if (user.role === 'CLIENT') {
    if (order.clientId !== user.userId) throw Object.assign(new Error('Accès refusé'), { status: 403 });
    return;
  }
  assertStoreAccess(order.storeId, user);
}
