import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission, assertStoreAccess } from '../middleware/tenant.js';
import { withinLimit, planLimits, type PlanCode } from '@gawjaay/shared';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

const storeSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isPublic: z.boolean().default(false),
});

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'boutique';
}

router.get('/', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const stores = await prisma.store.findMany({
    where: { organizationId: req.auth.organizationId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ stores });
}));

router.post('/', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = storeSchema.parse(req.body);

  const sub = await prisma.subscription.findUnique({ where: { organizationId: req.auth.organizationId } });
  const plan = (sub?.plan ?? 'FREE') as PlanCode;
  const limits = planLimits(plan);
  const count = await prisma.store.count({ where: { organizationId: req.auth.organizationId } });
  if (!withinLimit(limits.maxStores, count)) {
    throw AppError.forbidden(`Limite du plan ${plan} atteinte (${limits.maxStores} boutique(s)). Passez à un plan supérieur.`);
  }

  let slug = slugify(input.name);
  let i = 1;
  while (await prisma.store.findUnique({ where: { slug } })) slug = `${slugify(input.name)}-${i++}`;

  const store = await prisma.store.create({
    data: {
      organizationId: req.auth.organizationId,
      name: input.name,
      slug,
      description: input.description ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      isPublic: input.isPublic,
    },
  });
  res.status(201).json({ store });
}));

router.patch('/:id', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  assertStoreAccess(req, req.params.id);
  const input = storeSchema.partial().parse(req.body);
  const store = await prisma.store.update({ where: { id: req.params.id }, data: input });
  res.json({ store });
}));

export default router;
