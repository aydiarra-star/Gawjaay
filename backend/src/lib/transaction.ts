import db from './db';

/**
 * Transactions SQL synchrones (V3 — durcissement §11 / BACKLOG_V3 §7).
 *
 * L'accès base est SYNCHRONE et sérialisé (node:sqlite `DatabaseSync`, ou worker `pg` à connexion
 * unique) : un bloc `withTransaction(fn)` dont `fn` est **synchrone** (aucun `await`) s'exécute donc
 * d'un seul tenant sur la même session — BEGIN … COMMIT sont réellement atomiques, et aucune autre
 * requête HTTP ne peut s'intercaler (pas de cession de la boucle d'événements).
 *
 * Règles :
 * - `fn` doit être synchrone. Toute erreur → ROLLBACK puis relance (les erreurs métier 4xx conservent
 *   leur `status`).
 * - Imbrication tolérée : seule la transaction la plus externe émet BEGIN/COMMIT/ROLLBACK
 *   (SQLite refuse un BEGIN imbriqué ; PostgreSQL n'émettrait qu'un avertissement).
 * - Les effets de bord non SQL (notifications externes, e-mails) doivent rester HORS transaction.
 */
let depth = 0;

export function withTransaction<T>(fn: () => T, database: any = db): T {
  if (depth > 0) {
    // déjà dans une transaction : on participe à la transaction externe
    depth++;
    try {
      return fn();
    } finally {
      depth--;
    }
  }
  depth++;
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (e) {
    try {
      database.exec('ROLLBACK');
    } catch {
      /* connexion déjà hors transaction */
    }
    throw e;
  } finally {
    depth--;
  }
}

/** Vrai si une transaction ouverte par `withTransaction` est en cours (tests / diagnostics). */
export function inTransaction(): boolean {
  return depth > 0;
}
