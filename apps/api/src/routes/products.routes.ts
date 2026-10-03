import { Router } from 'express';
import { z } from 'zod';
import { PACKAGING_TYPES } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission, assertStoreAccess } from '../middleware/tenant.js';
import { applyStockChange } from '../services/inventory.service.js';
import { createSale } from '../services/sales.service.js';
import { assertPlanAllowsProduct, generateSku } from '../services/products.service.js';
import { imageColumnsFromInput, publicImage } from '../lib/media.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

const packagingEnum = z.enum(PACKAGING_TYPES);

/** Photo acceptée uniquement en data-URI base64 bornée (voir lib/media). */
const imageSchema = z.string().max(1_000_000).optional().nullable();

const variantSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(64).optional(),
  attributes: z.record(z.string()).optional(),
  price: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional().nullable(),
  imageData: imageSchema,
  lowStockThreshold: z.number().int().nonnegative().optional(),
});

const productSchema = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().min(1).max(64).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional().nullable(),
  imageData: imageSchema,
  packaging: packagingEnum.default('unite'),
  format: z.string().max(60).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  purchasePrice: z.number().int().nonnegative().default(0),
  price: z.number().int().nonnegative().default(0),
  promoPrice: z.number().int().nonnegative().optional().nullable(),
  alertThreshold: z.number().int().nonnegative().default(0),
  marketplaceVisible: z.boolean().default(false),
  variants: z.array(variantSchema).min(1, 'Au moins une variante est requise'),
});

/** Retire les photos base64 (lourdes) des réponses ; conserve `hasImage`. */
function stripVariantImages<T extends { imageData?: string | null }>(variants: T[]) {
  return variants.map((v) => publicImage(v));
}

function stripProduct<T extends { imageData?: string | null; variants?: Array<{ imageData?: string | null }> }>(product: T) {
  const { variants, ...rest } = product;
  return {
    ...publicImage(rest),
    ...(variants ? { variants: stripVariantImages(variants) } : {}),
  };
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

  res.json({ items: items.map((p) => stripProduct(p)), total, page, pageSize });
}));

router.get('/:id', requirePermission('products:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    include: { variants: true, category: true, supplier: true },
  });
  if (!product) throw AppError.notFound('Produit introuvable');
  res.json({ product: stripProduct(product) });
}));

router.post('/', requirePermission('products:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  await assertPlanAllowsProduct(req.auth.organizationId);
  const input = productSchema.parse(req.body);

  const product = await prisma.product.create({
    data: {
      organizationId: req.auth.organizationId,
      name: input.name,
      sku: input.sku ?? generateSku(),
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
      ...imageColumnsFromInput(input.imageData),
      packaging: input.packaging,
      format: input.format ?? null,
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
          sku: v.sku ?? `${input.sku ?? generateSku()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          attributes: v.attributes ? JSON.stringify(v.attributes) : null,
          price: v.price ?? null,
          imageUrl: v.imageUrl ?? null,
          ...imageColumnsFromInput(v.imageData),
          lowStockThreshold: v.lowStockThreshold ?? 0,
        })),
      },
    },
    include: { variants: true },
  });

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.create', entity: 'product', entityId: product.id });
  res.status(201).json({ product: stripProduct(product) });
}));

router.patch('/:id', requirePermission('products:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = productSchema.partial().omit({ variants: true }).parse(req.body);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Produit introuvable');

  const { imageData, ...rest } = input;
  const product = await prisma.product.update({
    where: { id: existing.id },
    data: {
      ...rest,
      ...(imageData !== undefined ? imageColumnsFromInput(imageData) : {}),
    },
    include: { variants: true },
  });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.update', entity: 'product', entityId: product.id });
  res.json({ product: stripProduct(product) });
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

/* ─────────────────────────── Photo produit ─────────────────────────── */

/** Sert la photo persistée en base (aucun filesystem éphémère). */
router.get('/:id/photo', asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    select: { imageData: true, imageMime: true, imageUrl: true },
  });
  if (!product) throw AppError.notFound('Produit introuvable');
  if (product.imageData) {
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type(product.imageMime ?? 'image/jpeg').send(Buffer.from(product.imageData.split(',')[1] ?? '', 'base64'));
    return;
  }
  if (product.imageUrl) {
    res.redirect(product.imageUrl);
    return;
  }
  throw AppError.notFound('Aucune photo');
}));

/** Définit / remplace la photo (accepte une chaîne vide pour la retirer). */
router.put('/:id/photo', requirePermission('products:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Produit introuvable');
  const { imageData } = z.object({ imageData: z.string().max(1_000_000).nullable() }).parse(req.body);
  const columns = imageColumnsFromInput(imageData);
  await prisma.product.update({ where: { id: existing.id }, data: columns });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.photo', entity: 'product', entityId: existing.id });
  res.json({ hasImage: Boolean(columns.imageData) });
}));

/** Supprime la photo produit. */
router.delete('/:id/photo', requirePermission('products:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Produit introuvable');
  await prisma.product.update({ where: { id: existing.id }, data: { imageData: null, imageMime: null } });
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.photo.delete', entity: 'product', entityId: existing.id });
  res.json({ ok: true });
}));

/* ─────────────────── Parcours marchand : produit → stock → vente ─────────────────── */

const merchantCreateSchema = productSchema.extend({
  storeId: z.string().optional(),
  initialStock: z.number().int().nonnegative().default(0),
});

/**
 * Crée un produit ET, si une quantité initiale est fournie, enregistre le stock
 * initial comme un vrai mouvement (type INITIAL). Produit et stock sont créés
 * dans la même transaction : jamais de nombre modifié sans mouvement métier.
 */
router.post('/merchant', requirePermission('products:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  await assertPlanAllowsProduct(req.auth.organizationId);
  const input = merchantCreateSchema.parse(req.body);

  const storeId = input.storeId ?? req.auth.storeIds[0];
  if (!storeId) throw AppError.badRequest('Aucune boutique disponible');
  assertStoreAccess(req, storeId);

  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        organizationId: req.auth!.organizationId,
        name: input.name,
        sku: input.sku ?? generateSku(),
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        ...imageColumnsFromInput(input.imageData),
        packaging: input.packaging,
        format: input.format ?? null,
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
            sku: v.sku ?? `${input.sku ?? generateSku()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            attributes: v.attributes ? JSON.stringify(v.attributes) : null,
            price: v.price ?? null,
            imageUrl: v.imageUrl ?? null,
            ...imageColumnsFromInput(v.imageData),
            lowStockThreshold: v.lowStockThreshold ?? 0,
          })),
        },
      },
      include: { variants: true },
    });

    const variantId = product.variants[0]?.id;
    if (input.initialStock > 0) {
      if (!variantId) throw AppError.badRequest('Variante manquante');
      await applyStockChange(tx, {
        storeId,
        variantId,
        quantity: input.initialStock,
        type: 'INITIAL',
        userId: req.auth!.userId,
        note: 'Stock initial à la création',
      });
    }

    return { product, storeId, initialStock: input.initialStock };
  });

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'product.create', entity: 'product', entityId: result.product.id, meta: { initialStock: result.initialStock } });
  res.status(201).json({ product: stripProduct(result.product), storeId: result.storeId, initialStock: result.initialStock });
}));

