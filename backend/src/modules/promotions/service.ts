import db, { cuid } from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';
import { AuthRequest } from '../../middlewares/auth';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT A — Promotions.
 *
 * RÈGLE ABSOLUE : le serveur calcule toujours le prix final.
 * Le frontend ne peut jamais imposer un prix promotionnel.
 * Le prix original reste traçable (unitPrice d'origine conservé sur les lignes).
 */

export interface PromoLine {
  productId: string;
  quantity: number;
  unitPriceOriginal: number;
  unitPriceFinal: number;
  promotionId: string | null;
  discountAmount: number;
}

function isActiveNow(p: any, at: Date = new Date()): boolean {
  if (p.status !== 'ACTIVE') return false;
  if (new Date(p.dateStart) > at) return false;
  if (p.dateEnd && new Date(p.dateEnd) < at) return false;
  return true;
}

/** Promotions actives (fenêtre de temps + statut) d'une boutique. */
export function activePromotionsForStore(storeId: string, at: Date = new Date()) {
  const rows = db.prepare(`SELECT * FROM promotions WHERE storeId = ? AND status = 'ACTIVE' ORDER BY createdAt DESC`).all(storeId) as any[];
  return rows.filter((p) => isActiveNow(p, at));
}

/** Promotions actives applicables à un produit précis (périmètre produit ou boutique). */
export function activePromotionsForProduct(storeId: string, productId: string, at: Date = new Date()) {
  const all = activePromotionsForStore(storeId, at);
  return all.filter((p: any) => {
    const scoped = db.prepare('SELECT productId FROM promotion_products WHERE promotionId = ?').all(p.id) as any[];
    if (!scoped.length) return true; // toute la boutique
    return scoped.some((r) => r.productId === productId);
  });
}

/**
 * Calcule le meilleur prix promotionnel serveur pour une ligne.
 * Une promotion expirée/pause/épuisée ne peut JAMAIS être appliquée.
 */
export function computeLinePromotion(product: any, quantity: number, promotions: any[]): PromoLine {
  const base = product.price;
  let best: PromoLine = {
    productId: product.id,
    quantity,
    unitPriceOriginal: base,
    unitPriceFinal: base,
    promotionId: null,
    discountAmount: 0,
  };
  for (const p of promotions) {
    const minQty = p.minQty ?? 1;
    const maxQty = p.maxQty ?? Infinity;
    if (quantity < minQty || quantity > maxQty) continue;
    if (p.maxUses != null && p.usesCount >= p.maxUses) continue;
    if (p.quantityAvailable != null && p.quantityAvailable <= 0) continue;

    let final = base;
    if (p.type === 'PERCENT') final = Math.round(base * (1 - Math.min(Math.max(p.value, 0), 100) / 100));
    else if (p.type === 'FIXED') final = Math.max(0, base - p.value);
    else if (p.type === 'PROMO_PRICE') final = Math.min(base, p.value);

    if (final < best.unitPriceFinal) {
      best = {
        productId: product.id,
        quantity,
        unitPriceOriginal: base,
        unitPriceFinal: final,
        promotionId: p.id,
        discountAmount: (base - final) * quantity,
      };
    }
  }
  return best;
}

/** Applique les promotions actives à un panier complet (source de vérité serveur). */
export function applyPromotions(storeId: string, items: { productId: string; quantity: number }[]): { lines: PromoLine[]; totalDiscount: number; promotionIds: string[] } {
  const lines: PromoLine[] = [];
  const promotionIds: string[] = [];
  for (const it of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND storeId = ?').get(it.productId, storeId) as any;
    if (!product) throw Object.assign(new Error(`Produit ${it.productId} introuvable`), { status: 404 });
    // périmètre : promotions actives applicables à CE produit uniquement
    const scoped = activePromotionsForProduct(storeId, it.productId);
    const line = computeLinePromotion(product, it.quantity, scoped);
    if (line.promotionId) promotionIds.push(line.promotionId);
    lines.push(line);
  }
  return { lines, totalDiscount: lines.reduce((s, l) => s + l.discountAmount, 0), promotionIds };
}

/**
 * Consomme atomiquement une promotion (anti-course : garde WHERE sur compteurs).
 * Retourne false si la promotion vient d'être épuisée.
 */
export function consumePromotion(promotionId: string): boolean {
  const r = db.prepare(`
    UPDATE promotions SET usesCount = usesCount + 1,
      quantityAvailable = CASE WHEN quantityAvailable IS NULL THEN NULL ELSE quantityAvailable - 1 END,
      updatedAt = ?
    WHERE id = ? AND status = 'ACTIVE'
      AND (maxUses IS NULL OR usesCount < maxUses)
      AND (quantityAvailable IS NULL OR quantityAvailable > 0)
  `).run(nowIso(), promotionId);
  return r.changes > 0;
}

/** Restitue une promotion (annulation de commande). */
export function releasePromotion(promotionId: string): void {
  db.prepare(`
    UPDATE promotions SET usesCount = MAX(usesCount - 1, 0),
      quantityAvailable = CASE WHEN quantityAvailable IS NULL THEN NULL ELSE quantityAvailable + 1 END,
      updatedAt = ?
    WHERE id = ?
  `).run(nowIso(), promotionId);
}

function assertAdmin(req: AuthRequest) {
  if (req.user?.role !== 'ADMIN') return;
}

// ---------- CRUD (côté commerçant) ----------

export async function createPromotion(user: any, data: any) {
  assertStoreAccess(data.storeId, user);
  if (!['PERCENT', 'FIXED', 'PROMO_PRICE'].includes(data.type)) throw Object.assign(new Error('Type de promotion invalide'), { status: 400 });
  const value = Number(data.value);
  if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error('Valeur invalide'), { status: 400 });
  if (data.type === 'PERCENT' && value > 100) throw Object.assign(new Error('Pourcentage > 100'), { status: 400 });
  if (data.dateEnd && data.dateEnd < data.dateStart) throw Object.assign(new Error('dateEnd avant dateStart'), { status: 400 });
  if (data.maxQty != null && data.minQty != null && data.maxQty < data.minQty) throw Object.assign(new Error('maxQty < minQty'), { status: 400 });

  const id = cuid();
  db.prepare(`INSERT INTO promotions (id, storeId, merchantId, name, description, type, value, dateStart, dateEnd, minQty, maxQty, maxUses, quantityAvailable, status, createdById, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, data.storeId, user.merchantId, data.name, data.description || null, data.type, value,
      data.dateStart, data.dateEnd || null, data.minQty ?? 1, data.maxQty ?? null,
      data.maxUses ?? null, data.quantityAvailable ?? null, data.status === 'PAUSED' ? 'PAUSED' : 'ACTIVE',
      user.userId, nowIso(), nowIso());

  for (const pid of data.productIds || []) {
    const prod = db.prepare('SELECT id FROM products WHERE id = ? AND storeId = ?').get(pid, data.storeId);
    if (!prod) throw Object.assign(new Error(`Produit ${pid} hors boutique`), { status: 400 });
    db.prepare('INSERT INTO promotion_products (id, promotionId, productId) VALUES (?,?,?)').run(cuid(), id, pid);
  }

  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'PROMOTION_CREATE', 'Promotion', id, JSON.stringify({ storeId: data.storeId, type: data.type, value }), nowIso());
  return getPromotion(id, user);
}

export async function updatePromotion(id: string, user: any, data: any) {
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) as any;
  if (!promo) throw Object.assign(new Error('Promotion introuvable'), { status: 404 });
  assertStoreAccess(promo.storeId, user);
  const map: any = { name: 'name', description: 'description', value: 'value', dateStart: 'dateStart', dateEnd: 'dateEnd', minQty: 'minQty', maxQty: 'maxQty', maxUses: 'maxUses', quantityAvailable: 'quantityAvailable', status: 'status' };
  const fields: string[] = [];
  const values: any[] = [];
  for (const k in map) {
    if (data[k] !== undefined) { fields.push(`${map[k]} = ?`); values.push(data[k]); }
  }
  if (fields.length) {
    fields.push('updatedAt = ?'); values.push(nowIso()); values.push(id);
    db.prepare(`UPDATE promotions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  if (data.productIds !== undefined) {
    db.prepare('DELETE FROM promotion_products WHERE promotionId = ?').run(id);
    for (const pid of data.productIds) {
      const prod = db.prepare('SELECT id FROM products WHERE id = ? AND storeId = ?').get(pid, promo.storeId);
      if (!prod) throw Object.assign(new Error(`Produit ${pid} hors boutique`), { status: 400 });
      db.prepare('INSERT INTO promotion_products (id, promotionId, productId) VALUES (?,?,?)').run(cuid(), id, pid);
    }
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'PROMOTION_UPDATE', 'Promotion', id, nowIso());
  return getPromotion(id, user);
}

export async function deletePromotion(id: string, user: any) {
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) as any;
  if (!promo) throw Object.assign(new Error('Promotion introuvable'), { status: 404 });
  assertStoreAccess(promo.storeId, user);
  db.prepare('DELETE FROM promotions WHERE id = ?').run(id);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'PROMOTION_DELETE', 'Promotion', id, nowIso());
}

