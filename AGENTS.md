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
- API de production (Render) : `https://gawjaay-api.onrender.com` — health `GET /api/v1/health` → 200 `{"status":"ok"}`. Service `gawjaay-api`, blueprint `render.yaml`, `autoDeploy: true` → tout merge sur `main` redéploie l'API.
- **Migrations = PostgreSQL uniquement** (`prisma/migrations/migration_lock.toml` → `provider = "postgresql"`). Le type SQLite `DATETIME` n'existe pas en PostgreSQL : une migration écrite en dialecte SQLite fait échouer `prisma migrate deploy` au démarrage du conteneur (`node scripts/db-migrate.mjs`), donc **le service ne démarre plus et tous les déploiements Render échouent en silence** (le trafic continue sur la version précédente). Incident réel du 2026-10-06 au 2026-10-13 : `20261007_m5_4_flash_offer` utilisait `DATETIME` → `ERROR: type "datetime" does not exist`, API figée sur la version du 2026-10-05. Utiliser `TIMESTAMP(3)`. Vérifications : `apps/api/test/migrations.test.ts` (dialecte, types, migrations additives) ; pour aller plus loin, appliquer les migrations séquentiellement sur un moteur PostgreSQL réel hors dépôt (ex. `@electric-sql/pglite`, WASM) avant de déployer.
- Après un merge sur `main`, contrôler l'état du déploiement Render (`gh api repos/<owner>/<repo>/deployments` puis `.../statuses`) : `state=failure` signifie presque toujours une migration refusée par PostgreSQL.
- **État au 2026-10-13 (après le merge `64f6a128`)** : Render n'a créé **aucune** entrée de déploiement `main - gawjaay-api` pour ce merge et `GET /api/v1/health` renvoie toujours la page « Render - Application loading » (dernier déploiement réussi : `25ca8b92`, 2026-10-05). Le correctif de migration est sur `main` : un **redéploiement manuel** du service `gawjaay-api` (Dashboard Render → « Manual Deploy » → latest commit) est nécessaire pour que l'API reparte ; l'autoDeploy doit être vérifié au passage.

## Inscription (comptes boutique & particulier)
- Deux profils au même formulaire : `BUSINESS` (compte → organisation → première boutique → dashboard) et `INDIVIDUAL` (compte → profil vendeur → espace vendeur). Un compte particulier n'a **ni organisation ni boutique** : c'est un parcours valide.
- **Champs facultatifs vides = chaîne vide** (et non clé absente) : l'API les normalise en « non fourni » (`emptyToUndefined` dans `apps/api/src/routes/auth.routes.ts`). Sans cette normalisation, l'inscription « particulier » était rejetée en 400 (`min(2)` sur des chaînes vides) et le compte n'était jamais créé.
- Messages d'erreur explicites : le serveur renvoie des messages français (`error.message` = messages du schéma zod, repli par code dans `apps/api/src/middleware/error.ts`) avec `details[]` (`path`, `message`) ; `RegisterPage` les affiche sous le champ concerné et surligne le champ (`aria-invalid`).
- Confirmation de création : `navigate('/app' | '/seller', { state: { accountCreated: true } })` + composant `SignupSuccess` (monté dans `AppLayout` et `SellerHubPage`). Aucun message de réussite n'est affiché si le serveur n'a pas créé le compte.
- Couverture : `apps/api/test/auth.test.ts` (particulier avec champs vides, boutique, messages explicites) et `apps/web/e2e/signup.spec.ts` (parcours réel desktop + mobile).
- Le frontend publié pointe l'API via `config.js` (`window.__GAWJAAY_CONFIG__.apiUrl`), écrit par `npm run connect:api -- <url>/api/v1`.
- **Photos produit et cross-origin** : Helmet pose `Cross-Origin-Resource-Policy: same-origin` par défaut, ce qui fait **bloquer** les images servies par l'API lorsqu'elles sont intégrées par le frontend Pages (origine différente → `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`). La route publique `GET /api/v1/public/products/:id/photo` pose donc explicitement `cross-origin` ; le reste demeure `same-origin`. Testé dans `apps/api/test/marketplace-m4.test.ts`.
- Hébergement : `render.yaml` (API Docker + PostgreSQL) ou `docker-compose.yml` (VPS). GitHub Pages n'héberge **pas** l'API.
- **Publication Pages** : `npm run connect:api` pousse sur `gh-pages` et exige un jeton Git **avec droit d'écriture**. Le jeton intégration fourni par défaut à l'agent est en **lecture seule** (403 « Resource not accessible by integration » sur `git push` et même sur l'API `refs`), donc l'agent ne peut pas publier ; la mise à jour de `gh-pages` doit être faite par un humain ou un jeton disposant du scope `contents: write`.

## Marketplace M4 — « Acheter » (parcours acheteur)
- Principe conservé : *« GawJaay donne l'information. L'acheteur décide. »* Aucun classement / score / note / « meilleure vente ».
- Backend : `Order.clientRequestId` (nullable) + index unique `(storeId, clientRequestId)` → **idempotence** (double clic / retry = une seule commande). Migration additive `20261006_marketplace_m4` (aucune suppression).
- Détail public : `GET /api/v1/public/products/:id` (offres réelles par boutique, variantes, prix résolu serveur ; jamais de coordonnées GPS, prix d'achat ni SKU). Service `getPublicProduct`.
- Commande acheteur : `POST /api/v1/me/orders` (prix recalculé serveur, dispo vérifiée, `clientRequestId` accepté), `GET /me/orders`, `GET /me/orders/:id` (+ `cancellable`), `POST /me/orders/:id/cancel`.
- Survendre : `applyStockChange` décrémente le stock de façon **atomique conditionnelle** (`updateMany` avec `quantity >= qty`) → jamais de stock négatif sous concurrence.
- Coordonnées boutique : `PATCH /stores/:id` accepte `latitude`/`longitude` **nullable** (retrait explicite possible). Jamais exposées publiquement.
- Web : pages `ProductDetailPage` (`/product/:id`), `CartPage` (`/cart`), `CheckoutPage` (`/checkout`), `MyOrdersPage` (`/orders`), `OrderDetailPage` (`/orders/:id`) ; `CartContext` (localStorage `gawjaay.cart`, **un seul magasin par panier**, le serveur reste l'autorité) ; `BuyerHeader`. CTA « Commander via WhatsApp » (contact direct, ne crée aucune commande GawJaay).
- Paiement : **aucun paiement en ligne** ; l'UI ne présente jamais une commande comme payée sans paiement réel (`payments` SUCCESSFUL).
- Tests : `apps/api/test/marketplace-m4.test.ts` (16) ; e2e `apps/web/e2e/buyer.spec.ts` (desktop + mobile).
- **Non déployé** : M4 (backend + frontend) n'est pas sur `main`/Render au moment de la connexion API. Le frontend M3 publié reste compatible avec l'API Render M3. Ne pas publier le frontend M4 avant le backend M4.

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
