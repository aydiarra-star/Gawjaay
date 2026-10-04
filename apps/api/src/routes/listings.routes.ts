import { Router } from 'express';
import { z } from 'zod';
import {
  FULFILLMENT_MODES,
  LISTING_CONDITIONS,
  LISTING_STATUSES,
  requiresOrganization,
  resolveUnitPrice,
  type SellerType,
} from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const conditionEnum = z.enum(LISTING_CONDITIONS);
const fulfillmentEnum = z.enum(FULFILLMENT_MODES);
const statusEnum = z.enum(LISTING_STATUSES);

const createSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  condition: conditionEnum.optional(),
  fulfillment: fulfillmentEnum.default('PICKUP'),
  city: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  // Commerçant : référence du catalogue réel.
  productId: z.string().optional(),
  variantId: z.string().optional(),
  storeId: z.string().optional(),
  // Particulier : article hors catalogue, prix/quantité explicites.
  price: z.number().int().positive().optional(),
  quantity: z.number().int().nonnegative().optional(),
});

const updateSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  description: z.string().max(2000).optional().nullable(),
  condition: conditionEnum.optional().nullable(),
  fulfillment: fulfillmentEnum.optional(),
  city: z.string().max(60).optional().nullable(),
  region: z.string().max(60).optional().nullable(),
  status: statusEnum.optional(),
  price: z.number().int().positive().optional(),
  quantity: z.number().int().nonnegative().optional(),
});

/** Profil vendeur de l'utilisateur courant (unique) ; 403 s'il n'existe pas. */
async function mySeller(userId: string) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) throw AppError.forbidden('Créez d\'abord votre profil vendeur');
  if (seller.status !== 'ACTIVE') throw AppError.forbidden('Votre profil vendeur est suspendu');
  return seller;
}

/**
 * Charge une annonce en garantissant l'OWNERSHIP : elle doit appartenir au
 * profil vendeur de l'utilisateur. 404 (jamais 403) pour ne pas divulguer
 * l'existence d'une annonce d'autrui.
 */
async function myListing(userId: string, listingId: string) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) throw AppError.notFound('Annonce introuvable');
  const listing = await prisma.listing.findFirst({ where: { id: listingId, sellerId: seller.id } });
  if (!listing) throw AppError.notFound('Annonce introuvable');
  return { seller, listing };
}

/** Mes annonces. */
router.get('/', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const seller = await prisma.sellerProfile.findUnique({ where: { userId: req.user.id } });
  if (!seller) {
    res.json({ listings: [] });
    return;
  }
  const listings = await prisma.listing.findMany({
    where: { sellerId: seller.id },
    orderBy: { createdAt: 'desc' },
    include: { product: { select: { id: true, name: true, price: true, promoPrice: true } }, variant: { select: { id: true, name: true, price: true } } },
  });
  res.json({ listings: listings.map((l) => ({ ...l, priceInfo: listingPriceInfo(l) })) });
}));

/** Une de mes annonces. */
router.get('/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { listing } = await myListing(req.user.id, req.params.id);
  res.json({ listing });
}));

/**
 * Publie une annonce.
 *  - MERCHANT/BUSINESS : doit référencer un produit réel de SON organisation
 *    (isolation vérifiée serveur) ; prix/quantité proviennent des sources
 *    existantes et NE DOIVENT PAS être fournis (sinon second prix/stock).
 *  - INDIVIDUAL : article hors catalogue ; prix et quantité explicites requis.
 */
