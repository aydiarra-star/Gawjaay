import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { resolveUnitPrice } from '@gawjaay/shared';
import {
  discoverListings,
  discoverProducts,
  discoveryFacets,
  getPublicProduct,
  getPublicSeller,
  parseDiscoveryQuery,
  productPriceView,
} from '../services/discovery.service.js';

const router = Router();

/**
 * Vitrine publique d'une boutique (cahier §23).
 * Aucune coordonnée GPS n'est exposée : seulement la ville et la région, qui
 * sont des informations géographiques non précises réellement renseignées.
 */
router.get('/shops/:slug', asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({
    where: { slug: req.params.slug },
    include: { organization: { select: { name: true, description: true, logoUrl: true, phone: true, whatsapp: true, email: true, address: true, city: true, region: true, activity: true } } },
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
      organization: store.organization,
    },
    products: products.map((p) => {
      const view = productPriceView(p);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        hasImage: Boolean(p.imageData || p.imageUrl),
        packaging: p.packaging,
        format: p.format,
        category: p.category,
        price: view.effectivePrice,
        originalPrice: view.originalPrice,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          price: resolveUnitPrice({ variantPrice: v.price, productPrice: p.price, productPromoPrice: p.promoPrice }).effectivePrice,
          available: v.inventories.reduce((s, inv) => s + inv.quantity, 0),
        })),
      };
    }),
  });
}));

/**
 * Marketplace : recherche + filtres + proximité (cahier §24).
 * Ne renvoie que les produits `marketplaceVisible` de boutiques publiques actives.
 * Ordre imposé : filtrage → proximité → tri → pagination.
 */
router.get('/marketplace', asyncHandler(async (req, res) => {
  const filters = parseDiscoveryQuery(req.query as Record<string, unknown>);
  const [page, facets] = await Promise.all([discoverProducts(filters), discoveryFacets()]);
  res.json({
    items: page.items,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    categories: facets.categories,
    regions: facets.regions,
    cities: facets.cities,
    proximityApplied: Boolean(filters.geo),
  });
}));

/** Découverte des annonces publiques (fondation M2). */
router.get('/listings', asyncHandler(async (req, res) => {
  const filters = parseDiscoveryQuery(req.query as Record<string, unknown>);
  const page = await discoverListings(filters);
  res.json({ items: page.items, total: page.total, page: page.page, pageSize: page.pageSize });
}));

/** Profil vendeur public (champs strictement publics ; vendeur suspendu = 404). */
router.get('/sellers/:id', asyncHandler(async (req, res) => {
  const seller = await getPublicSeller(req.params.id);
  if (!seller) throw AppError.notFound('Vendeur introuvable');
  res.json({ seller });
}));

/**
 * Détail public d'un produit (M4 — parcours acheteur) : offres réelles par
 * boutique, variantes et prix résolu côté serveur. Aucune coordonnée GPS,
 * aucun prix d'achat, aucun SKU. 404 si le produit n'est pas découvrable.
 */
router.get('/products/:id', asyncHandler(async (req, res) => {
  const filters = parseDiscoveryQuery(req.query as Record<string, unknown>);
  const product = await getPublicProduct(req.params.id, filters.geo);
  if (!product) throw AppError.notFound('Produit introuvable');
  res.json({ product, proximityApplied: Boolean(filters.geo) });
}));

/** Catégories réellement publiables (aucune catégorie inventée). */
router.get('/categories', asyncHandler(async (_req, res) => {
  const facets = await discoveryFacets();
  res.json({ categories: facets.categories, regions: facets.regions, cities: facets.cities });
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
      variants: { some: { isActive: true, inventories: { some: { quantity: { gt: 0 }, store: { isPublic: true, isActive: true } } } } },
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
