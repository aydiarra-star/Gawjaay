#!/usr/bin/env node
/**
 * Sélectionne le provider Prisma data source selon `DATABASE_PROVIDER`.
 *
 * Prisma n'accepte pas de provider piloté par variable d'environnement. Pour
 * garder UN SEUL schéma canonique (aucune duplication de modèles), ce script
 * réécrit uniquement la ligne `provider = "…"` du bloc `datasource`.
 *
 *   DATABASE_PROVIDER=sqlite      (défaut) → dev / test / CI / déploiement Docker
 *   DATABASE_PROVIDER=postgresql            → production PostgreSQL managé
 *
 * Idempotent : relancer le script ne change rien s'il est déjà correct.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SUPPORTED = ['sqlite', 'postgresql'];
const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').trim().toLowerCase();

if (!SUPPORTED.includes(provider)) {
  console.error(
    `DATABASE_PROVIDER invalide : « ${provider} ». Valeurs acceptées : ${SUPPORTED.join(', ')}.`,
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');

const datasourceRe = /(datasource\s+\w+\s*\{[^}]*?provider\s*=\s*)"[^"]*"/s;
if (!datasourceRe.test(schema)) {
  console.error('Bloc `datasource { provider = … }` introuvable dans prisma/schema.prisma.');
  process.exit(1);
}

const updated = schema.replace(datasourceRe, `$1"${provider}"`);
if (updated === schema) {
  console.log(`Prisma datasource déjà en « ${provider} » — aucun changement.`);
} else {
  writeFileSync(schemaPath, updated);
  console.log(`Prisma datasource configuré en « ${provider} ».`);
}
