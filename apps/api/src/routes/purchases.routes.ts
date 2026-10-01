import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';
import { receivePurchase, purchaseOutstanding } from '../services/purchases.service.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

const schema = z.object({
  supplierId: z.string().optional(),
  storeId: z.string(),
  reference: z.string().max(60).optional(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive(), unitCost: z.number().int().nonnegative() })).min(1),
});

router.get('/', requirePermission('purchases:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const purchases = await prisma.purchase.findMany({
    where: { organizationId: req.auth.organizationId },
    include: { items: { include: { variant: { include: { product: { select: { name: true } } } } } }, payments: true, supplier: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ purchases });
}));

router.post('/', requirePermission('purchases:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = schema.parse(req.body);

  const store = await prisma.store.findFirst({ where: { id: input.storeId, organizationId: req.auth.organizationId } });
  if (!store) throw AppError.notFound('Boutique introuvable');

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: input.items.map((i) => i.variantId) }, product: { organizationId: req.auth.organizationId } },
  });
  const ids = new Set(variants.map((v) => v.id));
  for (const item of input.items) if (!ids.has(item.variantId)) throw AppError.badRequest(`Variante inconnue: ${item.variantId}`);

  const lines = input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, unitCost: i.unitCost, lineTotal: i.quantity * i.unitCost }));
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  const purchase = await prisma.purchase.create({
    data: {
      organizationId: req.auth.organizationId,
      supplierId: input.supplierId ?? null,
      storeId: input.storeId,
      reference: input.reference ?? null,
      status: 'DRAFT',
      subtotal: total,
      total,
      items: { create: lines },
    },
    include: { items: true },
  });
  res.status(201).json({ purchase });
}));

/** Réception : c'est ici (et seulement ici) que le stock augmente. */
router.post('/:id/receive', requirePermission('purchases:receive'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const result = await prisma.$transaction((tx) => receivePurchase(tx, req.auth!.organizationId, req.params.id, req.auth!.userId));
  res.json(result);
}));

router.get('/:id/outstanding', requirePermission('purchases:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const purchase = await prisma.purchase.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!purchase) throw AppError.notFound('Achat introuvable');
  const outstanding = await purchaseOutstanding(prisma, req.params.id);
  res.json({ outstanding });
}));

export default router;
