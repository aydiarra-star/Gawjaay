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

/**
 * Journal EXTERNE du chemin « déploiement » (`deploy/postgres/*.sql`).
 *
 * Les fichiers SQL de `deploy/postgres/` journalisent leurs applications dans `schema_migrations`
 * sous leur nom de fichier (`001_lot_a.sql`), alors que le runner applicatif utilise `_migrations`.
 * Si un exploitant applique les fichiers SQL puis démarre l'API, le runner ne verrait aucune
 * migration appliquée et rejouerait `ALTER TABLE reviews ADD COLUMN targetType` → **échec au
 * démarrage** (`column "targetType" of relation "reviews" already exists`), car `ADD COLUMN` n'est
 * pas idempotent (l'idempotence est portée par le journal, pas par la migration).
 *
 * Correctif : le runner DÉTECTE ce journal externe et adopte les migrations qu'il déclare comme
 * déjà appliquées, puis les recopie dans `_migrations` (une seule source de vérité ensuite).
 * Aucun changement pour le cas nominal (journal `_migrations` seul, SQLite comme PostgreSQL).
 */
const EXTERNAL_JOURNAL = 'schema_migrations';

/** Préfixe technique d'une migration : `001_lot_a_promotions…` → `001_lot_a`. */
function migrationPrefix(name: string): string {
  const m = name.match(/^(\d+_[a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : name.toLowerCase();
}

/** Lit le journal externe s'il existe (retourne [] sinon, sans jamais lever d'exception). */
function readExternalJournal(database: any): string[] {
  try {
    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(EXTERNAL_JOURNAL) as any;
    if (!table) return [];
    const rows = database.prepare(`SELECT name FROM ${EXTERNAL_JOURNAL}`).all() as any[];
    return rows.map((r) => String(r.name));
  } catch {
    return [];
  }
}

export function runMigrations(database: any = db, migrations: Migration[] = []) {
  ensureMigrationsTable(database);
  const applied = new Set(
    (database.prepare('SELECT name FROM _migrations').all() as any[]).map((r) => r.name)
  );

  // Adoption du journal de déploiement (voir EXTERNAL_JOURNAL) : sécurise le démarrage sur une
  // base dont le schéma a été créé par `deploy/postgres/*.sql`.
  const external = readExternalJournal(database);
  const adopted: Migration[] = [];
  if (external.length) {
    const externalPrefixes = new Set(external.map(migrationPrefix));
    for (const m of migrations) {
      if (applied.has(m.name)) continue;
      if (externalPrefixes.has(migrationPrefix(m.name))) {
        applied.add(m.name);
        adopted.push(m);
      }
    }
    if (adopted.length) {
      console.log(
        `[migrations] journal externe « ${EXTERNAL_JOURNAL} » détecté : ${adopted.length} migration(s) adoptée(s) sans ré-exécution`
      );
    }
  }

  // Recopie des migrations adoptées dans `_migrations` : le journal applicatif redevient
  // l'unique source de vérité, et un redémarrage ultérieur n'exige plus le journal externe.
  for (const m of adopted) {
    database
      .prepare('INSERT INTO _migrations (id, name, appliedAt) VALUES (?,?,?)')
      .run('m' + Date.now() + Math.random().toString(36).slice(2, 6), m.name, new Date().toISOString());
  }

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
