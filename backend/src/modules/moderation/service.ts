import db, { cuid } from '../../lib/db';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT A — Modération (ADMIN uniquement, via routes /admin).
 * Toute action écrit une ligne moderation_actions + audit_logs.
 */

function audit(userId: string, action: string, resource: string, resourceId: string, details?: any) {
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), userId, action, resource, resourceId, details ? JSON.stringify(details) : null, nowIso());
}

export function listReviews(filter: string = 'all') {
  let sql = `SELECT r.*, s.name as storeName, u.phone as clientPhone FROM reviews r
    LEFT JOIN stores s ON s.id = r.storeId
    LEFT JOIN users u ON u.id = r.clientId`;
  const params: any[] = [];
  if (filter === 'hidden') sql += ' WHERE r.isHidden = 1';
  else if (filter === 'reported') sql += ` WHERE EXISTS (SELECT 1 FROM review_reports rr WHERE rr.reviewId = r.id AND rr.status = 'OPEN')`;
  sql += ' ORDER BY r.createdAt DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map((r) => ({
    ...r,
    openReports: (db.prepare(`SELECT * FROM review_reports WHERE reviewId = ? AND status = 'OPEN'`).all(r.id) as any[]),
  }));
}

export function hideReview(adminUserId: string, reviewId: string, reason?: string) {
  const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as any;
  if (!r) throw Object.assign(new Error('Avis introuvable'), { status: 404 });
  db.prepare('UPDATE reviews SET isHidden = 1, moderatedBy = ?, moderatedAt = ?, updatedAt = ? WHERE id = ?').run(adminUserId, nowIso(), nowIso(), reviewId);
  db.prepare('INSERT INTO moderation_actions (id, reviewId, adminUserId, action, reason, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), reviewId, adminUserId, 'HIDE', reason || null, nowIso());
  audit(adminUserId, 'MODERATION_HIDE', 'Review', reviewId, { reason });
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
}

export function restoreReview(adminUserId: string, reviewId: string, reason?: string) {
  const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as any;
  if (!r) throw Object.assign(new Error('Avis introuvable'), { status: 404 });
  db.prepare('UPDATE reviews SET isHidden = 0, moderatedBy = ?, moderatedAt = ?, updatedAt = ? WHERE id = ?').run(adminUserId, nowIso(), nowIso(), reviewId);
  db.prepare('INSERT INTO moderation_actions (id, reviewId, adminUserId, action, reason, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), reviewId, adminUserId, 'RESTORE', reason || null, nowIso());
  audit(adminUserId, 'MODERATION_RESTORE', 'Review', reviewId, { reason });
  return db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
}

export function deleteReview(adminUserId: string, reviewId: string, reason?: string) {
  const r = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId) as any;
  if (!r) throw Object.assign(new Error('Avis introuvable'), { status: 404 });
  db.prepare('DELETE FROM reviews WHERE id = ?').run(reviewId);
  db.prepare('INSERT INTO moderation_actions (id, reviewId, adminUserId, action, reason, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), reviewId, adminUserId, 'DELETE', reason || null, nowIso());
  audit(adminUserId, 'MODERATION_DELETE', 'Review', reviewId, { reason });
}

export function listReports(status?: string) {
  let sql = `SELECT rr.*, r.rating, r.comment, r.isHidden, s.name as storeName FROM review_reports rr
    JOIN reviews r ON r.id = rr.reviewId
    LEFT JOIN stores s ON s.id = r.storeId`;
  const params: any[] = [];
  if (status) { sql += ' WHERE rr.status = ?'; params.push(status); }
  sql += ' ORDER BY rr.createdAt DESC LIMIT 200';
  return db.prepare(sql).all(...params) as any[];
}

/** Traite un signalement : HIDE / RESTORE / REJECT (rejeter = avis conforme). */
export function resolveReport(adminUserId: string, reportId: string, action: 'HIDE' | 'RESTORE' | 'REJECT', reason?: string) {
  const report = db.prepare('SELECT * FROM review_reports WHERE id = ?').get(reportId) as any;
  if (!report) throw Object.assign(new Error('Signalement introuvable'), { status: 404 });
  if (!['HIDE', 'RESTORE', 'REJECT'].includes(action)) throw Object.assign(new Error('Action invalide'), { status: 400 });

  if (action === 'HIDE') hideReview(adminUserId, report.reviewId, reason);
  else if (action === 'RESTORE') restoreReview(adminUserId, report.reviewId, reason);

  db.prepare('UPDATE review_reports SET status = ?, handledBy = ?, handledAt = ? WHERE id = ?')
    .run('RESOLVED', adminUserId, nowIso(), reportId);
  db.prepare('INSERT INTO moderation_actions (id, reviewId, reportId, adminUserId, action, reason, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), report.reviewId, reportId, adminUserId, `REPORT_${action}`, reason || null, nowIso());
  audit(adminUserId, 'MODERATION_REPORT_RESOLVE', 'ReviewReport', reportId, { action, reason });
  return db.prepare('SELECT * FROM review_reports WHERE id = ?').get(reportId);
}

export function listActions() {
  return db.prepare('SELECT * FROM moderation_actions ORDER BY createdAt DESC LIMIT 200').all();
}
