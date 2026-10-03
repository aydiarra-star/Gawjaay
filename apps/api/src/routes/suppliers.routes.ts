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

const schema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

router.get('/', requirePermission('suppliers:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: req.auth.organizationId },
    orderBy: { name: 'asc' },
  });
  res.json({ suppliers });
}));

/** Fiche fournisseur : produits, achats, dettes (cahier §20). */
router.get('/:id', requirePermission('suppliers:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const supplier = await prisma.supplier.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    include: {
      products: { select: { id: true, name: true } },
      purchases: {
        include: {
          payments: true,
          items: { include: { variant: { include: { product: { select: { name: true } } } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
    },
  });
  if (!supplier) throw AppError.notFound('Fournisseur introuvable');
  const debt = supplier.purchases.reduce((sum, p) => {
    const paid = p.payments.filter((x) => x.status === 'SUCCESSFUL').reduce((s, x) => s + x.amount, 0);
    return sum + Math.max(0, p.total - paid);
  }, 0);
  const totalPurchased = supplier.purchases
    .filter((p) => p.status === 'RECEIVED')
    .reduce((sum, p) => sum + p.total, 0);
  const lastPurchaseAt = supplier.purchases[0]?.createdAt ?? null;
  res.json({ supplier: { ...supplier, debt, totalPurchased, lastPurchaseAt } });
}));

router.post('/', requirePermission('suppliers:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = schema.parse(req.body);
  const supplier = await prisma.supplier.create({ data: { organizationId: req.auth.organizationId, ...input } });
  res.status(201).json({ supplier });
}));

router.patch('/:id', requirePermission('suppliers:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = schema.partial().parse(req.body);
  const existing = await prisma.supplier.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Fournisseur introuvable');
  const supplier = await prisma.supplier.update({ where: { id: existing.id }, data: input });
  res.json({ supplier });
}));

export default router;
