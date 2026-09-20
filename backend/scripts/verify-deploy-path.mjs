#!/usr/bin/env node
/**
 * GAWJAAY — Vérification du CHEMIN DE DÉPLOIEMENT PostgreSQL (§8, §23) sur un serveur RÉEL.
 *
 * Ce que ce script prouve, sur un vrai serveur PostgreSQL (jamais un substitut) :
 *   1. Base vierge → application des 9 fichiers `deploy/postgres/*.sql` dans l'ordre (comme le
 *      ferait un exploitant avec `psql -f`), journalisés dans `schema_migrations`.
 *   2. Idempotence : 2e passage → 0 ré-application.
 *   3. Intégrité mesurée : tables / clés étrangères / CHECK réels / index.
 *   4. POINT CRITIQUE : démarrage de l'application sur cette base (schéma créé par les fichiers SQL).
 *      Régression historique : le runner applicatif ne voyait pas le journal `schema_migrations`,
 *      rejouait la migration 001 et échouait au démarrage
 *      (`column "targetType" of relation "reviews" already exists`) → l'API ne démarrait pas.
 *      Le script échoue (code 1) si ce scénario se reproduit.
 *
 * Usage :
 *   PG_ADMIN_URL=postgresql://user:pass@host:5432/postgres \
 *   DATABASE_URL=postgresql://user:pass@host:5432/gawjaay_deploy_check \
 *   node scripts/verify-deploy-path.mjs
 *
 * Ne modifie AUCUNE base existante : la base cible est supprimée puis recréée.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '..');
const REPO = path.resolve(BACKEND, '..');
const DEPLOY_SQL_DIR = path.join(REPO, 'deploy', 'postgres');

const SQL_FILES = [
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

const TARGET_URL = process.env.DATABASE_URL || '';
const ADMIN_URL = process.env.PG_ADMIN_URL || '';

if (!TARGET_URL.startsWith('postgres')) {
  console.error('DATABASE_URL postgresql:// requis');
  process.exit(1);
}

const target = new URL(TARGET_URL);
const dbName = target.pathname.replace(/^\//, '');
const adminUrl =
  ADMIN_URL ||
  `${target.protocol}//${target.username}${target.password ? ':' + target.password : ''}@${target.host}/postgres`;

let failures = 0;
function check(ok, label, detail) {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}

// ——— 0. Base cible vierge ———
const admin = new Client({ connectionString: adminUrl });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
await admin.query(`CREATE DATABASE "${dbName}"`);
await admin.end();
console.log(`[deploy-path] base cible recréée : ${dbName}`);

// ——— 1. Application des fichiers SQL (chemin exploitation) ———
const db = new Client({ connectionString: TARGET_URL });
await db.connect();
await db.query(
  `CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at timestamptz DEFAULT now())`
);

let applied = 0;
for (const f of SQL_FILES) {
  const done = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f]);
  if (done.rows.length) continue;
  const sql = fs.readFileSync(path.join(DEPLOY_SQL_DIR, f), 'utf8');
  await db.query('BEGIN');
  try {
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    await db.query('COMMIT');
    applied++;
  } catch (e) {
    await db.query('ROLLBACK');
    check(false, `application de ${f}`, e.message);
    process.exit(1);
  }
}

console.log('\n=== 1. Base vierge → fichiers SQL ===');
check(applied === SQL_FILES.length, `${SQL_FILES.length}/${SQL_FILES.length} fichiers appliqués`, applied);

// ——— 2. Idempotence ———
let second = 0;
for (const f of SQL_FILES) {
  const done = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f]);
  if (!done.rows.length) second++;
}
console.log('\n=== 2. Idempotence ===');
check(second === 0, '2e passage → 0 ré-application', second);

// ——— 3. Intégrité mesurée ———
const tables = (
  await db.query(`SELECT count(*)::int c FROM pg_tables WHERE schemaname='public'`)
).rows[0].c;
const fks = (
  await db.query(
    `SELECT count(*)::int c FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace`
  )
).rows[0].c;
const checks = (
  await db.query(
    `SELECT count(*)::int c FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace`
  )
).rows[0].c;
const indexes = (
  await db.query(`SELECT count(*)::int c FROM pg_indexes WHERE schemaname='public'`)
).rows[0].c;

console.log('\n=== 3. Intégrité (mesurée) ===');
console.log(`  TABLES=${tables} FK=${fks} CHECK_reels=${checks} INDEX=${indexes}`);
check(tables === 54, 'tables = 54 (53 métier + journal de déploiement)', tables);
check(fks === 64, 'clés étrangères = 64', fks);
check(checks === 13, 'contraintes CHECK réelles = 13', checks);
// 109 ici contre 110 sur le chemin applicatif : la seule différence est l'index de la clé primaire
// du journal (`schema_migrations` a 2 colonnes/1 PK, `_migrations` en a 3 et porte en plus un UNIQUE).
// Mesuré et réconcilié par l'audit de parité — le schéma métier est, lui, strictement identique.
check(indexes === 109, 'index = 109 (schéma déployé, journal inclus)', indexes);

await db.end();

// ——— 4. POINT CRITIQUE : l'application démarre sur cette base ———
console.log('\n=== 4. Démarrage de l\'application sur la base migrée par les fichiers SQL ===');
let bootOutput = '';
let bootOk = true;
try {
  bootOutput = execFileSync(
    process.execPath,
    [
      path.join(BACKEND, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      '-e',
      "import { bootstrap } from './src/lib/bootstrap'; bootstrap(); console.log('BOOTSTRAP_OK');",
    ],
    { cwd: BACKEND, env: { ...process.env, DATABASE_URL: TARGET_URL }, encoding: 'utf8', stdio: 'pipe' }
  );
} catch (e) {
  bootOk = false;
  bootOutput = `${e.stdout || ''}\n${e.stderr || ''}`;
}
if (bootOk) console.log(bootOutput.trim());
else console.log(bootOutput.trim());

check(bootOk, 'bootstrap() ne lève pas d exception sur une base migrée par les fichiers SQL');
check(!/already exists/i.test(bootOutput), 'aucune erreur « … already exists » (régression historique)');
check(
  /journal externe « schema_migrations » détecté/.test(bootOutput),
  'le journal de déploiement a bien été adopté'
);

// Vérification finale : le journal applicatif fait foi après adoption.
const db2 = new Client({ connectionString: TARGET_URL });
await db2.connect();
const appJournal = (await db2.query('SELECT count(*)::int c FROM _migrations')).rows[0].c;
const adopted = (await db2.query('SELECT name FROM _migrations ORDER BY name')).rows.map((r) => r.name);
await db2.end();
console.log('\n=== 5. Journal applicatif après adoption ===');
check(appJournal === SQL_FILES.length - 1, '_migrations = 8 migrations applicatives', appJournal);
console.log(`  migrations : ${adopted.join(', ')}`);

console.log(
  failures === 0
    ? '\n=== CHEMIN DE DÉPLOIEMENT PostgreSQL : VÉRIFIÉ (aucun échec) ==='
    : `\n=== CHEMIN DE DÉPLOIEMENT PostgreSQL : ${failures} ÉCHEC(S) ===`
);
process.exit(failures === 0 ? 0 : 1);
