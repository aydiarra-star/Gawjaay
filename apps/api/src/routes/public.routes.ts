import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

const router = Router();

/** Distance Haversine en km (cahier §24 : proximité réelle). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Vitrine publique d'une boutique (cahier §23). */
router.get('/shops/:slug', asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({
    where: { slug: req.params.slug },
    include: { organization: { select: { name: true, description: true, logoUrl: true, phone: true, email: true } } },
  });
  if (!store || !store.isActive || !store.isPublic) throw AppError.notFound('Boutique introuvable');

  const products = await prisma.product.findMany({
    where: { organizationId: store.organizationId, isActive: true },
    include: { variants: { where: { isActive: true }, include: { inventories: { where: { storeId: store.id } } } }, category: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Prix public : ne JAMAIS exposer le prix d'achat.
  res.json({
    shop: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      description: store.description,
      phone: store.phone,
      address: store.address,
      city: store.city,
      region: store.region,
      latitude: store.latitude,
      longitude: store.longitude,
      organization: store.organization,
    },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      hasImage: Boolean(p.imageData || p.imageUrl),
      packaging: p.packaging,
      format: p.format,
      category: p.category,
      price: p.promoPrice ?? p.price,
      originalPrice: p.promoPrice ? p.price : null,
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        price: v.price ?? p.promoPrice ?? p.price,
        available: v.inventories.reduce((s, inv) => s + inv.quantity, 0),
      })),
    })),
  });
}));

/**
 * Marketplace : recherche + filtres + proximité (cahier §24).
 * Ne renvoie que les produits `marketplaceVisible` de boutiques publiques actives.
 */
router.get('/marketplace', asyncHandler(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
  const lat = req.query.lat ? Number(req.query.lat) : undefined;
  const lng = req.query.lng ? Number(req.query.lng) : undefined;
  const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : undefined;
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 20)));

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      marketplaceVisible: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search ? { OR: [{ name: { contains: search } }, { description: { contains: search } }] } : {}),
      variants: { some: { inventories: { some: { quantity: { gt: 0 }, store: { isPublic: true, isActive: true } } } } },
    },
    include: {
      category: { select: { id: true, name: true } },
      variants: { include: { inventories: { include: { store: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, city: true, region: true, isPublic: true, isActive: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const items = products
    .map((p) => {
      const offers = p.variants.flatMap((v) =>
        v.inventories
          .filter((inv) => inv.quantity > 0 && inv.store.isPublic && inv.store.isActive)
          .map((inv) => ({
            storeId: inv.store.id,
            storeName: inv.store.name,
            storeSlug: inv.store.slug,
            city: inv.store.city,
            region: inv.store.region,
            variantId: v.id,
            variantName: v.name,
            available: inv.quantity,
            distanceKm: lat != null && lng != null && inv.store.latitude != null && inv.store.longitude != null
              ? Math.round(haversineKm(lat, lng, inv.store.latitude, inv.store.longitude) * 10) / 10
              : null,
          })),
      );
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        hasImage: Boolean(p.imageData || p.imageUrl),
        packaging: p.packaging,
        format: p.format,
        category: p.category,
        price: p.promoPrice ?? p.price,
        originalPrice: p.promoPrice ? p.price : null,
        offers,
      };
    })
    // Filtre par rayon si coordonnées fournies.
    .filter((item) => {
      if (radiusKm == null || lat == null || lng == null) return true;
      return item.offers.some((o) => o.distanceKm != null && o.distanceKm <= radiusKm);
    })
    .sort((a, b) => {
      if (lat == null || lng == null) return 0;
      const da = Math.min(...a.offers.map((o) => o.distanceKm ?? Infinity));
      const db = Math.min(...b.offers.map((o) => o.distanceKm ?? Infinity));
      return da - db;
    });

  const categories = await prisma.category.findMany({
    where: { isActive: true, products: { some: { isActive: true, marketplaceVisible: true } } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: 'asc' },
  });

  res.json({ items, categories, page, pageSize });
}));

/**
 * Photo publique d'un produit (marketplace / vitrine) : ne sert l'image que si
 * le produit est actif et visible publiquement, et qu'il appartient à une
 * boutique publique active. Aucune donnée privée n'est exposée.
 */
router.get('/products/:id/photo', asyncHandler(async (req, res) => {
  const product = await prisma.product.findFirst({
    where: {
      id: req.params.id,
      isActive: true,
      marketplaceVisible: true,
      variants: { some: { inventories: { some: { quantity: { gt: 0 }, store: { isPublic: true, isActive: true } } } } },
    },
    select: { imageData: true, imageMime: true, imageUrl: true },
  });
  if (!product) throw AppError.notFound('Photo introuvable');
  if (product.imageData) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type(product.imageMime ?? 'image/jpeg').send(Buffer.from(product.imageData.split(',')[1] ?? '', 'base64'));
    return;
  }
  if (product.imageUrl) {
    res.redirect(product.imageUrl);
    return;
  }
  throw AppError.notFound('Photo introuvable');
}));

export default router;
