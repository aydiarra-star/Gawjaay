import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'categorie';
}

const schema = z.object({
  name: z.string().min(2).max(80),
  imageUrl: z.string().url().optional(),
  parentId: z.string().optional(),
});

router.get('/', requirePermission('categories:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const categories = await prisma.category.findMany({
    where: { organizationId: req.auth.organizationId, isActive: true },
    orderBy: { name: 'asc' },
  });
  res.json({ categories });
}));

router.post('/', requirePermission('categories:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = schema.parse(req.body);
  const slug = slugify(input.name);
  const category = await prisma.category.create({
    data: {
      organizationId: req.auth.organizationId,
      name: input.name,
      slug,
      imageUrl: input.imageUrl ?? null,
      parentId: input.parentId ?? null,
    },
  });
  res.status(201).json({ category });
}));

router.patch('/:id', requirePermission('categories:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = schema.partial().parse(req.body);
  const existing = await prisma.category.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Catégorie introuvable');
  const category = await prisma.category.update({ where: { id: existing.id }, data: input });
  res.json({ category });
}));

router.delete('/:id', requirePermission('categories:delete'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const existing = await prisma.category.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Catégorie introuvable');
  await prisma.category.update({ where: { id: existing.id }, data: { isActive: false } });
  res.json({ ok: true });
}));

export default router;
