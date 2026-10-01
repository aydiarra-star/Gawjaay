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
| **Paiements en ligne (Wave / Orange Money / carte)** | ❌ **Non connecté** — l'API répond volontairement `503` |
| Encaissement espèces & vente à crédit | ✅ Fonctionnel (interne, sans prestataire) |

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

## 3. Prérequis

- Node.js ≥ 20
- npm ≥ 10

## 4. Installation

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:push      # crée/maj la base SQLite (apps/api/prisma/dev.db)
npm run db:seed      # (optionnel) données de DÉMONSTRATION explicitement marquées DEMO
```

## 5. Développement

```bash
npm run dev:api      # API sur http://localhost:4000
npm run dev:web      # Frontend sur http://localhost:5173
```

## 6. Tests, typecheck et build

```bash
npm test             # tests API (vitest) — auth, isolation multi-tenant, métier
npm run typecheck    # shared + api + web
npm run build        # shared + api + web
```

Résultats vérifiés localement :

| Vérification | Commande | Résultat |
| --- | --- | --- |
| Typecheck API | `npm run typecheck -w @gawjaay/api` | ✅ PASS |
| Typecheck web | `npm run typecheck -w @gawjaay/web` | ✅ PASS |
| Tests unitaires/intégration API | `npm test` | ✅ 31/31 PASS |
| Build web (production) | `npm run build:web` | ✅ PASS |

## 7. Variables d'environnement

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

## 8. Déploiement

### Frontend — GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` construit `apps/web` et le publie sur GitHub Pages
à chaque push sur `main`. La SPA gère le rechargement direct des routes profondes
(`/app`, `/marketplace`, `/shop/...`) via `public/404.html` + restauration de route dans `index.html`.

- **URL publique** : `https://aydiarra-star.github.io/Gawjaay/`
- Pour pointer vers une API hébergée, définir la variable Actions `VITE_API_URL`
  (Settings → Secrets and variables → Actions → Variables).

> GitHub Pages n'héberge **que le frontend statique**. Il ne peut pas héberger l'API, la base de
> données ni l'authentification serveur.

### Backend — hébergement adapté (non fourni dans ce dépôt)

L'API Express + Prisma nécessite un hébergeur applicatif avec une base persistante
(ex. Render, Railway, Fly.io, VPS, ou un conteneur). Sans `VITE_API_URL` configurée, la version
GitHub Pages est une **vitrine frontend** : les écrans de données nécessitent une API joignable.

---

## 9. Structure de l'API

Base : `/api/v1`. Routes principales :

`auth`, `organizations`, `stores`, `products`, `categories`, `inventory`, `customers`,
`suppliers`, `purchases`, `sales`, `orders`, `deliveries`, `reports`, `users`, `subscriptions`,
`audit`, `payments`, `public` (marketplace/boutiques), `me` (commandes client).

`GET /api/v1/health` renvoie l'état du service.

---

## 10. Licence

Projet privé — tous droits réservés.
