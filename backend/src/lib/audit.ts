import db, { cuid } from './db';

/**
 * Journal d'audit (PROJECT_RULES §2) — écriture SQL synchrone, donc incluse dans une éventuelle
 * transaction en cours (`withTransaction`) : un audit n'est jamais conservé pour une action annulée.
 *
 * `userId` est vérifié (clé étrangère vers users) : un identifiant technique inconnu (contexte SYSTEM,
 * tests unitaires) est journalisé à NULL plutôt que de faire échouer l'opération métier.
 */
export function recordAudit(userId: string | null | undefined, action: string, resource: string, resourceId: string | null, details?: unknown, ip?: string | null) {
  let uid: string | null = null;
  if (userId) {
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any;
    uid = u ? u.id : null;
  }
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, ip, createdAt) VALUES (?,?,?,?,?,?,?,?)')
    .run(cuid(), uid, action, resource, resourceId, details === undefined ? null : JSON.stringify(details), ip || null, new Date().toISOString());
}
