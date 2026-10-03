import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);

/** Organisations de l'utilisateur courant (cahier §11, §12). */
router.get('/', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const memberships = await prisma.membership.findMany({
    where: { userId: req.user.id, isActive: true },
    include: { organization: { include: { stores: { select: { id: true, name: true, slug: true } }, subscription: true } } },
  });
  res.json({
    organizations: memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      plan: m.organization.subscription?.plan ?? 'FREE',
      stores: m.organization.stores,
    })),
  });
}));

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().url().optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional().nullable(),
  email: z.string().email().optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  activity: z.string().max(120).optional(),
});

/** Profil public de l'organisation active (informations réellement fournies). */
router.get('/current', requireOrganization, asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const organization = await prisma.organization.findUnique({ where: { id: req.auth.organizationId } });
  if (!organization) throw AppError.notFound('Organisation introuvable');
  res.json({ organization });
}));

/** Met à jour l'organisation active (isolation via req.auth.organizationId). */
router.patch('/current', requireOrganization, asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = updateSchema.parse(req.body);
  const updated = await prisma.organization.update({
    where: { id: req.auth.organizationId },
    data: input,
  });
  res.json({ organization: updated });
}));

export default router;
