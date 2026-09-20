import { Request, Response, NextFunction } from 'express';
import * as service from './service';
import { parseGeoQuery } from '../../lib/geo';

function str(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s.slice(0, 120) : undefined;
}

/**
 * GET /marketplace/products
 * q, category, minPrice, maxPrice, promo, inStock, store, region, department, commune, sort,
 * lat, lng, radiusKm, take — TOUS transmis au service (le contrôleur V2 en ignorait la moitié).
 */
export async function searchProductsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const geo = parseGeoQuery(req.query);
    const results = await service.searchProducts(str(req.query.q) || '', {
      category: str(req.query.category),
      minPrice: str(req.query.minPrice),
      maxPrice: str(req.query.maxPrice),
      promo: str(req.query.promo),
      inStock: str(req.query.inStock),
      store: str(req.query.store),
      region: str(req.query.region),
      department: str(req.query.department),
      commune: str(req.query.commune),
      sort: str(req.query.sort),
      take: req.query.take ? Number(req.query.take) : undefined,
      ...(geo ? { lat: geo.lat, lng: geo.lng, radiusKm: geo.radiusKm } : {}),
    });
    res.json(results);
  } catch (e) { next(e); }
}

/** GET /marketplace/stores — q, category, region, department, commune, lat/lng/radiusKm, take. */
export async function searchStoresHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const geo = parseGeoQuery(req.query);
    const results = await service.searchStores(str(req.query.q) || '', {
      category: str(req.query.category),
      region: str(req.query.region),
      department: str(req.query.department),
      commune: str(req.query.commune),
      take: req.query.take ? Number(req.query.take) : undefined,
      ...(geo ? { lat: geo.lat, lng: geo.lng, radiusKm: geo.radiusKm } : {}),
    });
    res.json(results);
  } catch (e) { next(e); }
}

/** GET /marketplace/nearby?lat&lng&radiusKm — boutiques autour d'un point (Haversine réel). */
export async function nearbyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const geo = parseGeoQuery(req.query);
    if (!geo) return res.status(400).json({ error: 'lat lng requis' });
    const results = await service.nearbyStores(geo.lat, geo.lng, geo.radiusKm, req.query.take ? Number(req.query.take) : undefined);
    res.json(results);
  } catch (e) { next(e); }
}
