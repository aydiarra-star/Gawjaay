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

## Produit / Stock (expérience marchand)
- **Produit ≠ stock.** Le produit est « ce que je vends » ; le stock « ce que je possède ». Toute variation de stock passe par un mouvement `InventoryMovement` (jamais un simple nombre modifié).
- Conditionnements : liste fermée dans `packages/shared/src/packaging.ts` (`PACKAGING_TYPES`, `PACKAGING_LABELS`, `formatPackaging`, `packagingLine`). `Product.packaging` + `Product.format` (ex. `sac` + `50 kg`).
- Seuil d'alerte : `Product.alertThreshold` (produit) ; `ProductVariant.lowStockThreshold` (variante, 0 = repli sur le produit). États exposés par `/inventory` : `low`, `out`.
- Photos : **pas de filesystem éphémère** (Render Free). La photo est une data-URI base64 persistée en base (`Product.imageData` / `imageMime`), bornée par `MAX_IMAGE_BYTES` (~700 Ko) et validée côté serveur (`packages/shared/src/media.ts` + `apps/api/src/lib/media.ts`). `imageUrl` reste prioritaire si un hébergement externe est branché un jour.
  - Route marchande protégée : `GET/PUT/DELETE /api/v1/products/:id/photo` (en-tête `x-organization-id`). Le front la charge via `ProductThumb` (fetch + blob, cache par produit), car `<img>` ne peut pas porter l'en-tête.
  - Route publique (marketplace/vitrine) : `GET /api/v1/public/products/:id/photo` — ne sert que si produit actif + `marketplaceVisible` + stock public. Le front l'utilise via `PublicProductImage`.
- Parcours marchand : `POST /products/merchant` (produit + stock initial `INITIAL` en une transaction), `POST /products/:id/stock` (`ENTRY`), `POST /products/:id/sale` (vente rapide, prix recalculé serveur via `createSale`).
- Images côté web : `apps/web/src/lib/image.ts` (`prepareProductImage` redimensionne à 1280 px et compresse en JPEG avant envoi).
- Les données de démo restent étiquetées `DEMO` (`prisma/seed*.ts`) ; aucun chiffre fictif n'est présenté comme réel.
