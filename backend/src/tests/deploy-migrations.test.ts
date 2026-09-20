/**
 * PHASE FINALE (§8) — RÉGRESSION : démarrage sur une base migrée par le chemin DÉPLOIEMENT.
 *
 * Défaut reproduit (mesuré sur PostgreSQL 16.6 réel) :
 *   Les fichiers `deploy/postgres/*.sql` journalisent dans `schema_migrations` (noms de fichiers
 *   `001_lot_a.sql`), alors que le runner applicatif journalise dans `_migrations`. Un exploitant
 *   qui applique les fichiers SQL puis démarre l'API voyait le runner rejouer la migration 001 :
 *       Error: column "targetType" of relation "reviews" already exists
 *   → **l'API ne démarrait pas** (`ALTER TABLE ADD COLUMN` n'est pas idempotent ; l'idempotence est
 *   portée par le journal, pas par la migration).
 *
 * Correctif vérifié ici : le runner détecte le journal externe, adopte les migrations déjà
 * appliquées (aucune ré-exécution) et les recopie dans `_migrations`.
 *
 * Le test s'exécute sur SQLite ET sur PostgreSQL (il respecte TEST_DATABASE_URL comme le reste
 * de la suite) : la logique d'adoption est commune aux deux moteurs.
 */
import { vi } from 'vitest';
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-deploy-migrations.db';
  process.env.NODE_ENV = 'test';
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { runAllMigrations } from '../migrations/versions/008_idempotency';
import { listApplied } from '../migrations/runner';

/** Noms de fichiers tels que journalisés par `deploy/postgres/validate.mjs` / psql. */
const DEPLOY_FILES = [
  '000_base.sql',
  '001_lot_a.sql',
  '002_lot_b.sql',
  '003_lot_c.sql',
  '004_lot_d.sql',
  '005_lot_e.sql',
  '006_lot_f.sql',
  '007_prod_indexes.sql',
  '008_idempotency.sql',
];

function tableExists(name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as any;
  return !!row;
}

/** Reproduit l'état d'une base créée par le chemin déploiement : schéma présent + journal externe. */
function simulateDeployMigrations() {
  db.exec('DROP TABLE IF EXISTS _migrations;');
  db.exec('DROP TABLE IF EXISTS schema_migrations;');
  db.exec(`
    CREATE TABLE schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);
  for (const f of DEPLOY_FILES) {
    db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(f);
  }
}

describe('§8 Régression — démarrage de l API sur une base migrée par deploy/postgres/*.sql', () => {
  beforeAll(() => {
    bootstrap(); // schéma complet (base + 001→008) + journal `_migrations`
    simulateDeployMigrations();
  }, 180000);

  afterAll(() => {
    db.exec('DROP TABLE IF EXISTS schema_migrations;');
  });

  it('précondition : le schéma existe et SEUL le journal externe est présent', () => {
    expect(tableExists('reviews')).toBe(true);
    expect(tableExists('schema_migrations')).toBe(true);
    // Le runner a perdu son journal : c'est exactement le piège.
    expect(tableExists('_migrations')).toBe(false);
  });

  it('le runner adopte le journal externe : AUCUNE ré-exécution, AUCUNE erreur au démarrage', () => {
    // Avant correctif, cette ligne levait « column "targetType" ... already exists ».
    let applied = -1;
    expect(() => {
      applied = runAllMigrations(db);
    }).not.toThrow();
    expect(applied).toBe(0);
  });

  it('les 8 migrations sont recopiées dans `_migrations` (journal applicatif = source de vérité)', () => {
    const names = (listApplied() as any[]).map((r) => r.name);
    expect(names.length).toBe(8);
    expect(names).toContain('001_lot_a_promotions_coupons_avis_moderation');
    expect(names).toContain('008_idempotency_keys');
  });

  it('un démarrage ULTÉRIEUR reste idempotent, même sans le journal externe', () => {
    db.exec('DROP TABLE IF EXISTS schema_migrations;'); // le déploiement n'est plus là
    expect(runAllMigrations(db)).toBe(0);
    expect((listApplied() as any[]).length).toBe(8);
  });
});