router.post('/', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const seller = await mySeller(req.user.id);
  const input = createSchema.parse(req.body);
  const merchantLike = requiresOrganization(seller.sellerType as SellerType);

  let organizationId: string | null = null;
  let productId: string | null = null;
  let variantId: string | null = null;
  let storeId: string | null = null;
  let price: number | null = null;
  let quantity: number | null = null;

  if (merchantLike) {
    if (input.price != null || input.quantity != null) {
      throw AppError.badRequest('Le prix et la quantité d\'une annonce commerçant proviennent du produit et du stock réels.');
    }
    if (!input.productId) throw AppError.badRequest('Une annonce commerçant doit référencer un produit du catalogue.');
    if (!seller.organizationId) throw AppError.forbidden('Profil vendeur sans organisation');

    const product = await prisma.product.findFirst({
      where: { id: input.productId, organizationId: seller.organizationId },
      include: { variants: { select: { id: true } } },
    });
    if (!product) throw AppError.notFound('Produit introuvable dans votre organisation');
    productId = product.id;
    organizationId = seller.organizationId;

    if (input.variantId) {
      if (!product.variants.some((v) => v.id === input.variantId)) {
        throw AppError.badRequest('Variante introuvable pour ce produit');
      }
      variantId = input.variantId;
    }
    if (input.storeId) {
      const store = await prisma.store.findFirst({ where: { id: input.storeId, organizationId: seller.organizationId } });
      if (!store) throw AppError.notFound('Boutique introuvable dans votre organisation');
      storeId = store.id;
    }
  } else {
    if (input.productId || input.variantId || input.storeId) {
      throw AppError.badRequest('Une annonce particulier ne référence pas le catalogue d\'une organisation.');
    }
    if (input.price == null || input.quantity == null) {
      throw AppError.badRequest('Une annonce particulier exige un prix et une quantité explicites.');
    }
    price = input.price;
    quantity = input.quantity;
  }

  const listing = await prisma.listing.create({
    data: {
      sellerId: seller.id,
      organizationId,
      productId,
      variantId,
      storeId,
      title: input.title,
      description: input.description ?? null,
      condition: input.condition ?? null,
      price,
      quantity,
      city: input.city ?? seller.city ?? null,
      region: input.region ?? seller.region ?? null,
      fulfillment: input.fulfillment,
      status: 'ACTIVE',
      publishedAt: new Date(),
    },
  });

  await audit({ organizationId, userId: req.user.id, action: 'listing.create', entity: 'listing', entityId: listing.id, meta: { sellerType: seller.sellerType } });
  res.status(201).json({ listing });
}));

/** Modifie une de mes annonces (ownership strict). */
router.patch('/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { seller, listing } = await myListing(req.user.id, req.params.id);
  const input = updateSchema.parse(req.body);
  const merchantLike = requiresOrganization(seller.sellerType as SellerType);

  // Un commerçant ne peut pas fixer un prix/quantité parallèle au catalogue.
  if (merchantLike && (input.price != null || input.quantity != null)) {
    throw AppError.badRequest('Le prix et la quantité proviennent du produit et du stock réels.');
  }
  if (!merchantLike && (input.price != null || input.quantity != null)) {
    const nextPrice = input.price ?? listing.price;
    const nextQuantity = input.quantity ?? listing.quantity;
    if (nextPrice == null || nextQuantity == null) {
      throw AppError.badRequest('Une annonce particulier exige un prix et une quantité explicites.');
    }
  }

  const data: Record<string, unknown> = { ...input };
  if (input.status === 'ACTIVE' && listing.status !== 'ACTIVE') data.publishedAt = new Date();

  const updated = await prisma.listing.update({ where: { id: listing.id }, data });
  await audit({ organizationId: listing.organizationId, userId: req.user.id, action: 'listing.update', entity: 'listing', entityId: listing.id });
  res.json({ listing: updated });
}));

/** Désactive une de mes annonces (jamais de suppression destructive). */
router.delete('/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const { listing } = await myListing(req.user.id, req.params.id);
  await prisma.listing.update({ where: { id: listing.id }, data: { status: 'INACTIVE' } });
  await audit({ organizationId: listing.organizationId, userId: req.user.id, action: 'listing.deactivate', entity: 'listing', entityId: listing.id });
  res.json({ ok: true });
}));

/** Prix / disponibilité affichables : source unique pour un commerçant. */
function listingPriceInfo(listing: {
  price: number | null;
  quantity: number | null;
  product: { price: number; promoPrice: number | null } | null;
  variant: { price: number | null } | null;
}) {
  if (!listing.product) {
    return { effectivePrice: listing.price, quantity: listing.quantity, source: 'listing' as const };
  }
  const resolution = resolveUnitPrice({
    variantPrice: listing.variant?.price ?? null,
    productPrice: listing.product.price,
    productPromoPrice: listing.product.promoPrice,
  });
  return { effectivePrice: resolution.effectivePrice, quantity: null, source: resolution.source };
}

export default router;
