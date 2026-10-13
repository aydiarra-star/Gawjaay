import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Garde-fou sur les migrations SQL.
 *
 * Incident du 2026-10-06 : la migration `20261007_m5_4_flash_offer` avait été
 * générée avec le dialecte SQLite (`DATETIME`). En production (PostgreSQL),
 * `prisma migrate deploy` échouait donc au démarrage du conteneur :
 *
 *     ERROR: type "datetime" does not exist
 *
 * Conséquence : le service Render ne démarrait plus, tous les déploiements
 * étaient en échec et l'API restait figée sur une version antérieure — dont
 * l'inscription des nouveaux comptes dépendait.
 *
 * Ces tests s'exécutent sans base de données : ils vérifient le SQL lui-même.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'prisma', 'migrations');

function migrationDirs(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readMigration(dir: string): string {
  return readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8');
}

/**
 * SQL sans ses commentaires : les contrôles portent sur les instructions
 * réellement exécutées (les commentaires peuvent légitimement citer un type
 * interdit, par exemple pour documenter un incident).
 */
function withoutComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Types acceptés par PostgreSQL (dialecte imposé par migration_lock.toml). */
const POSTGRES_TYPES = new Set([
  'TEXT',
  'INTEGER',
  'SMALLINT',
  'BIGINT',
  'SERIAL',
  'BOOLEAN',
  'TIMESTAMP',
  'TIMESTAMP(3)',
  'TIMESTAMP(6)',
  'TIMESTAMPTZ',
  'DATE',
  'TIME',
  'DOUBLE PRECISION',
  'REAL',
  'NUMERIC',
  'DECIMAL',
  'UUID',
  'JSONB',
  'JSON',
]);

/** Mots-clés qui suivent une définition de colonne (jamais un type). */
const COLUMN_KEYWORDS = new Set([
  'NOT',
  'NULL',
  'DEFAULT',
  'PRIMARY',
  'UNIQUE',
  'REFERENCES',
  'CONSTRAINT',
  'CHECK',
  'AUTOINCREMENT',
  'GENERATED',
  'COLLATE',
  'IDENTITY',
]);

/** Type d'une définition de colonne : mots avant le premier mot-clé SQL. */
function columnType(definition: string): string {
  const words: string[] = [];
  for (const word of definition.replace(/\s+/g, ' ').trim().split(' ')) {
    if (COLUMN_KEYWORDS.has(word.toUpperCase())) break;
    words.push(word);
  }
  return words.join(' ');
}

/** Découpe une liste de colonnes en respectant les parenthèses (ex. TIMESTAMP(3)). */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** Colonnes réellement déclarées par une migration (CREATE TABLE + ADD COLUMN). */
function columnTypes(sql: string): Array<{ table: string; column: string; type: string }> {
  const columns: Array<{ table: string; column: string; type: string }> = [];

  for (const match of sql.matchAll(/CREATE TABLE "(\w+)"\s*\(([\s\S]*?)\)\s*;/g)) {
    const [, table, body] = match;
    for (const raw of splitTopLevel(body)) {
      const part = raw.trim();
      if (!part || /^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(part)) continue;
      const column = /^"(\w+)"\s+(.+)$/s.exec(part);
      if (!column) continue;
      columns.push({ table, column: column[1], type: columnType(column[2]) });
    }
  }

  for (const match of sql.matchAll(/ALTER TABLE "(\w+)"\s+ADD COLUMN\s+"(\w+)"\s+([^,;]+)/gi)) {
    columns.push({ table: match[1], column: match[2], type: columnType(match[3]) });
  }

  return columns;
}

/** Types/verbes SQLite qui n'existent PAS en PostgreSQL. */
const SQLITE_ONLY = [
  { re: /\bDATETIME\b/i, label: 'type SQLite DATETIME (PostgreSQL attend TIMESTAMP)' },
  { re: /\bAUTOINCREMENT\b/i, label: 'AUTOINCREMENT (SQLite)' },
  { re: /\bBLOB\b/i, label: 'type SQLite BLOB (PostgreSQL attend BYTEA)' },
  { re: /\bDOUBLE\b(?!\s+PRECISION)/i, label: 'DOUBLE (PostgreSQL attend DOUBLE PRECISION)' },
];

/** La règle du dépôt est « migration additive uniquement, jamais destructive ». */
const DESTRUCTIVE = [
  { re: /\bDROP\s+TABLE\b/i, label: 'DROP TABLE' },
  { re: /\bDROP\s+COLUMN\b/i, label: 'DROP COLUMN' },
  { re: /\bTRUNCATE\b/i, label: 'TRUNCATE' },
  { re: /\bDELETE\s+FROM\b/i, label: 'DELETE FROM' },
];

describe('migrations SQL (PostgreSQL)', () => {
  it('cible bien PostgreSQL dans migration_lock.toml', () => {
    const lock = readFileSync(path.join(migrationsDir, 'migration_lock.toml'), 'utf8');
    expect(lock).toMatch(/provider\s*=\s*"postgresql"/);
  });

  it('fournit un migration.sql non vide pour chaque migration', () => {
    const dirs = migrationDirs();
    expect(dirs.length).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(existsSync(path.join(migrationsDir, dir, 'migration.sql')), `${dir} : migration.sql manquant`).toBe(true);
      expect(readMigration(dir).trim().length, `${dir} : migration.sql vide`).toBeGreaterThan(0);
    }
  });

  it("n'utilise que des types SQL acceptés par PostgreSQL", () => {
    const offenders: string[] = [];
    for (const dir of migrationDirs()) {
      const sql = withoutComments(readMigration(dir));
      for (const { table, column, type } of columnTypes(sql)) {
        if (!POSTGRES_TYPES.has(type)) {
          offenders.push(`${dir} → ${table}."${column}" ${type}`);
        }
      }
    }

    expect(
      offenders,
      `Types SQL non acceptés par PostgreSQL (la base de production refuse la migration, le conteneur API ne démarre pas) :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('ne contient aucun type ni verbe propre à SQLite', () => {
    const offenders: string[] = [];
    for (const dir of migrationDirs()) {
      const sql = withoutComments(readMigration(dir));
      for (const { re, label } of SQLITE_ONLY) {
        if (re.test(sql)) offenders.push(`${dir} → ${label}`);
      }
    }
    expect(offenders, `Dialecte SQLite détecté dans des migrations PostgreSQL :\n${offenders.join('\n')}`).toEqual([]);
  });

  it('reste additive : aucune instruction destructive', () => {
    const offenders: string[] = [];
    for (const dir of migrationDirs()) {
      const sql = withoutComments(readMigration(dir));
      for (const { re, label } of DESTRUCTIVE) {
        if (re.test(sql)) offenders.push(`${dir} → ${label}`);
      }
    }
    expect(offenders, `Instruction destructive détectée :\n${offenders.join('\n')}`).toEqual([]);
  });

  it("régression : la migration des offres flash n'utilise plus DATETIME", () => {
    const dir = '20261007_m5_4_flash_offer';
    expect(migrationDirs()).toContain(dir);
    const sql = withoutComments(readMigration(dir));
    expect(sql).not.toMatch(/DATETIME/i);
    // Les colonnes de date/heure sont bien des TIMESTAMP PostgreSQL.
    expect(sql).toMatch(/"endsAt"\s+TIMESTAMP\(3\)/);
    expect(sql).toMatch(/"createdAt"\s+TIMESTAMP\(3\)/);
  });
});
