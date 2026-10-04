import { prisma } from '../lib/prisma.js';
import {
  DISCOVERY_DEFAULT_PAGE_SIZE,
  DISCOVERY_MAX_PAGE_SIZE,
  DISCOVERY_RADII_KM,
  boundingBox,
  haversineKm,
  isAllowedRadiusKm,
  isFulfillmentMode,
  isSellerType,
  isValidCoordinate,
  normalizeSearchTerm,
  resolveUnitPrice,
  roundDistanceKm,
  type FulfillmentMode,
  type SellerType,
} from '@gawjaay/shared';

/**
 * Service de Découverte publique (Marketplace M3).
 *
 * Principes :
 *  - Une SEULE source de vérité : prix via `resolveUnitPrice()`, disponibilité
 *    via l'inventaire réel. Aucun prix ni stock Marketplace parallèle.
 *  - Aucun classement artificiel : le tri est factuel (récence) ou géographique
 *    (distance réelle). Jamais de score, note ou « meilleur vendeur ».
 *  - Aucune coordonnée GPS n'est jamais renvoyée ; seule une distance arrondie
 *    est exposée, et uniquement lorsqu'elle est réellement calculable.
 *
 * Ordre imposé : FILTRAGE → PROXIMITÉ → TRI → PAGINATION.
 * Pour garantir cet ordre sans paginer avant le calcul de distance/prix résolu,
 * les filtres sont d'abord poussés en SQL (bon marché, indexés), puis raffinés
 * en mémoire (prix résolu, rayon exact) AVANT la pagination finale.
 */

/**
 * Plafond de candidats chargés avant raffinement. Borne la mémoire pour la
 * phase M3 (données réelles modestes). Au-delà, la pagination resterait correcte
 * mais le total serait borné : à traiter en M4 (dénormalisation / PostGIS).
 */
const CANDIDATE_CAP = 5000;

export interface DiscoveryQuery {
  search?: unknown;
  categoryId?: unknown;
  region?: unknown;
  city?: unknown;
  priceMin?: unknown;
  priceMax?: unknown;
  sellerType?: unknown;
  fulfillment?: unknown;
  inStockOnly?: unknown;
  page?: unknown;
  pageSize?: unknown;
  lat?: unknown;
  lng?: unknown;
  radiusKm?: unknown;
}

interface CommonFilters {
  search: string;
  categoryId?: string;
  region?: string;
  city?: string;
  priceMin?: number;
  priceMax?: number;
  sellerType?: SellerType;
  fulfillment?: FulfillmentMode;
  inStockOnly: boolean;
  page: number;
  pageSize: number;
  geo?: { lat: number; lng: number; radiusKm: number };
}

function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return v.length ? v.slice(0, 80) : undefined;
}

function intOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function boolOrUndefined(value: unknown): boolean | undefined {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return undefined;
}

/** Normalise et borne tous les paramètres de découverte. Aucune valeur inventée. */
export function parseDiscoveryQuery(q: DiscoveryQuery): CommonFilters {
  const pageRaw = Number(q.page ?? 1);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const sizeRaw = Number(q.pageSize ?? DISCOVERY_DEFAULT_PAGE_SIZE);
  const pageSize =
    Number.isFinite(sizeRaw) && sizeRaw >= 1
      ? Math.min(DISCOVERY_MAX_PAGE_SIZE, Math.floor(sizeRaw))
      : DISCOVERY_DEFAULT_PAGE_SIZE;

  const lat = typeof q.lat !== 'undefined' && q.lat !== '' ? Number(q.lat) : undefined;
  const lng = typeof q.lng !== 'undefined' && q.lng !== '' ? Number(q.lng) : undefined;
  const radiusRaw = typeof q.radiusKm !== 'undefined' && q.radiusKm !== '' ? Number(q.radiusKm) : undefined;

  let geo: CommonFilters['geo'];
  if (isValidCoordinate(lat, lng)) {
    // Rayon : uniquement une valeur autorisée ; sinon repli honnête sur le plus
    // grand rayon (25 km) plutôt que d'inventer une précision.
    const radiusKm = isAllowedRadiusKm(radiusRaw) ? radiusRaw : DISCOVERY_RADII_KM[DISCOVERY_RADII_KM.length - 1];
    geo = { lat: lat as number, lng: lng as number, radiusKm };
  }

  return {
    search: normalizeSearchTerm(q.search),
    categoryId: str(q.categoryId),
    region: str(q.region),
    city: str(q.city),
    priceMin: intOrUndefined(q.priceMin),
    priceMax: intOrUndefined(q.priceMax),
    sellerType: isSellerType(q.sellerType) ? (q.sellerType as SellerType) : undefined,
    fulfillment: isFulfillmentMode(q.fulfillment) ? (q.fulfillment as FulfillmentMode) : undefined,
    inStockOnly: boolOrUndefined(q.inStockOnly) ?? true,
    page,
    pageSize,
    geo,
  };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

function paginate<T>(all: T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize };
}

