import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import * as b2b from '../b2b/service';

/**
 * LOT D — Réapprovisionnement : suggestions basées sur les données réelles.
 * La quantité finale est TOUJOURS validée par le commerçant (corps de la requête).
 */
export async function suggestionsHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try { res.json(b2b.suggestions(req.user!, req.params.storeId)); } catch (e) { next(e); }
}

export async function createOrderHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { catalogId, items, notes } = req.body;
    if (!catalogId || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'catalogId et items requis (quantités validées par le commerçant)' });
    }
    res.status(201).json(await b2b.createOrder(req.user!, { catalogId, buyerStoreId: req.params.storeId, items, notes, send: true }));
  } catch (e) { next(e); }
}
