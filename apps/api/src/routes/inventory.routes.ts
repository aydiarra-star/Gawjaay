import { Router } from 'express';
import { z } from 'zod';
import { MOVEMENT_TYPES } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission, assertStoreAccess } from '../middleware/tenant.js';
import { applyStockChange } from '../services/inventory.service.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/** Stock d'une boutique (avec produit/variante et seuil d'alerte). */
router.get('/', requirePermission('stock:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  if (storeId) assertStoreAccess(req, storeId);

  const inventories = await prisma.inventory.findMany({
    where: { store: { organizationId: req.auth.organizationId, ...(storeId ? { id: storeId } : {}) } },
    include: { variant: { include: { product: true } }, store: { select: { id: true, name: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json({
    items: inventories.map((inv) => {
      const threshold = inv.variant.lowStockThreshold || inv.variant.product.alertThreshold;
      return {
        storeId: inv.storeId,
        storeName: inv.store.name,
        variantId: inv.variantId,
        sku: inv.variant.sku,
        productId: inv.variant.product.id,
        productName: inv.variant.product.name,
        variantName: inv.variant.name,
        packaging: inv.variant.product.packaging,
        format: inv.variant.product.format,
        hasImage: Boolean(inv.variant.product.imageData || inv.variant.product.imageUrl),
        quantity: inv.quantity,
        threshold,
        low: threshold > 0 && inv.quantity <= threshold,
        out: inv.quantity <= 0,
      };
    }),
  });
}));

/** Historique des mouvements. */
router.get('/movements', requirePermission('stock:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  if (storeId) assertStoreAccess(req, storeId);
  const movements = await prisma.inventoryMovement.findMany({
    where: { store: { organizationId: req.auth.organizationId, ...(storeId ? { id: storeId } : {}) } },
    include: {
      variant: { include: { product: { select: { id: true, name: true, packaging: true, format: true } } } },
      store: { select: { name: true } },
      user: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({
    movements: movements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      type: m.type,
      quantity: m.quantity,
      reference: m.reference,
      note: m.note,
      storeId: m.storeId,
      storeName: m.store.name,
      variantId: m.variantId,
      variantName: m.variant.name,
      productId: m.variant.product.id,
      productName: m.variant.product.name,
      packaging: m.variant.product.packaging,
      format: m.variant.product.format,
      userName: m.user?.fullName ?? null,
    })),
  });
}));

const adjustSchema = z.object({
  storeId: z.string(),
  variantId: z.string(),
  quantity: z.number().int().refine((n) => n !== 0, 'Quantité non nulle requise'),
  type: z.enum(['ENTRY', 'EXIT', 'ADJUSTMENT', 'COUNT', 'INITIAL']),
  note: z.string().max(300).optional(),
});

/** Ajustement / entrée / sortie de stock (transactionnel + historisé). */
router.post('/adjust', requirePermission('stock:adjust'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = adjustSchema.parse(req.body);
  assertStoreAccess(req, input.storeId);

  // La variante doit appartenir à l'organisation.
  const variant = await prisma.productVariant.findFirst({
    where: { id: input.variantId, product: { organizationId: req.auth.organizationId } },
  });
  if (!variant) throw AppError.notFound('Variante introuvable');

  const next = await prisma.$transaction((tx) =>
    applyStockChange(tx, {
      storeId: input.storeId,
      variantId: input.variantId,
      quantity: input.quantity,
      type: input.type,
      userId: req.auth!.userId,
      note: input.note,
      allowNegative: input.type === 'COUNT' || input.type === 'ADJUSTMENT',
    }),
  );

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'stock.adjust', entity: 'variant', entityId: input.variantId, meta: { quantity: input.quantity, type: input.type } });
  res.json({ quantity: next });
}));

/** Transfert entre deux boutiques de la même organisation. */
const transferSchema = z.object({
  fromStoreId: z.string(),
  toStoreId: z.string(),
  variantId: z.string(),
  quantity: z.number().int().positive(),
});

router.post('/transfer', requirePermission('stock:transfer'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = transferSchema.parse(req.body);
  assertStoreAccess(req, input.fromStoreId);
  assertStoreAccess(req, input.toStoreId);
  if (input.fromStoreId === input.toStoreId) throw AppError.badRequest('Boutiques identiques');

  await prisma.$transaction(async (tx) => {
    await applyStockChange(tx, { storeId: input.fromStoreId, variantId: input.variantId, quantity: input.quantity, type: 'TRANSFER_OUT', userId: req.auth!.userId });
    await applyStockChange(tx, { storeId: input.toStoreId, variantId: input.variantId, quantity: input.quantity, type: 'TRANSFER_IN', userId: req.auth!.userId });
  });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'stock.transfer', entity: 'variant', entityId: input.variantId, meta: input });
  res.json({ ok: true });
}));

router.get('/movement-types', (_req, res) => res.json({ types: MOVEMENT_TYPES }));

export default router;
