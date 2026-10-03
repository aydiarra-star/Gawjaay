import { Router } from 'express';
import { z } from 'zod';
import { PAYMENT_METHODS } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';
import { receivePurchase, purchaseOutstanding, collectPurchasePayment } from '../services/purchases.service.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

const schema = z.object({
  supplierId: z.string().optional(),
  storeId: z.string(),
  reference: z.string().max(60).optional(),
  items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive(), unitCost: z.number().int().nonnegative() })).min(1),
  /** Paiement immédiat optionnel au moment de la création du bon d'achat. */
  payment: z.object({ method: z.enum(PAYMENT_METHODS), amount: z.number().int().nonnegative() }).optional(),
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

  if (input.payment && input.payment.amount > total) {
    throw AppError.badRequest('Le paiement dépasse le total de l\'achat');
  }

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
      // Règlement immédiat optionnel (créance fournisseur réduite d'autant).
      payments:
        input.payment && input.payment.amount > 0
          ? { create: [{ amount: input.payment.amount, method: input.payment.method, status: 'SUCCESSFUL' }] }
          : undefined,
    },
    include: { items: true, payments: true },
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

/** Règlement d'une dette fournisseur sur un achat réceptionné (partiel ou total). */
router.post('/:id/payments', requirePermission('purchases:receive'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({ method: z.enum(PAYMENT_METHODS), amount: z.number().int().positive() }).parse(req.body);
  const result = await prisma.$transaction((tx) => collectPurchasePayment(tx, req.auth!.organizationId, req.params.id, input));
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'purchase.payment', entity: 'purchase', entityId: req.params.id });
  res.json(result);
}));

export default router;
