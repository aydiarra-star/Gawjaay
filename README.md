# GawJaay — Vendre vite. Gérer mieux.

Plateforme SaaS **multi-tenant** de gestion commerciale pensée pour les commerçants du Sénégal :
produits, stock, ventes (POS), clients, fournisseurs, achats, commandes en ligne, livraisons,
marketplace et tableau de bord.

> **Ce README est la source de vérité du dépôt.** Il décrit uniquement ce qui existe réellement.
> Aucune fonctionnalité n'est présentée comme disponible si elle ne l'est pas.

---

## 1. État réel du produit

| Domaine | État |
| --- | --- |
| Authentification (inscription, connexion, refresh, reset) | ✅ Fonctionnel (testé) |
| Isolation multi-tenant (organisation) | ✅ Fonctionnel (testé) |
| Produits & variantes | ✅ Fonctionnel |
| Stock (entrées, sorties, transferts, inventaire, historique) | ✅ Fonctionnel (testé) |
| Ventes / POS + crédit client | ✅ Fonctionnel (testé) |
| Clients & créances | ✅ Fonctionnel |
| Fournisseurs, achats & réceptions | ✅ Fonctionnel (testé) |
| Commandes en ligne (machine à états + stock) | ✅ Fonctionnel (testé) |
| Livraisons & livreurs | ✅ Fonctionnel |
| Tableau de bord & rapports (données réelles) | ✅ Fonctionnel (testé) |
| Boutique publique & marketplace | ✅ Fonctionnel (testé) |
| Abonnements (plans & limites côté serveur) | ✅ Fonctionnel — activation des plans **payants non connectée** |
| Encaissement **espèces, Wave, Orange Money, Free Money, Wizall** et vente à crédit | ✅ Fonctionnel (interne, sans prestataire) |
| **Paiement par carte bancaire en ligne** | ❌ **Non connecté** — l'API répond volontairement `503` |

**Aucune donnée fictive n'est présentée comme réelle.** Le tableau de bord affiche `0` tant
qu'aucune vente réelle n'existe. Le jeu de démonstration (`prisma/seed.ts`) est explicitement
préfixé `DEMO`.

---

## 2. Architecture (monorepo npm workspaces)

```
gawjaay/
├── apps/
│   ├── api/        API REST Express + Prisma (source de vérité métier)
│   └── web/        Frontend React + Vite (SPA)
├── packages/
│   └── shared/     Types, rôles, permissions, plans, machine à états (partagés)
├── .github/workflows/
│   ├── ci.yml            Typecheck + tests API + build web
│   └── deploy-pages.yml  Déploiement du frontend sur GitHub Pages
└── tsconfig.base.json
```

### Répartition des responsabilités

- **`apps/api`** — seule source de vérité pour les **prix, le stock, les paiements, les
  permissions et l'isolation des organisations**. Le frontend n'est jamais une barrière de sécurité.
- **`packages/shared`** — logique pure réutilisable (rôles, permissions, statuts, plans, devise XOF).
- **`apps/web`** — interface React. Consomme l'API via `VITE_API_URL`.

### Modèle de sécurité

- Authentification par **JWT** (access + refresh révocables, `RefreshToken` en base).
- **Isolation multi-tenant** : chaque requête métier porte un en-tête `x-organization-id`,
  vérifié par le middleware `requireOrganization` contre les `Membership` de l'utilisateur.
  Une organisation ne peut jamais lire ni modifier les données d'une autre (couvert par
  `test/tenant-isolation.test.ts`).
- **Permissions par rôle** (`OWNER`, `ADMIN`, `MANAGER`, `VENDEUR`, `STOCK`) appliquées côté serveur.
- Mots de passe hachés (bcrypt), secrets JWT refusés s'ils sont faibles en production.
- Limitation de débit globale (`express-rate-limit`), en-têtes `helmet`, CORS restreint.

---

## 3. Interface & design system (2026)

