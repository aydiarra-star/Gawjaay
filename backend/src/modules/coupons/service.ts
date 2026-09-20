import db, { cuid } from '../../lib/db';
import { assertStoreAccess } from '../../middlewares/tenant';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT A — Coupons.
 *
 * Protection : code unique par boutique, validation serveur systématique,
 * anti-double utilisation (UNIQUE couponId+référence + compteur atomique),
 * historique complet (coupon_redemptions).
 */

export async function createCoupon(user: any, data: any) {
  assertStoreAccess(data.storeId, user);
  if (!['PERCENT', 'FIXED'].includes(data.type)) throw Object.assign(new Error('Type de coupon invalide'), { status: 400 });
  const value = Number(data.value);
  if (!Number.isFinite(value) || value <= 0) throw Object.assign(new Error('Valeur invalide'), { status: 400 });
  if (data.type === 'PERCENT' && value > 100) throw Object.assign(new Error('Pourcentage > 100'), { status: 400 });
  const code = String(data.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw Object.assign(new Error('Code invalide (3-40 caractères A-Z 0-9)'), { status: 400 });
  if (data.dateEnd && data.dateEnd < data.dateStart) throw Object.assign(new Error('dateEnd avant dateStart'), { status: 400 });

  const exists = db.prepare('SELECT id FROM coupons WHERE storeId = ? AND code = ?').get(data.storeId, code);
  if (exists) throw Object.assign(new Error('Code déjà utilisé pour cette boutique'), { status: 400 });

  const id = cuid();
  db.prepare(`INSERT INTO coupons (id, storeId, merchantId, code, type, value, dateStart, dateEnd, maxUses, perClientLimit, minOrderAmount, productId, isActive, createdById, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, data.storeId, user.merchantId, code, data.type, value, data.dateStart || nowIso(), data.dateEnd || null,
      data.maxUses ?? null, data.perClientLimit ?? 1, data.minOrderAmount ?? 0, data.productId || null,
      data.isActive === false ? 0 : 1, user.userId, nowIso(), nowIso());

  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'COUPON_CREATE', 'Coupon', id, JSON.stringify({ storeId: data.storeId, code, type: data.type }), nowIso());
  return getCoupon(id, user);
}

export async function updateCoupon(id: string, user: any, data: any) {
  const coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id) as any;
  if (!coupon) throw Object.assign(new Error('Coupon introuvable'), { status: 404 });
  assertStoreAccess(coupon.storeId, user);
  const fields: string[] = [];
  const values: any[] = [];
  for (const k of ['value', 'dateStart', 'dateEnd', 'maxUses', 'perClientLimit', 'minOrderAmount', 'isActive']) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(k === 'isActive' ? (data[k] ? 1 : 0) : data[k]);
    }
  }
  if (fields.length) {
    fields.push('updatedAt = ?'); values.push(nowIso()); values.push(id);
    db.prepare(`UPDATE coupons SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'COUPON_UPDATE', 'Coupon', id, nowIso());
  return getCoupon(id, user);
}

export async function listCoupons(storeId: string, user: any) {
  assertStoreAccess(storeId, user);
  return db.prepare('SELECT * FROM coupons WHERE storeId = ? ORDER BY createdAt DESC').all(storeId) as any[];
}

export async function getCoupon(id: string, user?: any) {
  const coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id) as any;
  if (!coupon) throw Object.assign(new Error('Coupon introuvable'), { status: 404 });
  if (user) assertStoreAccess(coupon.storeId, user);
  const redemptions = db.prepare('SELECT COUNT(*) as cnt FROM coupon_redemptions WHERE couponId = ?').get(id) as any;
  return { ...coupon, redemptionCount: redemptions.cnt };
}

export interface CouponCheck {
  ok: boolean;
  coupon?: any;
  discount?: number;
  reason?: string;
}

