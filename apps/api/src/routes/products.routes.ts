import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';
import { withinLimit, planLimits, type PlanCode } from '@gawjaay/shared';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

const variantSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(64),
  attributes: z.record(z.string()).optional(),
  price: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
});

const productSchema = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().min(1).max(64),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  purchasePrice: z.number().int().nonnegative().default(0),
  price: z.number().int().nonnegative().default(0),
  promoPrice: z.number().int().nonnegative().optional(),
  alertThreshold: z.number().int().nonnegative().default(0),
  marketplaceVisible: z.boolean().default(false),
  variants: z.array(variantSchema).min(1, 'Au moins une variante est requise'),
});

async function assertPlanAllowsProduct(orgId: string) {
  const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
  const plan = (sub?.plan ?? 'FREE') as PlanCode;
  const limits = planLimits(plan);
  const count = await prisma.product.count({ where: { organizationId: orgId, isActive: true } });
  if (!withinLimit(limits.maxProducts, count)) {
    throw AppError.forbidden(`Limite du plan ${plan} atteinte (${limits.maxProducts} produits). Passez à un plan supérieur.`);
  }
}

/** Liste paginée des produits de l'organisation active. */
router.get('/', requirePermission('products:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;

  const where = {
    organizationId: req.auth.organizationId,
    isActive: true,
    ...(categoryId ? { categoryId } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { sku: { contains: search } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, variants: true, supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ items, total, page, pageSize });
}));

router.get('/:id', requirePermission('products:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    include: { variants: true, category: true, supplier: true },
  });
  if (!product) throw AppError.notFound('Produit introuvable');
  res.json({ product });
}));

router.post('/', requirePermission('products:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  await assertPlanAllowsProduct(req.auth.organizationId);
  const input = productSchema.parse(req.body);

  const product = await prisma.product.create({
    data: {
      organizationId: req.auth.organizationId,
      name: input.name,
      sku: input.sku,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      categoryId: input.categoryId ?? null,
      supplierId: input.supplierId ?? null,
      purchasePrice: input.purchasePrice,
      price: input.price,
      promoPrice: input.promoPrice ?? null,
      alertThreshold: input.alertThreshold,
      marketplaceVisible: input.marketplaceVisible,
      variants: {
        create: input.variants.map((v) => ({
          name: v.name,
          sku: v.sku,
          attributes: v.attributes ? JSON.stringify(v.attributes) : null,
          price: v.price ?? null,
          imageUrl: v.imageUrl ?? null,
        })),
      },
    },
    include: { variants: true },
  });

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.create', entity: 'product', entityId: product.id });
  res.status(201).json({ product });
}));

router.patch('/:id', requirePermission('products:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = productSchema.partial().omit({ variants: true }).parse(req.body);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Produit introuvable');
  const product = await prisma.product.update({ where: { id: existing.id }, data: input });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.update', entity: 'product', entityId: product.id });
  res.json({ product });
}));

router.delete('/:id', requirePermission('products:delete'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Produit introuvable');
  // Désactivation logique (préserve l'historique des ventes).
  await prisma.product.update({ where: { id: existing.id }, data: { isActive: false } });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.delete', entity: 'product', entityId: existing.id });
  res.json({ ok: true });
}));

export default router;
