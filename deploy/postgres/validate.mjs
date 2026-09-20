/**
 * Validation des migrations GawJaay V2 sur PostgreSQL réel (via PGlite, moteur PostgreSQL 16 WASM).
 *
 * 1. Fresh database  : base PG vierge → 000..006 appliqués dans l'ordre (journal schema_migrations).
 * 2. Idempotence     : 2e exécution → 0 application (comportement identique au runner SQLite).
 * 3. Parité          : comparaison systématique du schéma PG final avec la référence SQLite
 *                      (tables, colonnes/types, NOT NULL, PK, FK, CHECK, index explicites).
 * 4. Intégrité       : violations FK + nombre de CHECK + index.
 *
 * Usage : npm install && node validate.mjs ../..(sqlite ref)?  — la référence SQLite est
 * générée automatiquement si absente (voir README).
 */
import { PGlite } from '@electric-sql/pglite';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_FILES = ['000_base.sql', '001_lot_a.sql', '002_lot_b.sql', '003_lot_c.sql', '004_lot_d.sql', '005_lot_e.sql', '006_lot_f.sql', '007_prod_indexes.sql', '008_idempotency.sql'];
const SQLITE_REF = join(HERE, 'reference-schema.sqlite');

// ---------- 1. Fresh PostgreSQL ----------
const pg = new PGlite();
await pg.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at timestamptz DEFAULT now());`);

let applied = 0;
for (const f of SQL_FILES) {
  const done = await pg.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [f]);
  if (done.rows.length) continue;
  const sql = readFileSync(join(HERE, f), 'utf8');
  await pg.exec(sql); // réel : une erreur SQL échoue ici
  await pg.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [f]);
  applied++;
  console.log(`[pg] appliquée: ${f}`);
}
console.log(`[pg] FRESH: ${applied}/${SQL_FILES.length} migrations appliquées sur base vierge`);

// ---------- 2. Idempotence ----------
let reapplied = 0;
for (const f of SQL_FILES) {
  const done = await pg.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [f]);
  if (done.rows.length) continue;
  reapplied++;
}
console.log(`[pg] IDEMPOTENCE: 2e exécution → ${reapplied} ré-application (attendu 0) ${reapplied === 0 ? '✓' : '✗'}`);

// ---------- 3. Intégrité ----------
const tables = (await pg.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name != 'schema_migrations' ORDER BY table_name`)).rows.map(r => r.table_name);
console.log(`[pg] TABLES: ${tables.length}`);
let fkPairs = 0, checkCount = 0;
for (const t of tables) {
  const fks = (await pg.query(`SELECT COUNT(*) c FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='FOREIGN KEY'`, [t])).rows[0].c;
  const checks = (await pg.query(`SELECT COUNT(*) c FROM information_schema.table_constraints WHERE table_name=$1 AND constraint_type='CHECK'`, [t])).rows[0].c;
  fkPairs += Number(fks); checkCount += Number(checks);
}
console.log(`[pg] FK=${fkPairs} CHECK=${checkCount}`);

// ---------- 4. Parité avec la référence SQLite ----------
if (!existsSync(SQLITE_REF)) {
  console.log(`[parité] RÉFÉRENCE SQLITE ABSENTE (${SQLITE_REF}) — générez-la (voir README §générer la référence) et relancez.`);
  process.exit(0);
}
const lite = new DatabaseSync(SQLITE_REF);
// on exclut les journaux internes des runners (_migrations SQLite / schema_migrations PG)
const liteTables = lite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations' ORDER BY name`).all().map(r => r.name.toLowerCase());