const stockInSchema = z.object({
  storeId: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().int().positive(),
  purchasePrice: z.number().int().nonnegative().optional(),
  supplierId: z.string().optional().nullable(),
  note: z.string().max(300).optional(),
});

/**
 * Entrée de stock sur un produit existant : met à jour le prix d'achat (dernier
 * coût connu) et enregistre un mouvement ENTRY réel.
 */
router.post('/:id/stock', requirePermission('stock:adjust'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = stockInSchema.parse(req.body);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    include: { variants: true },
  });
  if (!product) throw AppError.notFound('Produit introuvable');
  const variantId = input.variantId ?? product.variants[0]?.id;
  if (!variantId || !product.variants.some((v) => v.id === variantId)) throw AppError.badRequest('Variante introuvable');
  const storeId = input.storeId ?? req.auth.storeIds[0];
  if (!storeId) throw AppError.badRequest('Aucune boutique disponible');
  assertStoreAccess(req, storeId);

  const result = await prisma.$transaction(async (tx) => {
    const quantity = await applyStockChange(tx, {
      storeId,
      variantId,
      quantity: input.quantity,
      type: 'ENTRY',
      userId: req.auth!.userId,
      note: input.note ?? (input.supplierId ? 'Entrée de stock (fournisseur)' : 'Entrée de stock'),
    });
    if (input.purchasePrice !== undefined) {
      await tx.product.update({ where: { id: product.id }, data: { purchasePrice: input.purchasePrice } });
    }
    if (input.supplierId) {
      await tx.product.update({ where: { id: product.id }, data: { supplierId: input.supplierId } });
    }
    return { quantity };
  });

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'stock.entry', entity: 'product', entityId: product.id, meta: { quantity: input.quantity } });
  res.json(result);
}));

const quickSaleSchema = z.object({
  storeId: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  method: z.string().optional(),
});

/**
 * Vente rapide depuis une fiche produit : réutilise le service de vente unique
 * (prix serveur, décrément du stock, mouvements). Aucun prix fourni par le client.
 */
router.post('/:id/sale', requirePermission('sales:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = quickSaleSchema.parse(req.body);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    include: { variants: true },
  });
  if (!product) throw AppError.notFound('Produit introuvable');
  const variantId = input.variantId ?? product.variants[0]?.id;
  if (!variantId || !product.variants.some((v) => v.id === variantId)) throw AppError.badRequest('Variante introuvable');
  const storeId = input.storeId ?? req.auth.storeIds[0];
  if (!storeId) throw AppError.badRequest('Aucune boutique disponible');
  assertStoreAccess(req, storeId);

  const variant = product.variants.find((v) => v.id === variantId)!;
  const unitPrice = variant.price ?? product.price;

  const result = await prisma.$transaction((tx) =>
    createSale(tx, req.auth!.organizationId, {
      storeId,
      userId: req.auth!.userId,
      customerId: null,
      items: [{ variantId, quantity: input.quantity }],
      discount: 0,
      payments: [{ method: input.method ?? 'CASH', amount: unitPrice * input.quantity }],
    }),
  );

  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'sale.create', entity: 'sale', entityId: result.saleId, meta: { total: result.total, productId: product.id } });
  res.status(201).json(result);
}));

export default router;
