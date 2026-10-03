#!/usr/bin/env node
/**
 * Connecte le frontend GitHub Pages à une API GawJaay, en une commande.
 *
 *   node scripts/connect-api.mjs https://gawjaay-api.onrender.com/api/v1
 *
 * Effets :
 *   1. écrit l'URL dans apps/web/public/config.js (configuration d'EXÉCUTION) ;
 *   2. reconstruit le frontend (le bundle est vérifié : aucune référence
 *      temporaire / localhost) ;
 *   3. publie le dossier apps/web/dist sur la branche `gh-pages`.
 *
 * Aucun workflow GitHub Actions n'est requis, et aucune variable de dépôt n'a
 * besoin d'être modifiée : le site lit `config.js` à l'exécution.
 *
 * Pré-requis : pouvoir pousser sur le dépôt (jeton avec le droit d'écriture).
 */
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'apps', 'web', 'dist');

const raw = process.argv[2];
if (!raw) {
  console.error('Usage : node scripts/connect-api.mjs https://<service>.onrender.com/api/v1');
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error(`URL invalide : ${raw}`);
  process.exit(1);
}
if (url.protocol !== 'https:') {
  console.error('L’URL de l’API doit être en https.');
  process.exit(1);
}
const base = url.toString().replace(/\/$/, '');

// Garde-fou : jamais un hôte éphémère ni une boucle locale en production.
if (/all-hands\.dev|prod-runtime/i.test(base) || /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) {
  console.error('Refusé : cette URL désigne un runtime éphémère ou une adresse locale.');
  process.exit(1);
}

console.log(`→ API cible : ${base}`);

console.log('→ build du frontend…');
execSync('npm run build:web', { cwd: root, stdio: 'inherit' });

if (!existsSync(distDir)) {
  console.error('Le build n’a produit aucun dossier dist/. Abandon.');
  process.exit(1);
}

// La configuration est écrite dans le build déployé, pas dans les sources :
// le dépôt reste propre et `config.js` reste propre à chaque environnement.
writeFileSync(
  join(distDir, 'config.js'),
  `// Configuration d'exécution GawJaay — générée par scripts/connect-api.mjs.\n` +
    `// Pointe l'application vers l'API de production, sans reconstruire.\n` +
    `window.__GAWJAAY_CONFIG__ = { apiUrl: '${base}' };\n`,
);
console.log('→ dist/config.js pointé vers l’API');

if (process.argv.includes('--dry-run')) {
  console.log('→ [dry-run] build + config.js validés, aucune publication.');
  process.exit(0);
}

console.log('→ publication sur la branche gh-pages…');
const worktree = join(root, '.gh-pages-work');
rmSync(worktree, { recursive: true, force: true });
execSync('git fetch origin gh-pages --depth=1', { cwd: root, stdio: 'inherit' });
execSync(`git worktree add -f --detach ${worktree} origin/gh-pages`, { cwd: root, stdio: 'inherit' });

rmSync(join(worktree, 'assets'), { recursive: true, force: true });
for (const name of ['index.html', '404.html', 'favicon.svg', '.nojekyll', 'config.js']) {
  const src = join(distDir, name);
  if (existsSync(src)) cpSync(src, join(worktree, name));
}
cpSync(join(distDir, 'assets'), join(worktree, 'assets'), { recursive: true });

execSync('git add -A', { cwd: worktree, stdio: 'inherit' });
execSync(`git commit -m "deploy(web): connecte l'API ${url.hostname}"`, { cwd: worktree, stdio: 'inherit' });
execSync('git push origin HEAD:gh-pages', { cwd: worktree, stdio: 'inherit' });
execSync(`git worktree remove --force ${worktree}`, { cwd: root, stdio: 'inherit' });

console.log('\n✅ Déployé. GitHub Pages publie sous une minute.');
console.log('   Vérifiez : https://aydiarra-star.github.io/Gawjaay/');
