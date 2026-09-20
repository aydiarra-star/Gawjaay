# GawJaay — Audit V3 (Phase 1) — état mesuré du dépôt vs cahier des charges

**Base auditée :** `main` = `8935e38` (contient `f62f6b0`) · Baseline mesurée avant toute modification :

| Vérification | Résultat |
|---|---|
| `npx vitest run` (SQLite) | **365/365** (17 fichiers) |
| `TEST_DATABASE_URL=postgresql://… npx vitest run` (PostgreSQL 16.6 réel) | **365/365** |
| `tsc --noEmit` backend / frontend | OK / OK |
| `npm run build` backend / `vite build` frontend | OK / OK |
| `scripts/verify-deploy-path.mjs` (deploy/postgres/*.sql → API) | VÉRIFIÉ |
| CI GitHub (`CI Tests`, `E2E Playwright`) sur `8935e38` | success / success |

> Méthode : lecture de chaque module (`routes` → `controller` → `service`), des middlewares, des migrations,
> des tests et du frontend ; chaque manque ci-dessous a été **constaté dans le code**, pas supposé.

## 1. Ce qui existe et est suffisamment terminé (ne pas reconstruire)

- Auth JWT access + refresh (cookie httpOnly), bcrypt 12, rate-limit login, audit logs.
- RBAC (`authorize`, `requirePermission` resource:action pour EMPLOYEE), `assertStoreAccess`.
- Multi-boutiques, storeIds relus en base, idempotence `(key, endpoint, userId)`.
- Produits, stock (mouvements, seuils, alertes), ventes POS (promo/coupon/fidélité serveur), commandes
  (machine à états), paiements sandbox (webhook HMAC), livraisons V1+V2 (livreurs, OTP, preuves),
  promotions, coupons, avis vérifiés + modération + signalements, fidélité, favoris, B2B (catalogues,
  commandes pro, réappro), inventaires, codes-barres, analytics, exports CSV, assistant IA déterministe
  (« Je ne dispose pas de cette information »), notifications internes, admin (users/stores/orders/audit).
- Runtime PostgreSQL réel (adapter synchrone, worker `pg`), migrations versionnées 001→008, backup/restore.

## 2. Failles et manques constatés (à corriger en V3)

### 2.1 Sécurité / multi-tenant (IDOR-BOLA) — constatés dans le code
| # | Constat | Fichier |
|---|---|---|
| S1 | `GET /debts/store/:storeId`, `GET /debts/:id`, `POST /debts/:id/pay` : **aucun** contrôle tenant/rôle (un CLIENT peut lister/payer les dettes de n'importe quelle boutique) | `modules/debts/*` |
| S2 | `POST /employees/store/:storeId`, `GET …`, `PATCH /:id/permissions`, `POST /:id/deactivate` : **aucun** contrôle que la boutique / l'employé appartient au marchand connecté | `modules/employees/*` |
| S3 | `POST /suppliers/:id/receive` : storeId, supplierId et produits non vérifiés → écriture de stock **dans la boutique d'un autre tenant** ; quantités négatives acceptées | `modules/suppliers/*` |
| S4 | `GET /sales/:id` : pas de contrôle tenant | `modules/sales/controller.ts` |
| S5 | `PATCH /orders/:id/status` : un CLIENT peut **confirmer / livrer** (donc gagner des points) n'importe quelle commande et annuler celles d'autres clients (aucun `assertOwnOrder`, aucune restriction de transition par rôle) | `modules/orders/service.ts` |
| S6 | `POST /products/store/:storeId` : le garde-fou saute pour un EMPLOYEE (condition `&& req.user.merchantId`) → création dans une autre boutique | `modules/products/controller.ts` |
| S7 | `POST /regions/seed` public (sans auth) | `modules/regions/routes.ts` |
| S8 | Validation Zod : schémas définis (`utils/validators.ts`) mais **utilisés uniquement** sur register/login. Toutes les autres écritures acceptent n'importe quoi (quantités négatives → **stock augmenté** par une « vente », montants texte, etc.) | tous les controllers |
| S9 | Cookie refresh `secure: false` même en production ; `refresh` n'exclut pas un compte désactivé ; pas de rotation | `modules/auth/*` |
| S10 | Paiements sandbox : `verify()` renvoie SUCCESS sans fournisseur réel → en production sans contrat, un client pourrait « confirmer » son paiement. Aucun garde-fou d'environnement | `modules/payments/service.ts` |
| S11 | Aucune transaction SQL sur les écritures multi-tables (vente, commande, réception fournisseur, paiement dette) → écritures partielles possibles en cas d'erreur | services |
| S12 | Livraison legacy `PATCH /deliveries/:id/status` : statut libre (aucune énumération) | `modules/deliveries/service.ts` |
| S13 | Produits hors ligne / inactifs visibles publiquement via `GET /products/store/:id` et `GET /products/:id` pour un anonyme | `modules/products/*` |

### 2.2 Fonctionnel (cahier des charges)
| # | Constat | Réf. cahier |
|---|---|---|
| F1 | Aucun module **catégories** (ni liste publique ni gestion admin) alors que produits/marketplace référencent `categoryId` | §8, §17, §31 |
| F2 | `PUT /stores/:id` ignore région/département/commune/coordonnées/catégorie/logo/email/zones/délai | §7 |
| F3 | Fournisseurs : pas de modification, pas de fiche (historique d'achats, produits associés), `notes` non persistées | §13 |
| F4 | Marketplace : le contrôleur **ignore** `minPrice/maxPrice/promo/sort/inStock/store` envoyés par le frontend ; recherche boutiques sans catégorie/région/distance | §17 |
| F5 | Commandes : pas d'état **REJECTED** ; libellés anglais du cahier non acceptés (canonique français conservé) | §18 |
| F6 | `createOrder` n'applique pas `allowDelivery` / `allowPickup` de la boutique | §16, §19 |
| F7 | Régions : 14 régions OK mais départements partiels/inexacts (Guédiawaye en commune de Pikine) — 46 départements officiels attendus | §29 |
| F8 | Notifications : aucune abstraction de canal (email/SMS/WhatsApp/push) | §23 |
| F9 | Clients : `GET /customers/:id` inconnu → `200 null` | §12 |
| F10 | Frontend : liens **cassés** vers `/merchant/store/:id/expenses` et `/employees` (routes inexistantes) ; aucune page fournisseurs, paramètres boutique (horaires, contact, adresse, statut), édition produit, création client ; vitrine sans QR code, horaires ni contact ; identifiants pré-remplis sur la page de connexion ; navigation non responsive ; EMPLOYEE/DRIVER mal redirigés après connexion | §16, §32 |

### 2.3 Performance / exploitation
| # | Constat |
|---|---|
| P1 | N+1 : `orders.listOrders` (4 requêtes par commande), `regions.listRegions`, `admin.listStores/listOrders`, `deliveries.listDeliveries` |
| P2 | Index manquants sur clés étrangères très sollicitées : `debts(customerId)`, `customers(storeId)`, `expenses(storeId,date)`, `sale_items(saleId)`, `order_items(orderId)`, `payments(orderId)`, `employees(storeId)` |

## 3. Décisions V3
- Corrections **additives** uniquement : aucune table V1/V2 modifiée destructivement, aucun test supprimé.
- Statuts de commande : canonique français conservé (données, tests, UI) + **alias anglais acceptés** en entrée
  et `statusCode` anglais exposé en sortie ; nouvel état `REJETEE` (`REJECTED`).
- Paiements : `PAYMENTS_MODE` (`sandbox` | `disabled`) — en production, `sandbox` est **refusé au démarrage**
  (fail-fast) ; par défaut `disabled` → WAVE/ORANGE_MONEY/CARD répondent 503, seul CASH (encaissement confirmé
  par le marchand, `POST /payments/:id/confirm-cash`) est possible : **NOT CONNECTED TO PRODUCTION PAYMENT PROVIDER**.
- Notifications externes : registre de canaux avec `INTERNAL` seul actif ; `EMAIL/SMS/WHATSAPP/PUSH`
  déclarés **NOT_CONNECTED** (jamais marqués envoyés).

## 4. Suivi des correctifs (Phase 2 — durcissement backend)

| # | Correctif | Preuve (test) |
|---|---|---|
| S1–S4, S6, S7 | `assertStoreAccess` sur dettes / employés / réceptions fournisseur / `GET /sales/:id` / produits (EMPLOYEE) ; seed régions ADMIN | `v3-security.test.ts` §S6/S7/S8, §S11 |
| S5 | `orders.updateStatus` : CLIENT = sa commande, `EN_ATTENTE → ANNULEE` uniquement ; MERCHANT/EMPLOYEE = leurs boutiques ; EMPLOYEE requiert `orders:update` | §S9 |
| S8 | `lib/validate.ts#parseOrThrow` + schémas Zod branchés sur stores, products, inventory, sales, orders, customers, debts, suppliers, expenses, employees, payments, auth ; `errorHandler` → 400 `{error, details}` (JSON malformé inclus) | §S1 |
| S9 | Cookie refresh `secure` en production ; `refresh` révoque les sessions d'un compte désactivé (403) | §S10 |
| S10 | `PAYMENTS_MODE` + `paymentCapabilities()` + `confirmCash` (marchand uniquement) ; `verify` idempotent ; webhook `timingSafeEqual` | §S12 |
| S11 | `lib/transaction.ts#withTransaction` (BEGIN/COMMIT/ROLLBACK synchrone, imbrication) sur ventes, commandes (création + statut), ajustements de stock, réceptions fournisseur, dettes, employés, paiements | §T1 |
| S12 | Livraison legacy : enum + `canTransitionDelivery` + commande avancée **via** la machine à états (plus de `LIVREE` forcé) | §S9 (legacy) |
| S13 | Public : produits `isOnline=1 AND isActive=1` uniquement ; `toPublicStore` / `toPublicProduct` (aucun `merchantId`, `costPrice`) | §S13 |
| F2, F5, F6, F7 | `PUT /stores/:id` étendu + cohérence géographique ; `REJETEE` + alias anglais + `statusCode` + `allowedTransitions` ; `allowDelivery/allowPickup` ; 46 départements | §S1, §S9, §S11 |
| F9 | `GET /customers/:id` inconnu → 404 | (couvert par phase-finale §9 : 403/404) |
| P1 | `listOrders`, `listRegions`, `listDeliveries`, `listEmployees`, `listPayments` sans N+1 | — |
| F1 | Module `categories` (référentiel ADMIN, compteurs réels, 409 si utilisée) + migration 009 | `v3-features.test.ts` §F1, §P2 |
| F4 | Marketplace : filtres transmis, proximité Haversine réelle (`lib/geo.ts`), projection publique | §F4 |
| F8 | `notifications/channels.ts` : INTERNAL actif, EMAIL/SMS/WHATSAPP/PUSH `NOT_CONNECTED` (jamais simulés) | §F8 |
| P2 | Migration 009 : 9 index FK (SQLite + PostgreSQL, chemin déploiement 118 index vérifié) | §P2, `verify-deploy-path.mjs` |
| S9 (suite) | Rotation des refresh tokens + détection de rejeu (`REFRESH_REUSE_DETECTED`) | `v3-security.test.ts` §S10 |
| S10 (suite) | `PAYMENTS_MODE=disabled` : WAVE/OM/CARD → **503** explicite (le build de production renvoyait 500 : corrigé dans `errorHandler`) | `v3-payments-disabled.test.ts` |
| Règle pagination | `take` plafonné à 50 sur toutes les listes paginées | — |
| F10 | Frontend : routes `expenses` / `employees` / `suppliers` / `settings` + pages (dépenses, employés & permissions depuis le catalogue serveur, fournisseurs & réceptions, paramètres boutique : contact, horaires, région→département→commune, GPS, livraison/retrait, moyens de paiement annoncés, ouverture) ; édition produit (catégorie, SKU, code-barres, seuil, en ligne/actif) ; création client ; ajustement de stock par ligne ; commandes marchand pilotées par `allowedTransitions` (+ `REJETEE`, motif, encaissement espèces) ; commandes client : `payments/capabilities` (aucun bouton mobile si non connecté, mention « NON CONNECTÉ »), frise de statut, annulation selon `allowedTransitions` ; vitrine : QR code (`qrcode.react`), horaires, contact, catégories réelles, modes de commande selon la boutique, rupture affichée ; marketplace : catégorie, région, rayon, distance serveur ; connexion sans identifiants pré-remplis, redirection EMPLOYEE→`/merchant`, DRIVER→`/driver` ; navigation responsive (menu mobile) ; intercepteur 401 sans redirection pour les visiteurs anonymes | Playwright E2E (CI) + harnais DOM local (happy-dom contre l'API seedée, 22 vérifications) |
| Référentiel | `lib/referenceData.ts#ensureReferenceData` : les 14 régions / 46 départements / communes sont chargés au démarrage du serveur si absents (base de production vierge) | `v3-features.test.ts` §P2 |
| API commandes | `GET /orders` (liste) renvoie `client {id, phone}` (jamais côté CLIENT) et `allowedTransitions` par rôle ; `POST /orders` et `PATCH /orders/:id/status` renvoient aussi `allowedTransitions` | `v3-security.test.ts` §S9 |

## 5. État final (mesuré, au 20/09/2026 — voir `docs/V3_FINAL_REPORT.md`)

- **Documentation d'exploitation** : FAIT — `PAYMENTS_MODE` documenté dans `deploy/.env.production.example`,
  `deploy/DEPLOYMENT.md` §5 (« NOT CONNECTED TO PRODUCTION PAYMENT PROVIDER »), `docs/PRODUCTION_RUNBOOK.md`,
  `README.md` §20 ; migrations 001→009 et référentiel au démarrage documentés.
- **Sauvegarde / restauration** : REJOUÉ pour de vrai sur PostgreSQL 16.6 avec des données produites en mode production
  (54 tables, 479 lignes ; restauration vérifiée ; API sur base restaurée identique à la source) — `docs/BACKUP_RESTORE.md` §2.3.
- **E2E Playwright** : 13 parcours (8 d'origine + 5 V3 : vitrine + commande, suivi/annulation client sans paiement fictif,
  proximité Haversine + rayon, paramètres boutique → vitrine + dépense, employé créé/connexion/isolation) — verts en CI
  (Chromium réel, Pixel 7 + desktop). Localement, harnais happy-dom (22 vérifications) faute de navigateur téléchargeable.
- **Frontend, volontairement hors périmètre** : édition des livreurs/permissions avancées, upload d'images produit
  (aucun stockage de fichiers connecté), tableau de bord temps réel.
