import type { NextFunction, Request, Response } from 'express';
import { hasPermission, type Role } from '@gawjaay/shared';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

/**
 * Résout l'organisation active à partir de l'en-tête `x-organization-id`
 * (ou du paramètre de requête `organizationId`) et vérifie que l'utilisateur
 * authentifié en est bien membre actif. Pose `req.auth`.
 *
 * C'est le point central de l'isolation multi-tenant : toutes les routes
 * métier passent par ici et n'accèdent aux données que via `req.auth.organizationId`.
 */
export async function requireOrganization(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw AppError.unauthorized();

    const orgId =
      (typeof req.headers['x-organization-id'] === 'string' ? req.headers['x-organization-id'] : undefined) ??
      (typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined);

    if (!orgId) throw AppError.badRequest("En-tête 'x-organization-id' requis");

    const membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: req.user.id } },
    });
    if (!membership || !membership.isActive) {
      // Ne révèle pas l'existence de l'organisation à un non-membre.
      throw AppError.forbidden('Accès à cette organisation refusé');
    }

    const role = membership.role as Role;
    const granted = parsePermissions(membership.permissions);

    const stores = await prisma.store.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    });

    req.auth = {
      userId: req.user.id,
      organizationId: orgId,
      role,
      permissions: granted,
      storeIds: stores.map((s) => s.id),
    };
    next();
  } catch (err) {
    next(err);
  }
}

function parsePermissions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** Exige une permission précise (cahier §10). */
export function requirePermission(permission: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(AppError.unauthorized());
    if (!hasPermission(req.auth.role, permission, req.auth.permissions)) {
      return next(AppError.forbidden(`Permission requise : ${permission}`));
    }
    next();
  };
}

/**
 * Vérifie qu'une boutique appartient bien à l'organisation active.
 * Lève une 404 (et non 403) pour ne pas divulguer l'existence d'une ressource d'une autre organisation.
 */
export function assertStoreAccess(req: Request, storeId: string): void {
  if (!req.auth || !req.auth.storeIds.includes(storeId)) {
    throw AppError.notFound('Boutique introuvable');
  }
}

/** Exige que l'utilisateur soit administrateur de la plateforme GawJaay. */
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.platformAdmin) return next(AppError.forbidden('Réservé à l\'administration GawJaay'));
  next();
}