/** Validation serveur pure (sans effet de bord) — utilisée au checkout et côté POS. */
export function validateCoupon(storeId: string, code: string, opts: { subtotal: number; clientId?: string; productId?: string }): CouponCheck {
  const norm = String(code || '').trim().toUpperCase();
  const coupon = db.prepare('SELECT * FROM coupons WHERE storeId = ? AND code = ?').get(storeId, norm) as any;
  if (!coupon || !coupon.isActive) return { ok: false, reason: 'Coupon invalide' };
  const now = new Date();
  if (new Date(coupon.dateStart) > now) return { ok: false, reason: 'Coupon pas encore actif' };
  if (coupon.dateEnd && new Date(coupon.dateEnd) < now) return { ok: false, reason: 'Coupon expiré' };
  if (coupon.maxUses != null && coupon.usesCount >= coupon.maxUses) return { ok: false, reason: 'Coupon épuisé' };
  if (coupon.minOrderAmount && opts.subtotal < coupon.minOrderAmount) return { ok: false, reason: `Montant minimum ${coupon.minOrderAmount} FCFA` };
  if (coupon.productId && opts.productId && coupon.productId !== opts.productId) return { ok: false, reason: 'Coupon non applicable à ce produit' };
  if (coupon.productId && !opts.productId) {
    // le coupon est limité à un produit : vérifier que le panier le contient
    const inCart = db.prepare('SELECT id FROM products WHERE id = ? AND storeId = ?').get(coupon.productId, storeId);
    if (!inCart) return { ok: false, reason: 'Coupon non applicable à ce panier' };
  }
  if (opts.clientId && coupon.perClientLimit != null) {
    const used = db.prepare('SELECT COUNT(*) as cnt FROM coupon_redemptions WHERE couponId = ? AND clientId = ?').get(coupon.id, opts.clientId) as any;
    if (used.cnt >= (coupon.perClientLimit || 1)) return { ok: false, reason: 'Coupon déjà utilisé (limite par client)' };
  }
  let discount = coupon.type === 'PERCENT'
    ? Math.round(opts.subtotal * (Math.min(coupon.value, 100) / 100))
    : Math.min(coupon.value, opts.subtotal);
  discount = Math.max(0, discount);
  return { ok: true, coupon, discount };
}

/**
 * Consomme atomiquement un coupon (vente ou confirmation de commande).
 * Atomicité : UPDATE gardé sur compteur + INSERT avec UNIQUE(couponId, référence).
 */
export function consumeCoupon(couponId: string, referenceId: string, storeId: string, clientId: string | null, discountAmount: number): void {
  const upd = db.prepare(`UPDATE coupons SET usesCount = usesCount + 1, updatedAt = ?
    WHERE id = ? AND isActive = 1 AND (maxUses IS NULL OR usesCount < maxUses)`).run(nowIso(), couponId);
  if (upd.changes === 0) throw Object.assign(new Error('Coupon épuisé'), { status: 400 });
  try {
    db.prepare('INSERT INTO coupon_redemptions (id, couponId, orderId, storeId, clientId, discountAmount, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), couponId, referenceId, storeId, clientId, discountAmount, nowIso());
  } catch (e: any) {
    // rollback compteur si double utilisation détectée par l'index unique
    db.prepare('UPDATE coupons SET usesCount = MAX(usesCount - 1, 0) WHERE id = ?').run(couponId);
    throw Object.assign(new Error('Coupon déjà utilisé pour cette commande'), { status: 400 });
  }
}

/** Restitue un coupon (annulation de commande). */
export function releaseCoupon(couponId: string, referenceId: string): void {
  const del = db.prepare('DELETE FROM coupon_redemptions WHERE couponId = ? AND orderId = ?').run(couponId, referenceId);
  if (del.changes > 0) {
    db.prepare('UPDATE coupons SET usesCount = MAX(usesCount - 1, 0), updatedAt = ? WHERE id = ?').run(nowIso(), couponId);
  }
}

export function redemptionsForCoupon(couponId: string, user: any) {
  const coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(couponId) as any;
  if (!coupon) throw Object.assign(new Error('Coupon introuvable'), { status: 404 });
  assertStoreAccess(coupon.storeId, user);
  return db.prepare(`SELECT cr.*, o.orderNumber FROM coupon_redemptions cr
    LEFT JOIN orders o ON o.id = cr.orderId
    WHERE cr.couponId = ? ORDER BY cr.createdAt DESC`).all(couponId) as any[];
}