export async function getPromotion(id: string, user?: any) {
  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) as any;
  if (!promo) throw Object.assign(new Error('Promotion introuvable'), { status: 404 });
  if (user) assertStoreAccess(promo.storeId, user);
  const productIds = (db.prepare('SELECT productId FROM promotion_products WHERE promotionId = ?').all(id) as any[]).map((r) => r.productId);
  return { ...promo, productIds };
}

export async function listPromotions(storeId: string, user: any) {
  assertStoreAccess(storeId, user);
  const rows = db.prepare('SELECT * FROM promotions WHERE storeId = ? ORDER BY createdAt DESC').all(storeId) as any[];
  return rows.map((p) => ({
    ...p,
    expired: p.dateEnd ? new Date(p.dateEnd) < new Date() : false,
    productIds: (db.prepare('SELECT productId FROM promotion_products WHERE promotionId = ?').all(p.id) as any[]).map((r) => r.productId),
  }));
}

/** Liste publique des promotions actives d'une boutique (vitrine client). */
export function publicActivePromotions(storeId: string) {
  const now = new Date().toISOString();
  const rows = db.prepare(`SELECT id, storeId, name, description, type, value, dateEnd, minQty, maxQty FROM promotions WHERE storeId = ? AND status = 'ACTIVE' AND dateStart <= ? AND (dateEnd IS NULL OR dateEnd >= ?)`).all(storeId, now, now) as any[];
  return rows.filter((p) => p.maxUses == null || p.usesCount < p.maxUses)
    .filter((p) => p.quantityAvailable == null || p.quantityAvailable > 0)
    .map((p) => ({
      ...p,
      productIds: (db.prepare('SELECT productId FROM promotion_products WHERE promotionId = ?').all(p.id) as any[]).map((r) => r.productId),
    }));
}

export { assertAdmin };