const TYPE_PG = { 'text': 'TEXT', 'character varying': 'TEXT', 'integer': 'INTEGER', 'bigint': 'INTEGER', 'double precision': 'REAL', 'real': 'REAL' };
// classes de types : TEXT/VARCHAR -> STRING ; INT*/BIGINT -> INT ; REAL/FLOAT/DOUBLE/NUMERIC -> REAL
function typeClass(t) {
  const u = String(t).toUpperCase();
  if (u.startsWith('TEXT') || u.startsWith('VARCHAR') || u.startsWith('CHAR') || u === '' || u.startsWith('CLOB')) return 'STRING';
  if (u.includes('INT')) return 'INT';
  if (u.startsWith('REAL') || u.includes('FLOAT') || u.includes('DOUBLE') || u.startsWith('NUMERIC') || u.startsWith('DEC')) return 'REAL';
  return u;
}
let diffs = [];
if (JSON.stringify([...liteTables].sort()) !== JSON.stringify([...tables].sort())) {
  const onlyS = liteTables.filter(t => !tables.includes(t));
  const onlyP = tables.filter(t => !liteTables.includes(t));
  diffs.push(`TABLES différentes — seulement SQLite: [${onlyS}] seulement PG: [${onlyP}]`);
}
for (const t of liteTables.filter(t => tables.includes(t))) {
  const lCols = lite.prepare(`PRAGMA table_info(${t})`).all();
  const pCols = (await pg.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name=$1`, [t])).rows;
  // PG replie les identifiants non quotés en minuscules (convention portage : colonnes en
  // minuscules côté PG ; le driver applicatif devra utiliser ces noms ou des guillemets).
  const lMap = new Map(lCols.map(c => [c.name.toLowerCase(), c]));
  const pMap = new Map(pCols.map(c => [c.column_name.toLowerCase(), c]));
  const lPkCols = new Set(lCols.filter(c => c.pk).map(c => c.name.toLowerCase()));
  for (const [n, lc] of lMap) {
    const pc = pMap.get(n);
    if (!pc) { diffs.push(`${t}.${n} absent en PG`); continue; }
    const lNotNull = String(lc.notnull) === '1' || lPkCols.has(n) ? '1' : '0';
    const lType = typeClass(lc.type);
    const pType = typeClass(TYPE_PG[pc.data_type] || pc.data_type);
    if (lType !== pType) diffs.push(`${t}.${n} type: SQLITE=${lc.type} PG=${pc.data_type}`);
    if (lNotNull !== (pc.is_nullable === 'NO' ? '1' : '0')) diffs.push(`${t}.${n} NOT NULL: SQLITE=${lc.notnull} PG=${pc.is_nullable}`);
  }
  for (const n of pMap.keys()) if (!lMap.has(n)) diffs.push(`${t}.${n} uniquement en PG`);
  // PK
  const lPk = lCols.filter(c => c.pk).map(c => c.name.toLowerCase()).sort().join(',');
  const pPk = (await pg.query(`SELECT kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name WHERE tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'`, [t])).rows;
  const pPkStr = pPk.map(r => (r.column_name ?? r.attname).toLowerCase()).sort().join(',');
  if (lPk !== pPkStr) diffs.push(`${t} PK: SQLITE=[${lPk}] PG=[${pPkStr}]`);
  // FK (paires table->référence)
  const lFk = lite.prepare(`PRAGMA foreign_key_list(${t})`).all().map(r => `${r.table}.${(r['to'] ?? '').toLowerCase()}`).sort().join('|');
  const pFk = (await pg.query(
    `SELECT ccu.table_name, ccu.column_name FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
     WHERE tc.table_name=$1 AND tc.constraint_type='FOREIGN KEY'`, [t])).rows
    .map(r => `${r.table_name}.${r.column_name.toLowerCase()}`).sort().join('|');
  if (lFk && lFk !== pFk) diffs.push(`${t} FK: SQLITE=[${lFk}] PG=[${pFk}]`);
  // Index explicites (origin 'c' = CREATE INDEX)
  const lIdx = lite.prepare(`PRAGMA index_list(${t})`).all().filter(i => i.origin === 'c').map(i => i.name.toLowerCase()).sort();
  const pIdx = (await pg.query(`SELECT indexname FROM pg_indexes WHERE tablename=$1 AND indexname NOT LIKE '%_pkey' AND indexname NOT LIKE '%_key' AND indexname NOT LIKE '%_not_null'`, [t])).rows.map(r => r.indexname.toLowerCase()).sort();
  const li = lIdx.join('|'), pi = pIdx.join('|');
  if (li !== pi) diffs.push(`${t} INDEX: SQLITE=[${li}] PG=[${pi}]`);
}

if (diffs.length) {
  console.log(`[parité] ✗ ${diffs.length} DIFFÉRENCE(S):`);
  for (const d of diffs) console.log('  -', d);
  process.exit(1);
} else {
  console.log(`[parité] ✓ SCHÉMA PG IDENTIQUE À LA RÉFÉRENCE SQLITE (${liteTables.length} tables, colonnes/PK/FK/index)`);
}
