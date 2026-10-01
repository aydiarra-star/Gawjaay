import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission, assertStoreAccess } from '../middleware/tenant.js';
import { createSale, collectSalePayment } from '../services/sales.service.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

const saleSchema = z.object({
  storeId: z.string(),
  customerId: z.string().optional(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).min(1),
  discount: z.number().int().nonnegative().default(0),
  payments: z.array(z.object({ method: z.enum(['CASH', 'WAVE', 'ORANGE_MONEY', 'CARD', 'CREDIT']), amount: z.number().int().nonnegative() })).default([]),
});

/** Liste des ventes (POS) de l'organisation. */
router.get('/', requirePermission('sales:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  if (storeId) assertStoreAccess(req, storeId);
  const sales = await prisma.sale.findMany({
    where: { store: { organizationId: req.auth.organizationId, ...(storeId ? { id: storeId } : {}) } },
    include: { items: true, payments: true, customer: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ sales });
}));

/** Enregistre une vente POS (prix serveur, stock transactionnel). */
router.post('/', requirePermission('sales:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = saleSchema.parse(req.body);
  assertStoreAccess(req, input.storeId);

  const result = await prisma.$transaction((tx) =>
    createSale(tx, req.auth!.organizationId, {
      storeId: input.storeId,
      userId: req.auth!.userId,
      customerId: input.customerId ?? null,
      items: input.items,
      discount: input.discount,
      payments: input.payments,
    }),
  );

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'sale.create', entity: 'sale', entityId: result.saleId, meta: { total: result.total } });
  res.status(201).json(result);
}));

/** Encaisse un règlement de crédit sur une vente existante. */
router.post('/:id/payments', requirePermission('receivables:collect'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({ method: z.enum(['CASH', 'WAVE', 'ORANGE_MONEY', 'CARD']), amount: z.number().int().positive() }).parse(req.body);
  const result = await prisma.$transaction((tx) => collectSalePayment(tx, req.auth!.organizationId, req.params.id, input));
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'sale.payment', entity: 'sale', entityId: req.params.id });
  res.json(result);
}));

export default router;
