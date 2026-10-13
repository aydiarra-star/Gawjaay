import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Les migrations sont rejouées sur un **PostgreSQL réel** (PGlite : PostgreSQL
 * compilé en WebAssembly, exécuté dans Node — aucun service externe requis), de
 * la même façon que `prisma migrate deploy` au démarrage du conteneur Render.
 *
 * Incident à l'origine de ces tests (2026-10-06) : une migration écrite en
 * dialecte SQLite (`DATETIME`) faisait échouer `prisma migrate deploy` sur
 * PostgreSQL → le service ne démarrait plus et TOUS les déploiements
 * échouaient, en silence. Aucune vérification purement textuelle ne pouvait
 * l'attraper : il faut un moteur PostgreSQL pour exécuter le SQL.
 *
 * Ces tests vérifient aussi que la base créée par les migrations correspond
 * EXACTEMENT au schéma Prisma (aucune colonne attendue par le code et absente
 * en production — cas typique : un champ ajouté au schéma sans migration, qui
 * casse l'inscription).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(here, '..');
const migrationsDir = path.join(apiRoot, 'prisma', 'migrations');
const schemaPath = path.join(apiRoot, 'prisma', 'schema.prisma');

const SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Bytes', 'Decimal', 'BigInt', 'Json']);

type Column = { model: string; field: string; column: string; type: string; required: boolean };

/** Colonnes attendues d'après `schema.prisma` (aucune dépendance au client généré). */
function columnsFromSchema(schema: string): Column[] {
  const columns: Column[] = [];
  for (const match of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, model, body] = match;
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith('@@')) continue;
      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (!field) continue;
      const [, name, type, isList, isOptional] = field;
      if (!SCALARS.has(type) || isList) continue;
      const mapped = /@map\("([^"]+)"\)/.exec(line);
      columns.push({ model, field: name, column: mapped?.[1] ?? name, type, required: !isOptional });
    }
  }
  return columns;
}