L'interface est un « Commerce OS » qui réunit trois univers dans une identité unique :
**Marketplace** (découverte, plus visuelle), **Boutique** (opérations, plus dense) et
**Comptabilité** (analyse, plus analytique). La cohérence vient d'un design system partagé,
aujourd'hui décliné dans une identité « **Teranga** » : vert émeraude profond, or métallique
et orange vif, inspirée de l'hospitalité sénégalaise.

- **Tokens** (`apps/web/src/styles.css`) : fonds ivoire/sable, **vert émeraude** (navigation,
  surfaces de marque), **or métallique** (badges promo, étoiles, bordures de luxe), **orange vif**
  (CTA principaux, bannières phares) ; échelle d'espacement 4pt, rayons et élévations cohérents.
- **Icônes** (`apps/web/src/components/icons.tsx`) : jeu de 30 icônes SVG monochromes (traits
  1.6px), remplaçant les emojis pour un rendu net et professionnel.
- **Composants** (`apps/web/src/components/ui.tsx`) : `PageHead`, `Section`, `Card`, `Stat`,
  `Alert`, `Spinner`, `SkeletonGrid`, `EmptyState`, `SearchField`, `StatusBadge`, `Avatar`, `Chips`.
- **Composants premium** (`apps/web/src/components/premium.tsx`) : `TerangaBanner` (bannière
  dégradée émeraude → or → orange), `Stars` (notation en étoiles dorées), `ProductDownloadButton`
  (fiche produit téléchargeable, générée depuis les données réelles du serveur).
- **Navigation** : sidebar groupée par univers sur desktop, barre inférieure « au pouce » sur mobile.
- **Motion** : transitions courtes et intentionnelles ; `prefers-reduced-motion` respecté.
- **Chiffres financiers** : chiffres tabulaires, hiérarchie forte (montant héros → KPI → détail).

Règle maintenue : **aucune donnée inventée**. Les états vides, les zéros et les jeux de
démonstration (`DEMO`) restent explicites. Le bouton de téléchargement produit une fiche
textuelle reprenant les données fournies par le serveur (nom, prix, stock, boutique) — aucune
valeur n'est fabriquée côté navigateur.

---

## 4. Prérequis

- Node.js ≥ 20
- npm ≥ 10

## 5. Installation

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:push      # crée/maj la base SQLite (apps/api/prisma/dev.db)
npm run db:seed      # (optionnel) données de DÉMONSTRATION explicitement marquées DEMO
```

## 6. Développement

```bash
npm run dev:api      # API sur http://localhost:4000
npm run dev:web      # Frontend sur http://localhost:5173
```

## 7. Tests, typecheck et build

```bash
npm test             # tests API (vitest) — auth, isolation multi-tenant, métier
npm run typecheck    # shared + api + web
npm run build        # shared + api + web
npm run test:e2e     # E2E Playwright (desktop + mobile) — démarre API + preview web
```

Résultats vérifiés localement :

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Typecheck API | `npm run typecheck -w @gawjaay/api` | ✅ PASS |
| Typecheck web | `npm run typecheck -w @gawjaay/web` | ✅ PASS |
| Tests unitaires/intégration API | `npm test` | ✅ 32/32 PASS |
| E2E (desktop + mobile) | `npm run test:e2e` | ✅ 12/12 PASS |
| Build web (production) | `npm run build:web` | ✅ PASS |

## 8. Variables d'environnement

**API** (`apps/api/.env`) :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Chaîne de connexion Prisma (SQLite en dev) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets de signature (≥ 32 caractères en production) |
| `FRONTEND_URL` | Origine(s) autorisée(s) par CORS (séparées par des virgules) |
| `PAYMENTS_MODE` | `disabled` (défaut). `enabled` est **refusé** tant qu'aucun prestataire n'est connecté |

**Web** (au build) :

| Variable | Rôle |
| --- | --- |
| `VITE_API_URL` | URL publique de l'API (ex. `https://api.exemple.sn/api/v1`) |
| `VITE_BASE_PATH` | Base d'hébergement (ex. `/Gawjaay/` sur GitHub Pages) |

