import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Prépare une base SQLite de test dédiée avant l'exécution des tests.
 * Réinitialise le schéma à partir du fichier Prisma (moteur réel).
 */
export default function setup() {
  const apiRoot = path.resolve(__dirname, '..');
  const dbPath = path.join(apiRoot, 'prisma', 'test.db');
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-journal`, { force: true });

  execSync('npx prisma db push --force-reset --skip-generate', {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  });
}