/** Vue de prix publique d'un produit : plus bas prix réellement applicable. */
export function productPriceView(product: {
  price: number;
  promoPrice: number | null;
  variants: Array<{ price: number | null }>;
}): { effectivePrice: number; originalPrice: number | null } {
  const resolutions = product.variants.map((v) =>
    resolveUnitPrice({ variantPrice: v.price, productPrice: product.price, productPromoPrice: product.promoPrice }),
  );
  if (resolutions.length === 0) {
    const res = resolveUnitPrice({ productPrice: product.price, productPromoPrice: product.promoPrice });
    return {
      effectivePrice: res.effectivePrice,
      originalPrice: res.promoPrice != null && res.basePrice > res.promoPrice ? res.basePrice : null,
    };
  }
  const effectivePrice = Math.min(...resolutions.map((r) => r.effectivePrice));
  const cheapest = resolutions.find((r) => r.effectivePrice === effectivePrice)!;
  return {
    effectivePrice,
    originalPrice: cheapest.promoPrice != null && cheapest.basePrice > cheapest.promoPrice ? cheapest.basePrice : null,
  };
}

interface GeoPoint {
  lat: number | null;
  lng: number | null;
}

function distanceFor(geo: CommonFilters['geo'], point: GeoPoint): number | null {
  if (!geo || point.lat == null || point.lng == null) return null;
  return roundDistanceKm(haversineKm(geo.lat, geo.lng, point.lat, point.lng));
}

/* ─────────────────────────── Produits (marketplace) ─────────────────────────── */

export interface MarketplaceOffer {
  storeId: string;
  storeName: string;
  storeSlug: string;
  city: string | null;
  region: string | null;
  /** Contact public de la boutique (déjà exposé sur la vitrine) pour WhatsApp. */
  storePhone: string | null;
  storeWhatsapp: string | null;
  variantId: string;
  variantName: string;
  /** Prix propre de la variante (null = prix produit appliqué), pour commander la bonne variante. */
  variantPrice: number | null;
  available: number;
  price: number;
  distanceKm: number | null;
}

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  packaging: string;
  format: string | null;
  category: { id: string; name: string } | null;
  price: number;
  originalPrice: number | null;
  available: number;
  offers: MarketplaceOffer[];
  minDistanceKm: number | null;
}

