import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from './prisma.js';

/**
 * État de la base tel qu'il est observé au démarrage par
 * `apps/api/scripts/db-migrate.mjs` (fichier écrit avant le lancement de l'API).
 *
 * Pourquoi : un échec de migration ne doit plus tuer le conteneur (il rendait
 * TOUS les déploiements Render impossibles, cf. incident du 2026-10-06). En
 * contrepartie, ce mode dégradé doit être VISIBLE : il l'est ici, via
 * `GET /api/v1/health` → `database.schema`.
 */
export type DbPrepStatus = {
  provider?: string;
  mode?: 'migrations' | 'db-push' | 'degraded' | 'migrations-failed' | 'unreachable';
  ok?: boolean;
  degraded?: boolean;
  detail?: string;
  at?: string;
};

const STATUS_FILE = process.env.DB_STATUS_FILE ?? join(tmpdir(), 'gawjaay-db-status.json');

/** Dernier état de préparation de la base, écrit par le script de démarrage. */
export function dbPrepStatus(): DbPrepStatus {
  try {
    return JSON.parse(readFileSync(STATUS_FILE, 'utf8')) as DbPrepStatus;
  } catch {
    // Dev local / fichier absent (API lancée sans le script de démarrage) :
    // l'état reste « inconnu » — aucune affirmation fausse n'est exposée.
    return {};
  }
}

/** `ok` (migrations à jour) | `degraded` (schéma non garanti) | `unknown`. */
export function dbSchemaState(): 'ok' | 'degraded' | 'unknown' {
  const prep = dbPrepStatus();
  if (prep.ok === true) return 'ok';
  if (prep.ok === false) return 'degraded';
  return 'unknown';
}

/**
 * Test réel de la base (borné dans le temps) : une réponse lente ne doit pas
 * transformer la sonde de disponibilité en échec de déploiement.
 */
export async function dbConnected(timeoutMs = 2000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('délai dépassé')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
