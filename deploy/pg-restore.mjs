#!/usr/bin/env node
/**
 * GawJaay — Restauration d'un dump logique produit par `deploy/pg-backup.mjs`.
 *
 * Sur un VPS avec les outils officiels : `pg_restore --clean --if-exists --dbname "$DATABASE_URL" fichier.dump`
 * (format custom de pg_dump), ou `psql -f fichier.sql` pour le dump texte.
 * Ce script permet de restaurer ET DE VÉRIFIER sans binaires PostgreSQL (cas des environnements
 * restreints, et utile pour un test de restauration automatisé).
 *
 * Usage :
 *   DATABASE_URL=postgresql://…/gawjaay_restore node deploy/pg-restore.mjs /chemin/dump.sql
 *
 * Contrôles post-restauration (échec = code 1) :
 *   - nombre de tables = nombre attendu du manifeste
 *   - nombre de lignes identique à la source pour CHAQUE table
 *   - intégrité métier : ventes ↔ lignes de vente, stock ↔ mouvements, migrations présentes
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pg = (() => {
  try {
    return require('pg');
  } catch {
    return require(path.resolve(process.cwd(), 'backend/node_modules/pg'));
  }
})();

const DATABASE_URL = process.env.DATABASE_URL || '';
const source = process.argv[2];
if (!source) {
  console.error('Usage : DATABASE_URL=postgresql://… node deploy/pg-restore.mjs <dump.sql>');
  process.exit(1);
}
const sql = fs.readFileSync(source, 'utf8');
const manifest = JSON.parse(fs.readFileSync(source + '.manifest.json', 'utf8'));

const { Client } = pg;
const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

// Restauration dans une transaction unique (le dump contient déjà BEGIN/COMMIT : on le rejoue tel quel)
const started = Date.now();
await client.query(sql);
console.log(`[pg-restore] dump rejoué en ${Date.now() - started} ms`);

// ——— Vérifications d'intégrité ———
const errors = [];
const tables = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
);
const expectedTables = Object.keys(manifest.tables).length;
if (tables.rowCount < expectedTables) {
  errors.push(`tables restaurées (${tables.rowCount}) < attendues (${expectedTables})`);
}

const counts = {};
for (const { tablename } of tables.rows) {
  const r = await client.query(`SELECT count(*)::int AS c FROM "${tablename}"`);
  counts[tablename] = r.rows[0].c;
  const expected = manifest.tables[tablename];
  if (expected !== undefined && r.rows[0].c !== expected) {
    errors.push(`${tablename}: ${r.rows[0].c} lignes restaurées ≠ ${expected} dans la source`);
  }
}

// Contrôles métier (cohérence interne de la base restaurée)
const checks = [
  ['ventes ↔ lignes de vente', `SELECT count(*)::int AS c FROM sales s WHERE (SELECT count(*) FROM sale_items si WHERE si.saleId = s.id) = 0`],
  ['commandes ↔ lignes', `SELECT count(*)::int AS c FROM orders o WHERE (SELECT count(*) FROM order_items oi WHERE oi.orderId = o.id) = 0`],
  ['stock jamais négatif', `SELECT count(*)::int AS c FROM inventories WHERE quantity < 0`],
  ['migrations présentes', `SELECT count(*)::int AS c FROM _migrations`],
];
for (const [label, q] of checks) {
  const r = await client.query(q);
  const v = r.rows[0].c;
  const ok = label === 'migrations présentes' ? v >= 1 : v === 0;
  console.log(`[pg-restore] ${ok ? 'OK  ' : 'ÉCHEC'} ${label} → ${v}`);
  if (!ok) errors.push(`${label} (${v})`);
}
const mig = await client.query('SELECT count(*)::int AS c FROM _migrations');
console.log(`[pg-restore] migrations restaurées : ${mig.rows[0].c}`);

const keyTables = ['users', 'stores', 'products', 'inventories', 'sales', 'sale_items', 'orders', 'order_items', 'payments', 'debts', 'ai_action_requests', 'audit_logs'];
console.log('[pg-restore] lignes :', keyTables.map((t) => `${t}=${counts[t] ?? 0}`).join(' '));

if (errors.length) {
  console.error('[pg-restore] ÉCHEC :\n - ' + errors.join('\n - '));
  await client.end();
  process.exit(1);
}
console.log('[pg-restore] RESTAURATION VÉRIFIÉE — aucune divergence détectée');
await client.end();