---

## 9. Déploiement

### Frontend — GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` construit `apps/web` et le publie sur GitHub Pages
à chaque push sur `main`. La SPA gère le rechargement direct des routes profondes
(`/app`, `/marketplace`, `/shop/...`) via `public/404.html` + restauration de route dans `index.html`.

- **URL publique** : `https://aydiarra-star.github.io/Gawjaay/`
- Pour pointer vers une API hébergée, définir la variable Actions `VITE_API_URL`
  (Settings → Secrets and variables → Actions → Variables). La valeur actuellement
  configurée pointe vers l'API du bac à sable de développement
  (`https://work-1-...prod-runtime.all-hands.dev/api/v1`) ; elle doit être remplacée
  par l'URL d'un hébergeur persistant (voir ci-dessous) pour une production réelle.

> GitHub Pages n'héberge **que le frontend statique**. Il ne peut pas héberger l'API, la base de
> données ni l'authentification serveur.

### Backend — hébergement persistant (recommandé)

L'API Express + Prisma nécessite un hébergeur applicatif avec une base persistante. Un
déploiement prêt à l'emploi est fourni (`Dockerfile` + `docker-compose.yml`) : l'API et sa base
SQLite tournent sur un **volume persistant**, ce qui évite les coupures d'un serveur éphémère.

```bash
# À la racine du dépôt :
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export FRONTEND_URL="https://aydiarra-star.github.io"
docker compose up -d --build      # API sur http://localhost:4000/api/v1
```

Puis pointer le frontend vers cette API en définissant la variable Actions `VITE_API_URL`
(ex. `https://api.mondomaine.sn/api/v1`) : le frontend GitHub Pages consomme alors le backend
persistant. Testé localement : inscription `201`, redémarrage du conteneur, puis connexion `200`
avec le compte créé **avant** le redémarrage (données conservées sur le volume `gawjaay-data`).

> **Environnement de développement / bac à sable** : pour garder l'API en marche (le processus
> peut être récolté quand la commande qui l'a lancée se termine), lancer le superviseur :
> `scripts/serve-api.sh` (redémarre l'API si elle s'arrête, journal dans `/tmp/gawjaay-api.log`).
> Cela ne remplace pas un hébergeur de production persistant.

---

## 10. Structure de l'API

Base : `/api/v1`. Routes principales :

`auth`, `organizations`, `stores`, `products`, `categories`, `inventory`, `customers`,
`suppliers`, `purchases`, `sales`, `orders`, `deliveries`, `reports`, `users`, `subscriptions`,
`audit`, `payments`, `public` (marketplace/boutiques), `me` (commandes client).

`GET /api/v1/health` renvoie l'état du service.

---

## 11. Moyens de paiement (Sénégal)

| Moyen | Encaissable | Comment |
| --- | --- | --- |
| Espèces | ✅ | Saisie directe au POS |
| **Wave** | ✅ | Le commerçant reçoit le transfert, puis saisit le règlement |
| **Orange Money** | ✅ | Idem |
| **Free Money** | ✅ | Idem |
| **Wizall Money** | ✅ | Idem |
| Crédit (à terme) | ✅ | Créance suivie côté serveur |
| Carte bancaire en ligne | ❌ | Nécessite un prestataire (PSP) non connecté — `503` |

Principe : GawJaay est la **caisse et la comptabilité**. Le mobile money est encaissé par le
commerçant sur son téléphone, puis **enregistré** comme règlement (méthode + montant) ; le solde,
la créance et les rapports sont tenus par le serveur. Aucune commission n'est prélevée et aucune
connexion à un PSP n'est simulée.

`GET /api/v1/payments/capabilities` renvoie, pour chaque moyen, `available` et `mode`
(`manual` ou `online`). L'interface n'affiche jamais un bouton de paiement en ligne non connecté.

## 12. Licence

Projet privé — tous droits réservés.
