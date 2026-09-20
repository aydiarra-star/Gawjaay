/**
 * Copie les assets d'exécution non compilés par TypeScript vers `dist/`.
 *
 * `tsc` n'émet que les fichiers `.ts` : le worker PostgreSQL (`postgresWorker.cjs`, chargé par
 * `new Worker(path.resolve(__dirname, 'postgresWorker.cjs'))`) serait absent de `dist/lib/` et
 * l'application planterait au démarrage avec `DATABASE_URL=postgres://...`.
 *
 * Appelé automatiquement par `npm run build`.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const assets = [['src/lib/postgresWorker.cjs', 'dist/lib/postgresWorker.cjs']];

let copied = 0;
for (const [from, to] of assets) {
  const src = path.join(root, from);
  const dst = path.join(root, to);
  if (!fs.existsSync(src)) {
    console.error(`[copy-assets] MANQUANT : ${from}`);
    process.exitCode = 1;
    continue;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied++;
  console.log(`[copy-assets] ${from} → ${to}`);
}
if (copied === assets.length) console.log('[copy-assets] OK');
