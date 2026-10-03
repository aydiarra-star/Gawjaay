#!/usr/bin/env node
/**
 * Vérifie le bundle de production APRÈS le build :
 *  1. aucune référence au runtime temporaire All-Hands/OpenHands ;
 *  2. aucune API pointant vers localhost / 127.0.0.1.
 *
 * Échoue (exit 1) si l'une de ces conditions est violée, afin qu'un mauvais
 * build ne soit jamais publié. Exécuté uniquement sur un build production.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// `--allow-localhost` : utilisé pour les builds E2E (preview sur localhost).
// Les références à un runtime temporaire restent interdites dans tous les cas.
const allowLocalhost = process.argv.includes('--allow-localhost');

const FORBIDDEN = [
  { re: /all-hands\.dev/i, label: 'runtime temporaire all-hands.dev' },
  { re: /prod-runtime/i, label: 'runtime temporaire prod-runtime' },
  { re: /openhands/i, label: 'référence openhands' },
  ...(allowLocalhost
    ? []
    : [
        { re: /(^|[^.\w])localhost[:/]/i, label: 'localhost' },
        { re: /127\.0\.0\.1/, label: '127.0.0.1' },
      ]),
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk(dist);
} catch {
  console.error(`[verify-bundle] Dossier de build introuvable : ${dist}. Lancez d'abord « npm run build ».`);
  process.exit(1);
}

const violations = [];
for (const file of files) {
  if (!/\.(js|css|html|json)$/.test(file)) continue;
  const content = readFileSync(file, 'utf8');
  for (const { re, label } of FORBIDDEN) {
    if (re.test(content)) violations.push(`${file.replace(dist, 'dist')} → ${label}`);
  }
}

if (violations.length > 0) {
  console.error('[verify-bundle] ÉCHEC : le bundle de production contient des références interdites :');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(`[verify-bundle] OK — ${files.length} fichiers vérifiés, aucune référence interdite (temporaire/localhost).`);
