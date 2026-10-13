#!/usr/bin/env node
/**
 * Prépare la base au démarrage du conteneur : NON INTERACTIF, ADDITIF, RÉSILIENT.
 *
 * ── Pourquoi ce script existe ────────────────────────────────────────────────
 * Le 2026-10-06, la migration `20261007_m5_4_flash_offer` (écrite en dialecte
 * SQLite : `DATETIME`) a été refusée par PostgreSQL au démarrage du conteneur :
 *
 *     ERROR: type "datetime" does not exist
 *
 * `prisma migrate deploy` a alors enregistré cette migration en ÉCHEC dans
 * `_prisma_migrations` (`finished_at IS NULL`). Conséquence durable : TOUS les
 * déploiements suivants échouaient avec l'erreur Prisma **P3009** (« found
 * failed migrations in the target database »), même après correction du SQL —
 * le conteneur ne démarrait plus et l'API restait figée sur une version
 * antérieure, en silence.
 *
 * Corriger le fichier SQL ne suffit donc pas : il faut aussi RÉPARER
 * l'historique de migrations de la base de production. C'est ce que fait ce
 * script, dans un ordre strictement non destructif :
 *
 *   1. la base répond-elle ? (nouvelle tentative avec attente — un PostgreSQL
 *      managé peut être indisponible quelques secondes au démarrage)
 *   2. base déjà peuplée sans historique de migrations (ancien `db push`) →
 *      `migrate resolve --applied 0_init` (baseline, aucun SQL exécuté)
 *   3. migration(s) enregistrée(s) en échec → `migrate resolve --rolled-back`
 *      (PostgreSQL exécute chaque migration dans une transaction : une
 *      migration échouée est intégralement annulée, la rejouer est donc sûr)
 *   4. `migrate deploy` (migrations versionnées, additives)
 *   5. en dernier recours seulement (`DB_PUSH_FALLBACK`, actif par défaut) :
 *      `prisma db push --accept-data-loss` aligne le schéma sur schema.prisma,
 *      puis l'historique est complété par `migrate resolve --applied` — la
 *      base et l'historique redeviennent cohérents pour les déploiements
 *      suivants.
 *
 * ── Comportement en cas d'échec ──────────────────────────────────────────────
 * Un échec de MIGRATION ne tue plus le conteneur (il démarre en mode dégradé,
 * signalé dans les logs et dans `GET /api/v1/health` → `database.schema`).
 * `MIGRATIONS_STRICT=true` rétablit l'ancien comportement (arrêt si la base
 * n'est pas à jour). En revanche, une base INJOIGNABLE reste fatale : sans
 * base, l'API ne peut rien servir.
 *
 * ── Variables d'environnement ────────────────────────────────────────────────
 *   DATABASE_PROVIDER      sqlite (défaut) | postgresql
 *   MIGRATIONS_STRICT      true → échec de migration = arrêt du conteneur
 *   DB_PUSH_FALLBACK       false → désactive le repli `db push --accept-data-loss`
 *   DB_CONNECT_ATTEMPTS    tentatives de connexion au démarrage (défaut 12)
 *   DB_CONNECT_DELAY_MS    attente entre deux tentatives (défaut 5000)
 *   DB_STATUS_FILE         fichier d'état lu par /api/v1/health
 *
 * ── Codes de sortie ──────────────────────────────────────────────────────────
 *   0  base prête (migrations, repli `db push`, ou mode dégradé assumé)
 *   1  arrêt volontaire : base injoignable ou MIGRATIONS_STRICT=true
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..');
const schema = 'prisma/schema.prisma';

const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').trim().toLowerCase();
const strict = /^(1|true|yes)$/i.test((process.env.MIGRATIONS_STRICT ?? '').trim());
const pushFallback = !/^(0|false|no)$/i.test((process.env.DB_PUSH_FALLBACK ?? 'true').trim());
const connectAttempts = Math.max(1, Number(process.env.DB_CONNECT_ATTEMPTS ?? 12) || 12);
const connectDelayMs = Math.max(0, Number(process.env.DB_CONNECT_DELAY_MS ?? 5000) || 5000);
const statusFile = process.env.DB_STATUS_FILE ?? join(tmpdir(), 'gawjaay-db-status.json');

/** Étapes exécutées, journalisées dans le fichier d'état (visible via /health). */
const steps = [];

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[db-migrate] ${message}`);
}

function warn(message) {
  // eslint-disable-next-line no-console
  console.warn(`[db-migrate] ⚠️  ${message}`);
}

/** Écrit l'état de préparation de la base (lu par l'API pour /api/v1/health). */
function writeStatus(status) {
  const payload = {
    provider,
    at: new Date().toISOString(),
    steps,
    ...status,
  };
  try {
    writeFileSync(statusFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (error) {
    warn(`Impossible d'écrire ${statusFile} : ${error.message}`);
  }
  return payload;
}