function migrationDirs(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

const schema = readFileSync(schemaPath, 'utf8');
const expectedColumns = columnsFromSchema(schema);

const db = new PGlite();
let appliedMigrations: string[] = [];
let dbColumns: Map<string, { column: string; dataType: string; nullable: boolean }[]>;

describe('migrations appliquées sur un PostgreSQL réel', () => {
  beforeAll(async () => {
    for (const dir of migrationDirs()) {
      const sql = readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8');
      // Comme Prisma : chaque migration dans une transaction, annulée en bloc si
      // une instruction échoue (un échec ici = production cassée).
      await db.exec('BEGIN');
      try {
        await db.exec(sql);
        await db.exec('COMMIT');
        appliedMigrations.push(dir);
      } catch (error) {
        await db.exec('ROLLBACK');
        throw new Error(`Migration ${dir} refusée par PostgreSQL : ${(error as Error).message}`);
      }
    }

    const rows = await db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
      `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, column_name`,
    );
    dbColumns = new Map();
    for (const row of rows.rows) {
      const list = dbColumns.get(row.table_name) ?? [];
      list.push({ column: row.column_name, dataType: row.data_type, nullable: row.is_nullable === 'YES' });
      dbColumns.set(row.table_name, list);
    }
  }, 120_000);

  afterAll(async () => {
    await db.close();
  });

  it('applique toutes les migrations sans erreur', () => {
    expect(appliedMigrations).toEqual(migrationDirs());
    expect(appliedMigrations.length).toBeGreaterThan(0);
  });

  it('crée les tables des deux parcours d’inscription (boutique et particulier)', async () => {
    // Compte → organisation → boutique (BUSINESS) ; compte → profil vendeur (INDIVIDUAL).
    for (const table of ['User', 'Organization', 'Membership', 'Store', 'SellerProfile', 'PhoneVerification']) {
      expect(dbColumns.has(table), `table ${table} absente`).toBe(true);
    }

    const column = (table: string, name: string) =>
      (dbColumns.get(table) ?? []).find((c) => c.column === name);

    // `phoneVerified` est consulté à l'inscription et à la connexion.
    expect(column('User', 'phoneVerified'), 'User.phoneVerified absente').toBeDefined();
    expect(column('User', 'phoneVerified')?.dataType).toBe('boolean');
    // Un compte particulier n'a ni organisation ni boutique : la colonne reste facultative.
    expect(column('SellerProfile', 'organizationId')?.nullable).toBe(true);
    expect(column('SellerProfile', 'sellerType')).toBeDefined();
    expect(column('Organization', 'whatsapp')).toBeDefined();
    expect(column('Store', 'latitude')?.nullable).toBe(true);
    expect(column('Store', 'longitude')?.nullable).toBe(true);
  });

  it('contient exactement les champs de schema.prisma (aucune colonne manquante)', () => {
    const missing = expectedColumns
      .filter((c) => !(dbColumns.get(c.model) ?? []).some((d) => d.column === c.column))
      .map((c) => `${c.model}.${c.column}`);

    expect(
      missing,
      `Colonnes attendues par le schéma mais absentes de la base PostgreSQL `
        + `(le code échouera en production — ajouter la migration correspondante) :\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('ne contient aucune colonne qui ne soit plus dans schema.prisma', () => {
    const known = new Map<string, Set<string>>();
    for (const column of expectedColumns) {
      const set = known.get(column.model) ?? new Set<string>();
      set.add(column.column);
      known.set(column.model, set);
    }

    const extra: string[] = [];
    for (const [table, columns] of dbColumns) {
      if (table.startsWith('_')) continue; // tables système (_prisma_migrations…)
      for (const column of columns) {
        if (!known.get(table)?.has(column.column)) extra.push(`${table}.${column.column}`);
      }
    }

    expect(extra, `Colonnes en base absentes du schéma (incohérence) :\n${extra.join('\n')}`).toEqual([]);
  });

  it('utilise des types horodatés pour les champs DateTime (jamais DATETIME SQLite)', () => {
    const offenders = expectedColumns
      .filter((c) => c.type === 'DateTime')
      .filter((c) => !(dbColumns.get(c.model) ?? []).some((d) => d.column === c.column))
      .map((c) => `${c.model}.${c.column}`);

    // Toutes les colonnes DateTime doivent exister…
    expect(offenders, `Colonnes DateTime absentes :\n${offenders.join('\n')}`).toEqual([]);

    // …et être de type timestamp (PostgreSQL refuse `DATETIME`).
    const wrongTypes = expectedColumns
      .filter((c) => c.type === 'DateTime')
      .map((c) => ({ name: `${c.model}.${c.column}`, type: (dbColumns.get(c.model) ?? []).find((d) => d.column === c.column)?.dataType }))
      .filter((entry) => !entry.type?.startsWith('timestamp'));

    expect(wrongTypes, `Types non horodatés :\n${JSON.stringify(wrongTypes)}`).toEqual([]);
  });

  it('conserve les contraintes d’unicité d’idempotence (ventes et commandes)', async () => {
    const indexes = await db.query<{ indexname: string; tablename: string; indexdef: string }>(
      `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const unique = indexes.rows.filter((row) => row.indexdef.includes('UNIQUE'));

    // Double clic / retry réseau : une seule commande, une seule vente.
    expect(unique.some((row) => row.tablename === 'Order' && /"storeId", "clientRequestId"/.test(row.indexdef))).toBe(true);
    expect(unique.some((row) => row.tablename === 'Sale' && /"storeId", "clientRequestId"/.test(row.indexdef))).toBe(true);
    // Isolation multi-tenant : un utilisateur n'a qu'une adhésion par organisation.
    expect(unique.some((row) => row.tablename === 'Membership' && /"organizationId", "userId"/.test(row.indexdef))).toBe(true);
  });
});
