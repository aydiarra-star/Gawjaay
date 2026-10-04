#!/usr/bin/env node
/**
 * Prépare la base au démarrage du conteneur, de façon NON INTERACTIVE et
 * NON DESTRUCTIVE.
 *
 * PostgreSQL (production) : `prisma migrate deploy` applique les migrations
 * versionnées. Si la base contient déjà un schéma (table `User`) mais aucun
 * historique de migrations — cas de la base de production créée par l'ancien
 * `db push` — la migration `0_init` est « baselinée » : elle est marquée
 * appliquée SANS exécuter son SQL, puis seules les migrations additives
 * suivantes sont appliquées. Aucun `--accept-data-loss`, aucune commande
 * destructive : les données existantes restent intactes.
 *
 * SQLite (dev / docker-compose) : conserve `prisma db push` (base jetable).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').trim().toLowerCase();
const schema = 'prisma/schema.prisma';

function prisma(args) {
  execFileSync('npx', ['prisma', ...args, '--schema', schema], { stdio: 'inherit', env: process.env });
}

if (provider !== 'postgresql') {
  prisma(['db', 'push', '--skip-generate']);
  process.exit(0);
}

if (!existsSync('prisma/migrations')) {
  console.error('[db-migrate] prisma/migrations introuvable : déploiement PostgreSQL refusé par sécurité.');
  process.exit(1);
}

const client = new PrismaClient();
let preexisting = false;
try {
  const rows = await client.$queryRawUnsafe(
    `SELECT to_regclass('public._prisma_migrations')::text AS migrations,
            to_regclass('public."User"')::text AS users`,
  );
  const { migrations, users } = rows[0] ?? {};
  preexisting = Boolean(users) && !migrations;
} finally {
  await client.$disconnect();
}

if (preexisting) {
  console.log('[db-migrate] Base existante sans historique : baseline de 0_init (aucun SQL exécuté).');
  try {
    prisma(['migrate', 'resolve', '--applied', '0_init']);
  } catch {
    // P3008 (déjà appliquée) est bénin et idempotent.
  }
}

prisma(['migrate', 'deploy']);
