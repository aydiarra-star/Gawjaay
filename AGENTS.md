# GawJaay — notes pour les agents

SaaS multi-tenant (comptabilité + boutique + marketplace), monorepo npm workspaces.

## Structure
- `apps/api` — Express + Prisma + SQLite/PostgreSQL. **Source de vérité** : prix, stock, paiements, permissions, créances.
- `apps/web` — React 18 + Vite + React Router. SPA statique.
- `packages/shared` — types et helpers partagés (rôles, permissions).

## Règles produit non négociables
- **Aucune donnée fictive présentée comme réelle.** Un compte neuf affiche 0. Les jeux d'exemple sont étiquetés `DEMO` (`apps/api/prisma/seed*.ts`).
- **Isolation multi-tenant** via `x-organization-id` + table `Membership` (`apps/api/src/middleware/tenant.ts`). Le frontend n'est jamais la seule protection.
- Le serveur recalcule prix/stock/crédit ; jamais le navigateur.

## Commandes
```bash
npm run typecheck            # shared + api + web
npm test                     # tests API (unitaires + intégration, isolation incluse)
npm run build                # shared + api + web
npm run test:e2e             # Playwright (desktop + mobile) — nécessite un build E2E
```

## Frontend / déploiement
- URL publique : `https://aydiarra-star.github.io/Gawjaay/` (GitHub Pages, branche `gh-pages`, racine).
- **Le build Pages DOIT utiliser `VITE_BASE_PATH=/Gawjaay/`**, sinon les assets sont référencés à la racine et la page est **blanche**.
- URL de l'API résolue à l'exécution : `window.__GAWJAAY_CONFIG__.apiUrl` (`apps/web/public/config.js`) → `VITE_API_URL` → repli local (dev uniquement).
- `npm run connect:api -- https://<service>/api/v1` : écrit `config.js`, build avec le bon base, publie sur `gh-pages`.
- E2E : construire d'abord `VITE_API_URL=http://localhost:4000/api/v1 npm run build:e2e -w @gawjaay/web` (le `dist/` par défaut est un build Pages, non compatible E2E).

## CI / workflows
- Les fichiers `.github/workflows/` ne peuvent pas être poussés avec le jeton actuel (scope `workflow` manquant). Les modifications de workflow vont sur la branche `ci/workflow-config-guard`.
- `apps/web/scripts/verify-bundle.mjs` fait **échouer** tout build contenant `localhost`, `127.0.0.1` ou un runtime éphémère (`all-hands.dev`, `prod-runtime`).

## Backend en production
- Aucune API de production n'est branchée aujourd'hui (`config.js` publié avec `apiUrl` vide → message d'état honnête).
- Hébergement : `render.yaml` (API Docker + PostgreSQL) ou `docker-compose.yml` (VPS). GitHub Pages n'héberge **pas** l'API.
