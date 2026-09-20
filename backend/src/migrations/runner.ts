import db from '../lib/db';

/**
 * Framework de migrations versionnées GawJaay V2.
 *
 * Règles :
 * - Une migration = un fichier `versions/NNN_name.ts` exportant { name, up }.
 * - `up(db)` applique les changements (forward-only), documenté en tête de fichier.
 * - Aucune migration ne modifie destructivement une table V1.
 * - Le runner journalise dans `_migrations` et est idempotent (skip si déjà appliquée).
 * - Chaque migration s'exécute dans une transaction SQLite quand c'est possible.
 */
export interface Migration {
  name: string;
  up: (db: any) => void;
}

function ensureMigrationsTable(database: any) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      appliedAt TEXT NOT NULL
    );
  `);
}

export function runMigrations(database: any = db, migrations: Migration[] = []) {
  ensureMigrationsTable(database);
  const applied = new Set(
    (database.prepare('SELECT name FROM _migrations').all() as any[]).map((r) => r.name)
  );
  let count = 0;
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    const started = Date.now();
    database.exec('BEGIN');
    try {
      m.up(database);
      database
        .prepare('INSERT INTO _migrations (id, name, appliedAt) VALUES (?,?,?)')
        .run('m' + Date.now() + Math.random().toString(36).slice(2, 6), m.name, new Date().toISOString());
      database.exec('COMMIT');
      count++;
      console.log(`[migrations] appliquée: ${m.name} (${Date.now() - started}ms)`);
    } catch (e) {
      database.exec('ROLLBACK');
      console.error(`[migrations] ÉCHEC ${m.name}`, e);
      throw e;
    }
  }
  if (count === 0) console.log('[migrations] à jour');
  return count;
}

export function listApplied(database: any = db) {
  ensureMigrationsTable(database);
  return database.prepare('SELECT * FROM _migrations ORDER BY appliedAt').all();
}
