#!/usr/bin/env node
/**
 * Vérifie que le CLIENT PRISMA est réellement généré, à jour, et cohérent avec
 * le schéma et les paquets installés.
 *
 * Pourquoi : l'image de production générait le client avec un CLI Prisma
 * **volontairement rétrogradé** (`npm i --no-save prisma@6.1.0`) alors que
 * `@prisma/client` est en 6.19.x. Ce décalage de version — et la disparition de
 * 28 paquets qu'entraînait cette réinstallation — rend la génération fragile et
 * peut produire un client silencieusement inutilisable : le conteneur démarre
 * puis l'API échoue à la première requête.
 *
 * Utilisé à deux endroits :
 *   - à la CONSTRUCTION de l'image (Dockerfile) : échec immédiat et explicite ;
 *   - au DÉMARRAGE du conteneur (docker-entrypoint.sh), avec
 *     `--generate-if-needed` : régénère le client si le schéma a changé, sinon
 *     ne fait rien (démarrage plus rapide, aucune dépendance réseau).
 *
 * Usage :
 *   node scripts/verify-prisma-client.mjs [--generate-if-needed] [--warn-only]
 *
 * Contrôles :
 *   1. le client généré existe (`node_modules/.prisma/client`) ;
 *   2. le provider enregistré dans le client correspond à `prisma/schema.prisma` ;
 *   3. le schéma enregistré dans le client est celui du dépôt (pas de client périmé) ;
 *   4. la version du CLI `prisma` est identique à celle de `@prisma/client`.
 *
 * Code de sortie : 0 si tout est conforme (ou `--warn-only`), 1 sinon.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const generateIfNeeded = process.argv.includes('--generate-if-needed');
const warnOnly = process.argv.includes('--warn-only');
const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..');

function warn(message) {
  console.warn(`[verify-prisma-client] ⚠️  ${message}`);
}

function readFile(path) {
  return path && existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function readProvider(schemaText) {
  if (!schemaText) return null;
  const match = /datasource\s+\w+\s*\{[^}]*?provider\s*=\s*"([^"]+)"/s.exec(schemaText);
  return match ? match[1] : null;
}

function readVersion(packageJsonPath) {
  const raw = readFile(packageJsonPath);
  if (!raw) return null;
  try {
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
  }
}

/** Contenu de schéma comparable : commentaires et espaces neutralisés. */
function normalizeSchema(schemaText) {
  if (!schemaText) return null;
  return schemaText
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Même chose mais en ignorant le bloc generator (Prisma 6.19 réécrit
 *  provider = "prisma-client-js" → "prisma-client" et ajoute engineType). */
function normalizeDataSchema(schemaText) {
  if (!schemaText) return null;
  const stripped = schemaText.replace(/\s*generator\s+\w+\s*\{[^}]*\}\s*/g, ' ');
  return stripped
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Affiche un extrait borné pour expliquer une divergence de schéma sans
 *  désactiver le contrôle ni exposer l'intégralité du schéma dans les logs. */
function logSchemaDifference(sourceText, generatedText) {
  const source = normalizeDataSchema(sourceText);
  const generated = normalizeDataSchema(generatedText);
  if (!source || !generated || source === generated) return;
  let offset = 0;
  const max = Math.min(source.length, generated.length);
  while (offset < max && source[offset] === generated[offset]) offset += 1;
  const start = Math.max(0, offset - 80);
  const sourceExcerpt = source.slice(start, Math.min(source.length, offset + 120));
  const generatedExcerpt = generated.slice(start, Math.min(generated.length, offset + 120));
  warn(`diagnostic schéma : première différence à l'offset ${offset}; dépôt=${JSON.stringify(sourceExcerpt)}; client généré=${JSON.stringify(generatedExcerpt)}`);
}

/** Recherche un chemin sous `node_modules` en remontant depuis le dossier de l'API. */
function findInNodeModules(relative) {
  let dir = apiRoot;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, 'node_modules', relative);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Rassemble l'état du client généré et les problèmes détectés. */
function inspect() {
  const schemaText = readFile(join(apiRoot, 'prisma', 'schema.prisma'));
  const schemaProvider = readProvider(schemaText);

  const generatedDir = findInNodeModules(join('.prisma', 'client'));
  const hasEntry = Boolean(
    generatedDir && (existsSync(join(generatedDir, 'index.js')) || existsSync(join(generatedDir, 'default.js'))),
  );
  const generatedSchemaText = generatedDir ? readFile(join(generatedDir, 'schema.prisma')) : null;
  const generatedProvider = readProvider(generatedSchemaText);
  const stale =
    hasEntry &&
    Boolean(normalizeDataSchema(schemaText)) &&
    Boolean(normalizeDataSchema(generatedSchemaText)) &&
    normalizeDataSchema(schemaText) !== normalizeDataSchema(generatedSchemaText);

  const clientVersion = readVersion(findInNodeModules(join('@prisma', 'client', 'package.json')));
  const cliVersion = readVersion(findInNodeModules(join('prisma', 'package.json')));

  const missing = !hasEntry;
  const providerMismatch = Boolean(hasEntry && schemaProvider && generatedProvider && schemaProvider !== generatedProvider);

  const problems = [];
  if (missing) {
    problems.push(
      'client Prisma absent (node_modules/.prisma/client) → exécuter `npx prisma generate --schema prisma/schema.prisma`',
    );
  }
  if (providerMismatch) {
    problems.push(
      `provider incohérent : schéma « ${schemaProvider} » mais client généré « ${generatedProvider} » → régénérer`,
    );
  }
  if (stale) {
    logSchemaDifference(schemaText, generatedSchemaText);
    problems.push('client Prisma périmé : le schéma du dépôt a changé depuis la dernière génération → régénérer');
  }
  if (!cliVersion) {
    problems.push('CLI Prisma absent (node_modules/prisma) → requis pour `prisma generate` et `prisma migrate`');
  } else if (!clientVersion) {
    problems.push('@prisma/client absent (node_modules/@prisma/client) → installation npm incomplète');
  } else if (cliVersion !== clientVersion) {
    problems.push(
      `versions désynchronisées : CLI prisma ${cliVersion} ≠ @prisma/client ${clientVersion} `
        + '→ réinstaller depuis le lockfile (`npm ci`), sans pinnage manuel du CLI',
    );
  }

  return {
    schemaProvider,
    generatedProvider,
    hasEntry,
    missing,
    stale,
    cliVersion,
    clientVersion,
    problems,
    needsGeneration: missing || stale || providerMismatch,
  };
}

function generate() {
  const localCli = findInNodeModules(join('.bin', 'prisma'));
  const command = localCli ?? 'npx';
  const args = localCli ? ['generate', '--schema', 'prisma/schema.prisma'] : ['prisma', 'generate', '--schema', 'prisma/schema.prisma'];
  console.log(`[verify-prisma-client] génération du client Prisma (${localCli ?? 'npx prisma'})…`);
  execFileSync(command, args, { cwd: apiRoot, stdio: 'inherit', env: process.env });
}

let state = inspect();

if (generateIfNeeded && state.needsGeneration) {
  try {
    generate();
  } catch (error) {
    warn(`la génération du client Prisma a échoué : ${error.message}`);
    process.exit(warnOnly ? 0 : 1);
  }
  state = inspect();
}

if (state.problems.length === 0) {
  console.log(
    `[verify-prisma-client] ✅ client Prisma prêt (provider=${state.generatedProvider ?? state.schemaProvider}, `
      + `prisma/cli=${state.cliVersion}, @prisma/client=${state.clientVersion}).`,
  );
  process.exit(0);
}

for (const problem of state.problems) warn(problem);
if (warnOnly) process.exit(0);
process.exit(1);
