import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission, assertStoreAccess } from '../middleware/tenant.js';
import { createFlashOffer, flashRemaining } from '../services/flash-offers.service.js';
import { resolveUnitPrice } from '@gawjaay/shared';

const router = Router();
router.use(authenticate, requireOrganization);

const createSchema = z.object({
  storeId: z.string(),
  variantId: z.string(),
  flashPrice: z.number().int().positive(),
  quantityLimit: z.number().int().positive().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

router.post('/', requirePermission('products:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = createSchema.parse(req.body);
  assertStoreAccess(req, input.storeId);
  const offer = await prisma.$transaction((tx) =>
    createFlashOffer(tx, req.auth!.organizationId, {
      storeId: input.storeId,
      variantId: input.variantId,
      flashPrice: input.flashPrice,
      quantityLimit: input.quantityLimit ?? null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    }),
  );
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'flash_offer.create', entity: 'flashOffer', entityId: offer.id });
  res.status(201).json({ offer });
}));

router.get('/', requirePermission('products:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  if (storeId) assertStoreAccess(req, storeId);
  const offers = await prisma.flashOffer.findMany({
    where: { organizationId: req.auth.organizationId, ...(storeId ? { storeId } : {}) },
    include: { variant: { select: { id: true, name: true, product: { select: { id: true, name: true, price: true, promoPrice: true } }, price: true } }, store: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const result = await prisma.$transaction(async (tx) => Promise.all(offers.map(async (o) => {
    const inventory = await tx.inventory.findUnique({ where: { storeId_variantId: { storeId: o.storeId, variantId: o.variantId } } });
    const active = o.status === 'ACTIVE' && (!o.endsAt || o.endsAt > new Date()) && (o.quantityLimit == null || o.quantitySold < o.quantityLimit);
    if (!active && o.status === 'ACTIVE') {
      const next = o.quantityLimit != null && o.quantitySold >= o.quantityLimit ? 'EXHAUSTED' : 'EXPIRED';
      await tx.flashOffer.update({ where: { id: o.id }, data: { status: next } });
    }
    return {
      ...o,
      available: active ? flashRemaining(o, inventory?.quantity ?? 0) : 0,
      normalPrice: resolveUnitPrice({ variantPrice: o.variant.price, productPrice: o.variant.product.price, productPromoPrice: o.variant.product.promoPrice }).effectivePrice,
    };
  })));
  res.json({ offers: result });
}));

router.patch('/:id/disable', requirePermission('products:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const offer = await prisma.flashOffer.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!offer) throw AppError.notFound('Offre Flash introuvable');
  assertStoreAccess(req, offer.storeId);
  const updated = await prisma.flashOffer.update({ where: { id: offer.id }, data: { status: 'DISABLED' } });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'flash_offer.disable', entity: 'flashOffer', entityId: offer.id });
  res.json({ offer: updated });
}));

router.get('/:id', requirePermission('products:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const offer = await prisma.flashOffer.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!offer) throw AppError.notFound('Offre Flash introuvable');
  assertStoreAccess(req, offer.storeId);
  res.json({ offer });
}));

export default router;
