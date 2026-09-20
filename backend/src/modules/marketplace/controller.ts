import { Request, Response, NextFunction } from 'express';
import * as service from './service';

export async function searchProductsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { q, category, lat, lng, radiusKm, take } = req.query;
    const results = await service.searchProducts(q as string, {
      category: category as string,
      lat: lat ? parseFloat(lat as string) : undefined,
      lng: lng ? parseFloat(lng as string) : undefined,
      radiusKm: radiusKm ? parseFloat(radiusKm as string) : undefined,
      take: take ? parseInt(take as string) : 50,
    });
    res.json(results);
  } catch (e) { next(e); }
}
export async function searchStoresHandler(req: Request, res: Response, next: NextFunction) {
  try { const results = await service.searchStores(req.query.q as string); res.json(results); } catch (e) { next(e); }
}
export async function nearbyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { lat, lng, radiusKm } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat lng requis' });
    const results = await service.nearbyStores(parseFloat(lat as string), parseFloat(lng as string), radiusKm ? parseFloat(radiusKm as string) : 10);
    res.json(results);
  } catch (e) { next(e); }
}
