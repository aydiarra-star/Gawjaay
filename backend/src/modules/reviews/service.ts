import db, { cuid } from '../../lib/db';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT A — Avis vérifiés.
 *
 * Règles :
 * - Un avis n'est possible QUE pour une commande réellement terminée (LIVREE).
 * - Un seul avis par commande et par cible (index UNIQUE).
 * - isVerified = 1 systématiquement (preuve de commande).
 * - Un avis signalé (report OPEN) n'apparaît plus publiquement.
 * - Aucune modification de note après publication (anti-fraude).
 */

export async function createReview(user: any, data: { orderId: string; targetType: 'STORE' | 'PRODUCT'; targetId?: string; rating: number; comment?: string }) {
  if (user.role !== 'CLIENT') throw Object.assign(new Error('Seul un client peut laisser un avis'), { status: 403 });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(data.orderId) as any;
  if (!order) throw Object.assign(new Error('Commande introuvable'), { status: 404 });
  if (order.clientId !== user.userId) throw Object.assign(new Error('Accès refusé'), { status: 403 });
  if (order.status !== 'LIVREE') throw Object.assign(new Error('Avis possible uniquement après une commande livrée'), { status: 400 });

  const rating = Number(data.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error('Note invalide (1 à 5)'), { status: 400 });

  let targetId = data.targetId || order.storeId;
  if (data.targetType === 'PRODUCT') {
    if (!data.targetId) throw Object.assign(new Error('Produit cible requis'), { status: 400 });
    const item = db.prepare('SELECT id FROM order_items WHERE orderId = ? AND productId = ?').get(order.id, data.targetId);
    if (!item) throw Object.assign(new Error('Ce produit ne fait pas partie de la commande'), { status: 400 });
    targetId = data.targetId;
  } else {
    targetId = order.storeId; // avis boutique = la boutique de la commande
  }

  const existing = db.prepare('SELECT id FROM reviews WHERE orderId = ? AND targetType = ? AND targetId = ?')
    .get(order.id, data.targetType, targetId);
  if (existing) throw Object.assign(new Error('Avis déjà déposé pour cette commande'), { status: 400 });

  const id = cuid();
  db.prepare(`INSERT INTO reviews (id, orderId, storeId, clientId, rating, comment, isVerified, targetType, targetId, isHidden, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,1,?,?,0,?,?)`)
    .run(id, order.id, order.storeId, user.userId, rating, data.comment || null, data.targetType, targetId, nowIso(), nowIso());

  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
}

/** Avis publics d'une boutique (exclut masqués et signalés en attente). */
export function listForStore(storeId: string) {
  const rows = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.createdAt, r.targetType, u.phone as clientPhoneMasked
    FROM reviews r
    LEFT JOIN users u ON u.id = r.clientId
    WHERE r.storeId = ? AND r.targetType = 'STORE' AND r.isHidden = 0
      AND NOT EXISTS (SELECT 1 FROM review_reports rr WHERE rr.reviewId = r.id AND rr.status = 'OPEN')
    ORDER BY r.createdAt DESC LIMIT 100`).all(storeId) as any[];
  const agg = db.prepare(`
    SELECT COUNT(*) as count, AVG(rating) as average FROM reviews r
    WHERE r.storeId = ? AND r.targetType = 'STORE' AND r.isHidden = 0
      AND NOT EXISTS (SELECT 1 FROM review_reports rr WHERE rr.reviewId = r.id AND rr.status = 'OPEN')`).get(storeId) as any;
  return { reviews: rows.map(maskContact), stats: { count: agg.count, average: agg.average ? Math.round(agg.average * 10) / 10 : null } };
}

/** Avis publics d'un produit. */
export function listForProduct(productId: string) {
  const rows = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.createdAt FROM reviews r
    WHERE r.targetType = 'PRODUCT' AND r.targetId = ? AND r.isHidden = 0
      AND NOT EXISTS (SELECT 1 FROM review_reports rr WHERE rr.reviewId = r.id AND rr.status = 'OPEN')
    ORDER BY r.createdAt DESC LIMIT 100`).all(productId) as any[];
  const agg = db.prepare(`
    SELECT COUNT(*) as count, AVG(rating) as average FROM reviews r
    WHERE r.targetType = 'PRODUCT' AND r.targetId = ? AND r.isHidden = 0
      AND NOT EXISTS (SELECT 1 FROM review_reports rr WHERE rr.reviewId = r.id AND rr.status = 'OPEN')`).get(productId) as any;
  return { reviews: rows, stats: { count: agg.count, average: agg.average ? Math.round(agg.average * 10) / 10 : null } };
}

export function myReviews(user: any) {
  return db.prepare(`SELECT r.*, s.name as storeName, p.name as productName FROM reviews r
    LEFT JOIN stores s ON s.id = r.storeId
    LEFT JOIN products p ON p.id = r.targetId AND r.targetType = 'PRODUCT'
    WHERE r.clientId = ? ORDER BY r.createdAt DESC`).all(user.userId) as any[];
}

export function reportReview(user: any, reviewId: string, reason: string, details?: string) {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as any;
  if (!review) throw Object.assign(new Error('Avis introuvable'), { status: 404 });
  const open = db.prepare(`SELECT id FROM review_reports WHERE reviewId = ? AND status = 'OPEN' AND reportedByUserId = ?`).get(reviewId, user.userId);
  if (open) throw Object.assign(new Error('Signalement déjà en cours'), { status: 400 });
  const id = cuid();
  db.prepare(`INSERT INTO review_reports (id, reviewId, reportedByUserId, reason, details, status, createdAt) VALUES (?,?,?,?,?,'OPEN',?)`)
    .run(id, reviewId, user.userId, reason, details || null, nowIso());
  return db.prepare('SELECT * FROM review_reports WHERE id = ?').get(id);
}

function maskContact(r: any) {
  return { ...r, clientPhoneMasked: r.clientPhoneMasked ? r.clientPhoneMasked.slice(0, 5) + '***' : null };
}
