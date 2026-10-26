import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Garde-fous sur la CHAÎNE DE DÉPLOIEMENT (Dockerfile, entrypoint, scripts).
 *
 * Incident du 2026-10-06 → 2026-10-13 : une migration refusée par PostgreSQL a
 * laissé une migration « en échec » dans `_prisma_migrations`. Résultat :
 * `prisma migrate deploy` échouait à chaque démarrage (erreur P3009), le
 * conteneur ne démarrait plus, TOUS les déploiements Render échouaient et l'API
 * restait figée sur une version antérieure — sans que le code applicatif soit
 * en cause.
 *
 * Ces tests s'exécutent sans base de données : ils vérifient la configuration
 * qui doit empêcher la répétition de cet incident.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(here, '..');
const repoRoot = path.join(apiRoot, '..', '..');

const read = (...segments: string[]) => readFileSync(path.join(...segments), 'utf8');

const entrypoint = read(apiRoot, 'docker-entrypoint.sh');
const dbMigrate = read(apiRoot, 'scripts', 'db-migrate.mjs');
const verifyClient = read(apiRoot, 'scripts', 'verify-prisma-client.mjs');
const dockerfile = read(repoRoot, 'Dockerfile');
const apiPackage = JSON.parse(read(apiRoot, 'package.json')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const appSource = read(apiRoot, 'src', 'app.ts');
const renderYaml = read(repoRoot, 'render.yaml');

describe('démarrage du conteneur (docker-entrypoint.sh)', () => {
  it('détermine le provider Prisma avant toute génération', () => {
    expect(entrypoint).toMatch(/set-db-provider\.mjs/);
  });

  it('garantit la présence du client Prisma (génération si nécessaire)', () => {
    expect(entrypoint).toMatch(/verify-prisma-client\.mjs[^\n]*--generate-if-needed/);
  });

  it('prépare la base via db-migrate.mjs puis lance l’API', () => {
    expect(entrypoint).toMatch(/node scripts\/db-migrate\.mjs/);
    expect(entrypoint).toMatch(/exec node dist\/server\.js/);
  });

  it('n’empêche pas le démarrage si le backfill (searchName) échoue', () => {
    // `set -e` + un backfill non protégé tuerait le conteneur : le backfill doit
    // être tolérant (base incomplète = mode dégradé, pas d'arrêt).
    expect(entrypoint).toMatch(/if ! node scripts\/backfill-search\.mjs/);
  });
});

describe('préparation de la base (scripts/db-migrate.mjs)', () => {
  it('répare les migrations enregistrées en échec (P3009) avant de redéployer', () => {
    expect(dbMigrate).toMatch(/rolled_back_at/);
    expect(dbMigrate).toMatch(/migrate', 'resolve', '--rolled-back'/);
  });

  it('prévoit le repli demandé `db push --accept-data-loss` si les migrations échouent', () => {
    expect(dbMigrate).toMatch(/'db', 'push', '--accept-data-loss'/);
    expect(dbMigrate).toMatch(/DB_PUSH_FALLBACK/);
  });

  it('n’arrête pas le conteneur sur un échec de migration (sauf MIGRATIONS_STRICT=true)', () => {
    expect(dbMigrate).toMatch(/MIGRATIONS_STRICT/);
    // Le dernier mot revient à `strict` : sans lui, sortie 0 (mode dégradé).
    expect(dbMigrate).toMatch(/process\.exit\(strict \? 1 : 0\)/);
  });

  it('reste fatal si la base est injoignable (l’API ne peut rien servir)', () => {
    expect(dbMigrate).toMatch(/INJOIGNABLE/);
    expect(dbMigrate).toMatch(/if \(!\(await waitForDatabase\(\)\)\) process\.exit\(1\)/);
  });

  it('publie son état pour la sonde /api/v1/health', () => {
    expect(dbMigrate).toMatch(/gawjaay-db-status\.json/);
    expect(dbMigrate).toMatch(/DB_STATUS_FILE/);
  });

  it('conserve la baseline `0_init` pour les bases créées par l’ancien `db push`', () => {
    expect(dbMigrate).toMatch(/'migrate', 'resolve', '--applied', '0_init'/);
  });
});

describe('client Prisma (scripts/verify-prisma-client.mjs)', () => {
  it('échoue quand le client est absent, périmé ou incohérent', () => {
    expect(verifyClient).toMatch(/client Prisma absent/);
    expect(verifyClient).toMatch(/client Prisma périmé/);
    expect(verifyClient).toMatch(/provider incohérent/);
    expect(verifyClient).toMatch(/process\.exit\(1\)/);
  });

  it('refuse un décalage entre le CLI prisma et @prisma/client', () => {
    expect(verifyClient).toMatch(/versions désynchronisées/);
    expect(verifyClient).toMatch(/cliVersion !== clientVersion/);
  });
});

describe('image Docker', () => {
  it('génère le client Prisma au BUILD pour le provider de production', () => {
    expect(dockerfile).toMatch(/ARG DATABASE_PROVIDER=postgresql/);
    expect(dockerfile).toMatch(/prisma generate --schema apps\/api\/prisma\/schema\.prisma/);
  });

  it('vérifie la génération pendant le build (échec immédiat si elle rate)', () => {
    expect(dockerfile).toMatch(/verify-prisma-client\.mjs[^\n]*\n?/);
  });

  it('n’installe plus un CLI Prisma épinglé à la main (cause du décalage de version)', () => {
    expect(dockerfile).not.toMatch(/--no-save prisma@/);
  });

  it('installe le CLI Prisma en production via le lockfile (dépendance, pas devDependency)', () => {
    expect(apiPackage.dependencies.prisma).toBeDefined();
    expect(apiPackage.devDependencies.prisma).toBeUndefined();
  });
});

describe('sonde de disponibilité', () => {
  it('reste 200 mais expose l’état de la base (mode dégradé visible)', () => {
    expect(appSource).toMatch(/'\/api\/v1\/health'/);
    expect(appSource).toMatch(/database:/);
    expect(appSource).toMatch(/schema: dbSchemaState\(\)/);
  });

  it('est bien la sonde configurée dans le blueprint Render', () => {
    expect(renderYaml).toMatch(/healthCheckPath: \/api\/v1\/health/);
    expect(renderYaml).toMatch(/value: postgresql/);
  });

  it('désactive le repli de schéma potentiellement destructif dans Render', () => {
    expect(renderYaml).toMatch(/- key: DB_PUSH_FALLBACK\\s+value: "false"/);
  });

  it('fait échouer le déploiement Render si les migrations ne sont pas prêtes', () => {
    expect(renderYaml).toMatch(/- key: MIGRATIONS_STRICT\\s+value: "true"/);
  });
});