/**
 * Résout le binaire Prisma LOCAL (node_modules/.bin), en remontant depuis le
 * dossier de l'API : évite que `npx` télécharge une version arbitraire du CLI
 * si celui-ci manque (le CLI doit être celui du lockfile, cf. package.json).
 */
function resolvePrismaCli() {
  let dir = apiRoot;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(dir, 'node_modules', '.bin', 'prisma');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const prismaCli = resolvePrismaCli();

/**
 * Exécute le CLI Prisma. Renvoie `{ ok, output }` sans lever d'exception :
 * l'appelant décide si l'échec est fatal (base injoignable) ou réparable.
 */
function runPrisma(args, { capture = false } = {}) {
  const command = prismaCli ?? 'npx';
  const fullArgs = prismaCli ? args : ['prisma', ...args];
  try {
    const output = execFileSync(command, fullArgs, {
      cwd: apiRoot,
      env: process.env,
      stdio: capture ? 'pipe' : 'inherit',
      encoding: 'utf8',
    });
    return { ok: true, output: (output ?? '').trim() };
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() || error.message;
    return { ok: false, output };
  }
}

/** Commande Prisma avec `--schema` (cwd = apps/api). */
function prisma(args, options) {
  return runPrisma([...args, '--schema', schema], options);
}

/** Migrations présentes dans le dépôt, dans l'ordre d'application. */
function localMigrations() {
  const dir = join(apiRoot, 'prisma', 'migrations');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Attend que la base réponde réellement (SELECT 1), sinon sortie fatale. */
async function waitForDatabase() {
  let lastError = 'inconnue';
  for (let attempt = 1; attempt <= connectAttempts; attempt += 1) {
    const client = new PrismaClient();
    try {
      await client.$queryRawUnsafe('SELECT 1');
      await client.$disconnect();
      log(`base joignable (tentative ${attempt}/${connectAttempts}).`);
      return true;
    } catch (error) {
      lastError = error.message;
      await client.$disconnect().catch(() => {});
      if (attempt < connectAttempts) {
        log(`base non joignable (${attempt}/${connectAttempts}) : ${lastError.split('\n')[0]}`);
        await new Promise((r) => setTimeout(r, connectDelayMs));
      }
    }
  }
  warn(`base INJOIGNABLE après ${connectAttempts} tentatives — dernier message : ${lastError.split('\n')[0]}`);
  writeStatus({
    ok: false,
    degraded: false,
    fatal: true,
    mode: 'unreachable',
    detail: `Base de données injoignable : ${lastError.split('\n')[0]}`,
  });
  return false;
}

/**
 * Réconciliation PostgreSQL : baseline, réparation des migrations en échec,
 * `migrate deploy`, puis repli `db push --accept-data-loss` si nécessaire.
 */
async function preparePostgres() {
  const client = new PrismaClient();
  let historyExists = false;
  let schemaPreexisting = false;
  let failed = [];

  try {
    // `current_schema()` suit le search_path de la connexion (Prisma applique
    // `?schema=…` s'il est présent) : aucune hypothèse sur le nom du schéma.
    const rows = await client.$queryRawUnsafe(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name IN ('_prisma_migrations', 'User')`,
    );
    const names = rows.map((row) => row.table_name);
    historyExists = names.includes('_prisma_migrations');
    schemaPreexisting = names.includes('User');
  } catch (error) {
    warn(`Inspection de la base impossible : ${error.message.split('\n')[0]}`);
  }

  if (historyExists) {
    try {
      failed = await client.$queryRawUnsafe(
        `SELECT migration_name FROM "_prisma_migrations"
          WHERE finished_at IS NULL AND rolled_back_at IS NULL
          ORDER BY started_at`,
      );
    } catch (error) {
      warn(`Lecture de _prisma_migrations impossible : ${error.message.split('\n')[0]}`);
    }
  }
  await client.$disconnect();

  steps.push({
    name: 'inspection',
    history: historyExists,
    schemaPreexisting,
    failed: failed.map((r) => r.migration_name),
  });

  // (2) Base peuplée par l'ancien `db push`, sans historique : baseline 0_init.
  if (!historyExists && schemaPreexisting) {
    log("base existante sans historique de migrations → baseline de 0_init (aucun SQL exécuté).");
    if (!prisma(['migrate', 'resolve', '--applied', '0_init'], { capture: true }).ok) {
      warn('baseline 0_init non enregistrée (déjà appliquée ou absente) — poursuite.');
    }
    steps.push({ name: 'baseline', migration: '0_init' });
  }

  // (3) Migration(s) en échec (P3009) : les marquer annulées pour débloquer la suite.
  for (const row of failed) {
    log(`migration en échec détectée : ${row.migration_name} → resolve --rolled-back.`);
    const result = prisma(['migrate', 'resolve', '--rolled-back', row.migration_name], { capture: true });
    steps.push({ name: 'resolve-rolled-back', migration: row.migration_name, ok: result.ok });
    if (!result.ok) warn(`resolve --rolled-back ${row.migration_name} : ${result.output.split('\n')[0]}`);
  }

  // (4) Migrations versionnées.
  let deploy = prisma(['migrate', 'deploy']);
  steps.push({ name: 'migrate-deploy', ok: deploy.ok });

  // Un nouvel échec vient d'être enregistré : on répare une fois puis on rejoue.
  if (!deploy.ok) {
    const retryInfo = await failedMigrationsNow();
    for (const name of retryInfo) {
      log(`échec enregistré pendant deploy : ${name} → resolve --rolled-back puis nouvelle tentative.`);
      const result = prisma(['migrate', 'resolve', '--rolled-back', name], { capture: true });
      steps.push({ name: 'resolve-rolled-back', migration: name, ok: result.ok, afterFailedDeploy: true });
      if (!result.ok) warn(`resolve --rolled-back ${name} : ${result.output.split('\n')[0]}`);
    }
    if (retryInfo.length > 0) {
      deploy = prisma(['migrate', 'deploy']);
      steps.push({ name: 'migrate-deploy-retry', ok: deploy.ok });
    }
  }

  if (deploy.ok) {
    log('migrations appliquées (migrate deploy).');
    return writeStatus({ ok: true, degraded: false, mode: 'migrations', detail: 'Migrations versionnées appliquées.' });
  }

  warn('`prisma migrate deploy` a échoué.');
  warn(deploy.output.split('\n').slice(0, 12).join('\n'));
  if (!pushFallback) {
    return writeStatus({
      ok: false,
      degraded: !strict,
      mode: 'migrations-failed',
      detail: 'Migrations refusées ; repli `db push` désactivé (DB_PUSH_FALLBACK=false).',
    });
  }

  // (5) Dernier recours : aligner le schéma puis réparer l'historique.
  warn('repli : `prisma db push --accept-data-loss` pour aligner le schéma sur schema.prisma.');
  const push = prisma(['db', 'push', '--accept-data-loss', '--skip-generate']);
  steps.push({ name: 'db-push-fallback', ok: push.ok });
  if (!push.ok) {
    warn('`db push` a échoué à son tour : la base reste dans son état précédent.');
    warn(push.output.split('\n').slice(0, 12).join('\n'));
    return writeStatus({
      ok: false,
      degraded: !strict,
      mode: 'degraded',
      detail: 'Migrations et repli `db push` en échec — API démarrée en mode dégradé.',
    });
  }

  // Le schéma correspond désormais à schema.prisma : compléter l'historique
  // (sans quoi chaque déploiement suivant rejouerait les mêmes migrations).
  const recorded = await appliedNamesNow();
  const toResolve = localMigrations().filter((name) => !recorded.includes(name));
  for (const name of toResolve) {
    const result = prisma(['migrate', 'resolve', '--applied', name], { capture: true });
    steps.push({ name: 'resolve-applied', migration: name, ok: result.ok });
    if (!result.ok) warn(`resolve --applied ${name} : ${result.output.split('\n')[0]}`);
  }

  log(`schéma aligné par db push ; ${toResolve.length} migration(s) marquée(s) appliquée(s) dans l'historique.`);
  writeStatus({
    ok: true,
    degraded: false,
    mode: 'db-push',
    detail:
      'Migrations versionnées en échec : schéma aligné par `prisma db push --accept-data-loss` '
      + "et historique de migrations complété. Les déploiements suivants repasseront par `migrate deploy`.",
  });
  return { ok: true };
}

/** Noms des migrations actuellement enregistrées en échec (finished_at IS NULL). */
async function failedMigrationsNow() {
  const client = new PrismaClient();
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at`,
    );
    return rows.map((row) => row.migration_name);
  } catch {
    return [];
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

/** Noms des migrations appliquées qui sont présentes dans le dépôt. */
async function appliedNamesNow() {
  const client = new PrismaClient();
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    return rows.map((row) => row.migration_name);
  } catch {
    return [];
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

async function main() {
  log(`provider=${provider} strict=${strict} dbPushFallback=${pushFallback} cli=${prismaCli ?? 'npx prisma'}`);

  if (provider !== 'postgresql') {
    // SQLite (dev / docker-compose) : base jetable, `db push` idempotent.
    const push = prisma(['db', 'push', '--skip-generate']);
    steps.push({ name: 'db-push', ok: push.ok });
    if (!push.ok) {
      warn(push.output.split('\n').slice(0, 12).join('\n'));
      writeStatus({ ok: false, degraded: !strict, mode: 'degraded', detail: '`prisma db push` (SQLite) en échec.' });
      process.exit(strict ? 1 : 0);
    }
    writeStatus({ ok: true, degraded: false, mode: 'db-push', detail: 'Schéma SQLite aligné (db push).' });
    return;
  }

  if (!(await waitForDatabase())) process.exit(1);

  // Garde-fou : sans dossier de migrations, `migrate deploy` ne peut rien faire
  // et le repli `db push --accept-data-loss` risquerait d'aligner une base de
  // production sans contrôle. On refuse explicitement (image incomplète).
  if (localMigrations().length === 0) {
    warn('prisma/migrations introuvable ou vide : arrêt par sécurité (image incomplète).');
    writeStatus({
      ok: false,
      degraded: false,
      fatal: true,
      mode: 'unreachable',
      detail: 'Dossier prisma/migrations absent de l’image : préparation de la base impossible.',
    });
    process.exit(1);
  }

  const status = await preparePostgres();

  if (status.ok) {
    log('base prête.');
    return;
  }

  if (strict) {
    warn('MIGRATIONS_STRICT=true → arrêt du conteneur (la base n’est pas à jour).');
    process.exit(1);
  }

  warn('la base n’est pas garantie à jour, mais le conteneur DÉMARRE (mode dégradé).');
  warn('vérifier `GET /api/v1/health` → `database.schema`, puis corriger la migration en cause.');
  warn('pour rétablir l’arrêt en cas d’échec : MIGRATIONS_STRICT=true.');
}

await main();
