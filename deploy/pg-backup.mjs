#!/usr/bin/env node
/**
 * GawJaay — Backup logique PostgreSQL SANS pg_dump (fallback exploitable).
 *
 * Sur un VPS, `deploy/backup.sh` utilise `pg_dump -Fc` (format custom, recommandé).
 * Ce script couvre le cas où `pg_dump` n'est pas installable : il produit un dump SQL
 * complet (schéma + données) restaurable par `psql -f` ou par `deploy/pg-restore.mjs`.
 *
 * Usage :
 *   DATABASE_URL=postgresql://user:pass@host:5432/db node deploy/pg-backup.mjs /var/backups/gawjaay/gawjaay-<stamp>.sql
 *
 * Propriétés : une seule transaction (image cohérente), échappement SQL strict,
 * manifeste de contrôle (nombre de lignes par table) écrit à côté du dump.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const BACKEND_PG = path.resolve(process.cwd(), 'backend/node_modules/pg');
let pg;
try {
  pg = require('pg');
} catch {
  pg = require(BACKEND_PG);
}

const DATABASE_URL = process.env.DATABASE_URL || '';
const target = process.argv[2];
if (!DATABASE_URL.startsWith('postgres')) {
  console.error('DATABASE_URL postgresql:// requis');
  process.exit(1);
}
if (!target) {
  console.error('Usage : node deploy/pg-backup.mjs <fichier.sql>');
  process.exit(1);
}

/** Échappe une valeur JS en littéral SQL sûr. */
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

const out = [];
const manifest = { database: DATABASE_URL.replace(/:[^:@/]*@/, ':***@'), startedAt: new Date().toISOString(), tables: {} };

out.push('-- GawJaay — dump logique PostgreSQL (fallback sans pg_dump)');
out.push(`-- base : ${manifest.database}`);
out.push(`-- date : ${manifest.startedAt}`);
out.push('BEGIN;');
out.push("SET session_replication_role = replica; -- pas de contrôle FK pendant la restauration");
out.push('');

// 1. Schéma (DDL complet, index et contraintes inclus)
const tables = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
);
for (const { tablename } of tables.rows) {
  const ddl = await client.query(
    `SELECT 'CREATE TABLE IF NOT EXISTS ' || quote_ident(c.relname) || ' (' ||
       string_agg(
         quote_ident(a.attname) || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) ||
         CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
         CASE WHEN d.adbin IS NOT NULL THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) ELSE '' END,
         ', ' ORDER BY a.attnum
       ) || ');' AS stmt
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = $1
     GROUP BY c.relname`,
    [tablename]
  );
  if (ddl.rows[0]?.stmt) out.push(ddl.rows[0].stmt);
}

// Contraintes — DEUX PASSES obligatoires : une clé étrangère ne peut être créée que si la clé
// primaire/unique de la table référencée existe déjà (sinon « transformFkeyCheckAttrs » à la
// restauration : erreur constatée puis corrigée lors du test de restauration réel).
const allConstraints = await client.query(
  `SELECT conrelid::regclass::text AS tbl, conname, contype, pg_get_constraintdef(oid) AS def
   FROM pg_constraint
   WHERE connamespace = 'public'::regnamespace AND contype IN ('p','u','f','c')
   ORDER BY tbl, conname`
);
for (const pass of [['p', 'u', 'c'], ['f']]) {
  for (const c of allConstraints.rows.filter((r) => pass.includes(r.contype))) {
    out.push(`ALTER TABLE ${c.tbl} ADD CONSTRAINT ${c.conname} ${c.def};`);
  }
}

// Index (hors ceux créés par les contraintes)
const indexes = await client.query(
  `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
   AND indexname NOT IN (SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace)
   ORDER BY tablename, indexname`
);
for (const i of indexes.rows) out.push(`${i.indexdef};`);
out.push('');

// 2. Données
for (const { tablename } of tables.rows) {
  const rows = await client.query(`SELECT * FROM "${tablename}"`);
  manifest.tables[tablename] = rows.rowCount;
  if (rows.rowCount === 0) continue;
  const cols = rows.fields.map((f) => `"${f.name}"`).join(', ');
  out.push(`-- ${tablename} (${rows.rowCount} lignes)`);
  for (const row of rows.rows) {
    const values = rows.fields.map((f) => lit(row[f.name])).join(', ');
    out.push(`INSERT INTO "${tablename}" (${cols}) VALUES (${values});`);
  }
  out.push('');
}

out.push('SET session_replication_role = DEFAULT;');
out.push('COMMIT;');

fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
fs.writeFileSync(target, out.join('\n') + '\n');
manifest.finishedAt = new Date().toISOString();
manifest.totalRows = Object.values(manifest.tables).reduce((a, b) => a + b, 0);
fs.writeFileSync(target + '.manifest.json', JSON.stringify(manifest, null, 2));

console.log(`[pg-backup] ${target}`);
console.log(`[pg-backup] tables=${tables.rowCount} lignes=${manifest.totalRows} taille=${(fs.statSync(target).size / 1024).toFixed(1)} Ko`);

await client.end();
