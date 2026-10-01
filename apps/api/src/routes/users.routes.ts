import { Router } from 'express';
import { z } from 'zod';
import { ORGANIZATION_ROLES, ROLE_PERMISSIONS, type Role } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { hashPassword } from '../lib/password.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/** Membres de l'organisation active (cahier §9). */
router.get('/', requirePermission('users:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const members = await prisma.membership.findMany({
    where: { organizationId: req.auth.organizationId },
    include: { user: { select: { id: true, email: true, fullName: true, phone: true, isActive: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    members: members.map((m) => ({
      membershipId: m.id,
      role: m.role,
      isActive: m.isActive,
      permissions: m.permissions ? JSON.parse(m.permissions) : null,
      user: m.user,
    })),
  });
}));

/** Invite/crée un utilisateur et l'attache à l'organisation avec un rôle. */
router.post('/', requirePermission('users:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({
    email: z.string().email(),
    fullName: z.string().min(2).max(120),
    phone: z.string().max(30).optional(),
    password: z.string().min(8).max(128),
    role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'VENDEUR', 'STOCK']),
    permissions: z.array(z.string()).optional(),
  }).parse(req.body);

  if (!ORGANIZATION_ROLES.includes(input.role as Role)) throw AppError.badRequest('Rôle invalide');
  if (input.role === 'OWNER') throw AppError.forbidden('Un seul propriétaire est autorisé à la création');

  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      user = await tx.user.create({ data: { email, passwordHash, fullName: input.fullName, phone: input.phone ?? null } });
    }
    const existing = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: req.auth!.organizationId, userId: user.id } },
    });
    if (existing) throw AppError.conflict('Cet utilisateur est déjà membre de l\'organisation');
    return tx.membership.create({
      data: {
        organizationId: req.auth!.organizationId,
        userId: user.id,
        role: input.role,
        permissions: input.permissions && input.permissions.length > 0 ? JSON.stringify(input.permissions) : null,
      },
    });
  });

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'user.create', entity: 'membership', entityId: result.id, meta: { role: input.role } });
  res.status(201).json({ membershipId: result.id });
}));

/** Modifie rôle / permissions / activation d'un membre. */
router.patch('/:membershipId', requirePermission('users:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({
    role: z.enum(['OWNER', 'ADMIN', 'MANAGER', 'VENDEUR', 'STOCK']).optional(),
    permissions: z.array(z.string()).nullable().optional(),
    isActive: z.boolean().optional(),
  }).parse(req.body);

  const membership = await prisma.membership.findFirst({
    where: { id: req.params.membershipId, organizationId: req.auth.organizationId },
  });
  if (!membership) throw AppError.notFound('Membre introuvable');
  if (membership.role === 'OWNER' && input.role && input.role !== 'OWNER') {
    throw AppError.forbidden('Le propriétaire ne peut pas être rétrogradé');
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: {
      role: input.role ?? membership.role,
      permissions: input.permissions === undefined ? membership.permissions : input.permissions ? JSON.stringify(input.permissions) : null,
      isActive: input.isActive ?? membership.isActive,
    },
  });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'user.update', entity: 'membership', entityId: updated.id });
  res.json({ membershipId: updated.id });
}));

/** Catalogue des rôles et permissions par défaut (référence pour l'UI). */
router.get('/roles', requirePermission('users:manage'), (_req, res) => {
  res.json({
    roles: ORGANIZATION_ROLES.map((role) => ({ role, permissions: ROLE_PERMISSIONS[role] })),
  });
});

export default router;