/** Découverte des produits publiés, en stock réel, dans des boutiques publiques. */
export async function discoverProducts(f: CommonFilters): Promise<Page<MarketplaceItem>> {
  const storeGeo = f.geo ? boundingBox(f.geo.lat, f.geo.lng, f.geo.radiusKm) : undefined;

  const storeWhere = {
    isPublic: true,
    isActive: true,
    ...(f.region ? { region: f.region } : {}),
    ...(f.city ? { city: f.city } : {}),
    ...(storeGeo
      ? {
          latitude: { gte: storeGeo.minLat, lte: storeGeo.maxLat },
          longitude: { gte: storeGeo.minLng, lte: storeGeo.maxLng },
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      marketplaceVisible: true,
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.search
        ? {
            OR: [
              { searchName: { contains: f.search } },
              // Repli honnête pour les lignes antérieures au backfill : nom brut,
              // insensible à la casse uniquement (documenté).
              { AND: [{ searchName: null }, { name: { contains: f.search } }] },
            ],
          }
        : {}),
      variants: {
        some: {
          isActive: true,
          inventories: { some: { quantity: { gt: 0 }, store: storeWhere } },
        },
      },
    },
    include: {
      category: { select: { id: true, name: true } },
      variants: {
        where: { isActive: true },
        include: {
          inventories: {
            where: { quantity: { gt: 0 }, store: storeWhere },
            include: {
              store: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  latitude: true,
                  longitude: true,
                  city: true,
                  region: true,
                  phone: true,
                  organization: { select: { whatsapp: true } },
                },
              },
            },
          },
        },
      },
    },
    // Tri SQL factuel et déterministe ; affiné en mémoire si proximité.
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: CANDIDATE_CAP,
  });

  const items: MarketplaceItem[] = [];
  for (const p of products) {
    const view = productPriceView(p);
    const offers: MarketplaceOffer[] = [];
    for (const v of p.variants) {
      const variantPrice = resolveUnitPrice({
        variantPrice: v.price,
        productPrice: p.price,
        productPromoPrice: p.promoPrice,
      }).effectivePrice;
      for (const inv of v.inventories) {
        const distanceKm = distanceFor(f.geo, { lat: inv.store.latitude, lng: inv.store.longitude });
        if (f.geo && (distanceKm == null || distanceKm > f.geo.radiusKm)) continue;
        offers.push({
          storeId: inv.store.id,
          storeName: inv.store.name,
          storeSlug: inv.store.slug,
          city: inv.store.city,
          region: inv.store.region,
          storePhone: inv.store.phone,
          storeWhatsapp: inv.store.organization?.whatsapp ?? null,
          variantId: v.id,
          variantName: v.name,
          variantPrice: v.price,
          available: inv.quantity,
          price: variantPrice,
          distanceKm,
        });
      }
    }
    if (offers.length === 0) continue;

    if (f.priceMin != null && view.effectivePrice < f.priceMin) continue;
    if (f.priceMax != null && view.effectivePrice > f.priceMax) continue;

    const available = offers.reduce((s, o) => s + o.available, 0);
    const distances = offers.map((o) => o.distanceKm).filter((d): d is number => d != null);
    items.push({
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
      available,
      offers,
      minDistanceKm: distances.length ? Math.min(...distances) : null,
    });
  }

  // TRI : distance réelle si proximité demandée, sinon récence (déjà ordonnée en SQL).
  if (f.geo) {
    items.sort((a, b) => {
      const da = a.minDistanceKm ?? Infinity;
      const db = b.minDistanceKm ?? Infinity;
      if (da !== db) return da - db;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  return paginate(items, f.page, f.pageSize);
}

/* ─────────────────────────── Annonces (listings) ─────────────────────────── */

export interface PublicListing {
  id: string;
  title: string;
  description: string | null;
  condition: string | null;
  fulfillment: string;
  city: string | null;
  region: string | null;
  price: number | null;
  available: number | null;
  hasImage: boolean;
  imageUrl: string | null;
  seller: { id: string; displayName: string; sellerType: string; city: string | null; region: string | null };
  product: { id: string; name: string } | null;
  variantName: string | null;
  store: { id: string; name: string; slug: string } | null;
  distanceKm: number | null;
}

/**
 * Découverte des annonces actives d'un vendeur actif. Une annonce commerçant
 * reste adossée au produit réel (prix via resolveUnitPrice, stock réel) ; une
 * annonce particulier conserve ses champs propres (prix/quantité de l'annonce).
 */
export async function discoverListings(f: CommonFilters): Promise<Page<PublicListing>> {
  const listings = await prisma.listing.findMany({
    where: {
      status: 'ACTIVE',
      seller: { status: 'ACTIVE', ...(f.sellerType ? { sellerType: f.sellerType } : {}) },
      ...(f.fulfillment ? { fulfillment: f.fulfillment } : {}),
      ...(f.region ? { region: f.region } : {}),
      ...(f.city ? { city: f.city } : {}),
      // Annonce commerçant : produit réel obligatoirement publié ET actif.
      // (Annonce particulier sans produit : conservée telle quelle.)
      OR: [
        { productId: null },
        { product: { is: { isActive: true, marketplaceVisible: true } } },
      ],
      AND: f.search
        ? [
            {
              OR: [
                { title: { contains: f.search } },
                { description: { contains: f.search } },
              ],
            },
          ]
        : undefined,
    },
    include: {
      seller: { select: { id: true, displayName: true, sellerType: true, city: true, region: true, status: true } },
      product: { select: { id: true, name: true, price: true, promoPrice: true, variants: { select: { id: true } } } },
      variant: { select: { id: true, name: true, price: true } },
      store: { select: { id: true, name: true, slug: true, latitude: true, longitude: true, city: true, region: true, isPublic: true, isActive: true } },
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
    take: CANDIDATE_CAP,
  });

  const items: PublicListing[] = [];
  for (const l of listings) {
    // Boutique renseignée : elle doit être publique ET active (sinon non exposée).
    if (l.store && (!l.store.isPublic || !l.store.isActive)) continue;

    let price: number | null;
    let available: number | null;
    if (l.product) {
      price = resolveUnitPrice({
        variantPrice: l.variant?.price ?? null,
        productPrice: l.product.price,
        productPromoPrice: l.product.promoPrice,
      }).effectivePrice;
      // Disponibilité = stock réel du variant dans la/les boutique(s) publique(s)
      // active(s). Une annonce adossée à une boutique précise reflète CETTE
      // boutique ; sinon, le stock public cumulé de la variante (celle de
      // l'annonce, ou la variante principale du produit). Jamais de stock inventé.
      const variantIds = l.variantId
        ? [l.variantId]
        : l.product.variants.map((v) => v.id);
      const inventories = variantIds.length
        ? await prisma.inventory.findMany({
            where: {
              variantId: { in: variantIds },
              quantity: { gt: 0 },
              ...(l.storeId ? { storeId: l.storeId } : { store: { isPublic: true, isActive: true } }),
            },
            select: { quantity: true },
          })
        : [];
      available = inventories.reduce((s, inv) => s + inv.quantity, 0);
      // Une annonce de commerçant exige une boutique publique active réelle.
      if (!l.storeId) continue;
      if (f.inStockOnly && available <= 0) continue;
    } else {
      price = l.price;
      available = l.quantity;
      if (f.inStockOnly && (available == null || available <= 0)) continue;
    }

    if (f.priceMin != null && (price == null || price < f.priceMin)) continue;
    if (f.priceMax != null && (price == null || price > f.priceMax)) continue;

    const point: GeoPoint = l.store
      ? { lat: l.store.latitude, lng: l.store.longitude }
      : { lat: null, lng: null };
    const distanceKm = distanceFor(f.geo, point);
    // Proximité demandée : une annonce sans point exploitable est exclue (jamais
    // de distance inventée).
    if (f.geo && (distanceKm == null || distanceKm > f.geo.radiusKm)) continue;

    items.push({
      id: l.id,
      title: l.title,
      description: l.description,
      condition: l.condition,
      fulfillment: l.fulfillment,
      city: l.city,
      region: l.region,
      price,
      available,
      hasImage: false,
      imageUrl: null,
      seller: {
        id: l.seller.id,
        displayName: l.seller.displayName,
        sellerType: l.seller.sellerType,
        city: l.seller.city,
        region: l.seller.region,
      },
      product: l.product ? { id: l.product.id, name: l.product.name } : null,
      variantName: l.variant?.name ?? null,
      store: l.store ? { id: l.store.id, name: l.store.name, slug: l.store.slug } : null,
      distanceKm,
    });
  }

  if (f.geo) {
    items.sort((a, b) => {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      if (da !== db) return da - db;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }

  return paginate(items, f.page, f.pageSize);
}

/* ─────────────────────────── Détail produit public (M4) ─────────────────────────── */

export interface PublicProductDetail {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  packaging: string;
  format: string | null;
  category: { id: string; name: string } | null;
  price: number;
  originalPrice: number | null;
  available: number;
  minDistanceKm: number | null;
  variants: Array<{
    id: string;
    name: string;
    price: number;
    basePrice: number;
    promoPrice: number | null;
    available: number;
  }>;
  offers: MarketplaceOffer[];
}

/**
 * Détail public d'un produit publié, avec ses offres réelles par boutique.
 * Réutilise la même découverte (une seule source de vérité : produits publiés,
 * en stock réel, dans des boutiques publiques actives). Aucune coordonnée GPS,
 * aucun prix d'achat, aucun SKU n'est exposé. Renvoie null si introuvable.
 */
export async function getPublicProduct(id: string, geo?: CommonFilters['geo']): Promise<PublicProductDetail | null> {
  // Bornage à la page 1/size max puis recherche de l'id : la découverte reste
  // l'unique voie, donc le détail ne peut pas exposer un produit non découvrable.
  const filters: CommonFilters = {
    search: '',
    inStockOnly: true,
    page: 1,
    pageSize: DISCOVERY_MAX_PAGE_SIZE,
    geo,
  };
  const page = await discoverProducts(filters);
  const item = page.items.find((i) => i.id === id);
  if (!item) return null;

  const product = await prisma.product.findFirst({
    where: { id, isActive: true, marketplaceVisible: true },
    include: {
      category: { select: { id: true, name: true } },
      variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!product) return null;

  const variants = product.variants.map((v) => {
    const res = resolveUnitPrice({ variantPrice: v.price, productPrice: product.price, productPromoPrice: product.promoPrice });
    const available = item.offers
      .filter((o) => o.variantId === v.id)
      .reduce((s, o) => s + o.available, 0);
    return {
      id: v.id,
      name: v.name,
      price: res.effectivePrice,
      basePrice: res.basePrice,
      promoPrice: res.promoPrice,
      available,
    };
  });

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl,
    hasImage: item.hasImage,
    packaging: item.packaging,
    format: item.format,
    category: item.category,
    price: item.price,
    originalPrice: item.originalPrice,
    available: item.available,
    minDistanceKm: item.minDistanceKm,
    variants,
    offers: item.offers,
  };
}

/* ─────────────────────────── Vendeur public ─────────────────────────── */
export interface PublicSeller {
  id: string;
  displayName: string;
  sellerType: string;
  bio: string | null;
  city: string | null;
  region: string | null;
  activeListings: number;
}

/** Profil vendeur public — champs strictement publics. Un vendeur suspendu = 404. */
export interface PublicSellerListing {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  quantity: number | null;
  condition: string | null;
  fulfillment: string;
  city: string | null;
  region: string | null;
  imageUrl: string | null;
}

export interface PublicSellerProfile extends PublicSeller {
  listings: PublicSellerListing[];
}

export async function getPublicSeller(id: string): Promise<PublicSellerProfile | null> {
  const seller = await prisma.sellerProfile.findFirst({
    where: { id, status: 'ACTIVE' },
    select: {
      id: true,
      displayName: true,
      sellerType: true,
      bio: true,
      city: true,
      region: true,
      listings: {
        where: { status: 'ACTIVE' },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
        take: 50,
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          quantity: true,
          condition: true,
          fulfillment: true,
          city: true,
          region: true,
          product: { select: { imageUrl: true } },
        },
      },
    },
  });
  if (!seller) return null;
  return {
    id: seller.id,
    displayName: seller.displayName,
    sellerType: seller.sellerType,
    bio: seller.bio,
    city: seller.city,
    region: seller.region,
    activeListings: seller.listings.length,
    listings: seller.listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      description: listing.description,
      price: listing.price,
      quantity: listing.quantity,
      condition: listing.condition,
      fulfillment: listing.fulfillment,
      city: listing.city,
      region: listing.region,
      imageUrl: listing.product?.imageUrl ?? null,
    })),
  };
}

/* ─────────────────────────── Facettes / catégories ─────────────────────────── */

export interface DiscoveryFacets {
  categories: Array<{ id: string; name: string; slug: string }>;
  regions: string[];
  cities: string[];
}

/**
 * Facettes réelles : catégories publiées, régions et villes des boutiques
 * publiques actives. Aucune valeur inventée — uniquement ce qui existe.
 */
export async function discoveryFacets(): Promise<DiscoveryFacets> {
  const [categories, stores] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true, products: { some: { isActive: true, marketplaceVisible: true } } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    }),
    prisma.store.findMany({
      where: {
        isPublic: true,
        isActive: true,
        inventories: { some: { quantity: { gt: 0 }, variant: { isActive: true, product: { isActive: true, marketplaceVisible: true } } } },
      },
      select: { region: true, city: true },
    }),
  ]);

  const regions = [...new Set(stores.map((s) => s.region).filter((r): r is string => Boolean(r)))].sort();
  const cities = [...new Set(stores.map((s) => s.city).filter((c): c is string => Boolean(c)))].sort();
  return { categories, regions, cities };
}
