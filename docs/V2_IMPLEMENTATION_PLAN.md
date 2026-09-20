# GawJaay V2 — Plan d'implémentation

> Généré après PHASE 0 — AUDIT du repository existant.
> Règle n°1 : **NE PAS CASSER LA V1.**

---

## 1. Architecture actuelle (constaté, à jour du commit `6c96ea8`)

| Couche | Réalité du dépôt |
|---|---|
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind 3 + Zustand + React Router 6. Pages : Login/Register, merchant Dashboard + StorePages (sales/orders/inventory/customers), client Marketplace/StorePublic/Orders, Admin. Build OK. |
| Backend | Node 22 + Express 4 + TypeScript strict. `src/index.ts` (app + listen), `src/routes/index.ts` (montage modules), modules `service/controller/routes`. Build OK. |
| Base de données | **SQLite via `node:sqlite`** (fichier `backend/dev.db`, WAL, FK ON). ⚠️ Le cahier des charges mentionne PostgreSQL et `prisma/schema.prisma` existe, mais **la couche réelle est `src/lib/db.ts`** (SQL brut, `db.prepare`). Prisma n'est pas utilisé à l'exécution. |
| Auth | JWT access + refresh (cookie httpOnly), bcrypt 12, sessions table. |
| RBAC | Rôles CLIENT / MERCHANT / EMPLOYEE / ADMIN + permissions fines `resource:action` pour EMPLOYEE (`middlewares/rbac.ts`). |
| Multi-tenant | Isolation par `merchantId` / `storeIds` vérifiée dans les services (`ensureStoreOwnership`, filtres SQL). |
| Modules V1 | auth, stores, products, inventory (movements), sales, customers, debts, suppliers/purchases, expenses, dashboard, orders (machine à états), payments (webhook HMAC + idempotence), deliveries (basique), marketplace, notifications, employees, admin, regions. |
| Schéma DB | `initDb()` = `CREATE TABLE IF NOT EXISTS` (users, sessions, merchants, regions/departments/communes, stores, categories, products, inventories, inventory_movements, customers, suppliers, purchases(+items), sales(+items), debts(+payments), expenses, addresses, orders(+items), payments, deliveries, employees, notifications, reviews (partiel, sans module), disputes, audit_logs). |
| Migrations | ⚠️ Aucune migration versionnée — schéma créé idempotemment au boot. |
| Tests | 3 fichiers vitest (auth 3, payments 1, stock 2) = **6 tests PASS**. ⚠️ Le cahier annonce une baseline 22/22 · 67/67 · 37/37 qui **n'existe pas dans le dépôt**. |
| CI/CD | `.github/workflows/deploy.yml` (deploy). Pas de job de test. |
| Monitoring | Helmet, rate-limit global 100 req/min, CORS, audit_logs. Pas de Sentry configuré. |
| Docker | docker-compose (db postgres:15 non utilisé par l'API, api, frontend). |

### Décision architecture (justifiée)
- **Conserver SQLite/node:sqlite** pour V2 : remplacer par PostgreSQL casserait la V1 sans nécessité démontrée ici. Toute la couche V2 est écrite en **SQL portable** (pas de spécificités SQLite) pour permettre une bascule Postgres ultérieure. `docker-compose` garde Postgres dispo pour cette bascule.
- **Conserver la structure modulaire** service/controller/routes + middlewares existants (auth/rbac/tenant/audit).
- **Introduire un runner de migrations versionnées** (table `_migrations`) appliqué au démarrage, sans modifier destructivement les tables V1.

## 2. Dépendances identifiées (points d'ancrage V2)

- Prix serveur : `orders/service.ts` et `sales/service.ts` calculent les totaux → c'est ici que promotions/coupons doivent être appliqués **côté serveur uniquement**.
- Stock : `inventories` + `inventory_movements` via `adjustStock` → inventaires et B2B doivent passer par ce canal.
- Machine à états commande : `canTransition()` dans `orders/service.ts` → base pour commandes B2B et livraison.
- Tenant : `req.user.storeIds/merchantId` + `ensureStoreOwnership` → obligation pour tout nouveau module.
- Avis : table `reviews` existe (V1, sans module/API) → V2 l'enrichit en backward-compatible (colonnes ajoutées par migration, pas de drop).
- Notifications : table + service V1 → canaux V2 (in-app d'abord).

## 3. Risques

1. **Baseline annoncée absente** → reconstruire une baseline réelle : tests unitaires (22+), DB E2E (V1), API E2E (V1) avant tout code V2.
2. **Double usage de `reviews`** → migration additive avec valeurs par défaut, aucun ALTER destructif.
3. **Concurrency SQLite** → écritures de stock dans une transaction immédiate (`BEGIN IMMEDIATE`) et re-lecture dans la transaction.
4. **Front V1 à ne pas dégrader** → V2 = nouveaux onglets/pages + routes dédiées, aucune réécriture des pages V1.
5. **IA** → jamais connectée en direct à un LLM inventeur : moteur d'intentions déterministe branché sur les services/API réels ; réponses « Je ne dispose pas de cette information » si donnée absente. Actions sensibles = `ai_action_requests` avec confirmation explicite.

## 4. Framework migrations (PHASE 2)

- `backend/src/migrations/` : un fichier par migration (`NNN_name.ts`), export `up(db)` uniquement (forward-only, documentée).
- Runner : table `_migrations(id, name, appliedAt)` ; applique en ordre, **transactionnel** quand possible ; journalisé ; rejouable sans effet (skip si déjà appliquée).
- Règle : tables V2 créées **au moment du lot correspondant**, une migration par lot/fonctionnalité.

## 5. Ordre de développement (lots)

| Lot | Contenu | Tables (migration) |
|---|---|---|
| **A** | Promotions, Coupons, Avis vérifiés, Modération | promotions, promotion_products, coupons, coupon_redemptions, review_reports, moderation_actions (+ enrichissement reviews) |
| **B** | Codes-barres, Inventaires, Stock avancé, Analytics, Exports | inventory_counts, inventory_count_items (+ colonnes stock min/max sur products) |
| **C** | Favoris, Recherche avancée, Notifications, Fidélité | favorites, loyalty_accounts, loyalty_transactions |
| **D** | B2B, Réapprovisionnement | b2b_profiles, b2b_catalogs, b2b_catalog_items, b2b_orders, b2b_order_items, replenishment_suggestions |
| **E** | Livraison, Livreurs, Preuve | delivery_zones, drivers, delivery_events (+ enrichissement deliveries) |
| **F** | Assistant IA + actions contrôlées | ai_conversations, ai_messages, ai_action_requests |

Chaque lot : modèle → migration → API → permissions → logique métier → frontend → mobile-first → tests (unit/API/DB/multi-tenant/régression V1) → doc → build → rapport.

## 6. Critères d'acceptation par lot

- Tests V1 (baseline) toujours verts.
- Nouveaux tests verts (unit + API + DB + isolation tenant : accès autorisé / interdit / par ID direct / boutique A vs B).
- `npm run build` backend + frontend OK.
- Aucune écriture de prix/stock/paiement acceptée du frontend sans recalcul serveur.
- Audit log pour toute action sensible.

## 7. Baseline V1 (à jour de ce document)

- PHASE 1 terminée : suites réelles reconstruites — `npx vitest run` : **305/305 PASS**
  (v1-db 84, v1-api 43, v1-unit 23, auth 3, stock 2, payment 1, v2-lot-a 38, v2-lot-b 27, v2-lot-c 22, v2-lot-d 18, v2-lot-e 23, v2-lot-f 21).
- Build backend `tsc` : OK. Build frontend `tsc` + `vite build` : OK (~303 kB, gzip ~92 kB).
- Smoke HTTP réel exécuté sur serveur démarré (LOT B, C, D et E) : barcodes, analytics, exports CSV,
  marketplace recherche/filtres, favoris, fidélité, notifications, flux B2B complet
  (catalogue → commande → ACCEPTEE → PREPARATION → PRETE → EXPEDIEE → RECUE, stocks des deux côtés,
  mouvements tracés), suggestions de réapprovisionnement, flux livreur complet
  (livreur + compte DRIVER, A_PREPARER → PRET → assignation OTP → EN_LIVRAISON → LIVRE avec preuves
  OTP+GPS, commande LIVREE, échec livraison avec motif, isolation tenant) et assistant IA
  (réponses calculées sur données réelles, « Je ne dispose pas de cette information » si absent,
  actions en deux temps PENDING → confirmation → EXECUTED, whitelist, audit, tenant).
- Version API : `2.5.0-lot-f`.

### État des lots

| Lot | Contenu | État |
|-----|---------|------|
| A | Promotions, coupons, avis vérifiés, modération | ✅ |
| B | Codes-barres, inventaires, stock avancé, analytics, exports | ✅ |
| C | Favoris, recherche avancée, notifications étendues, fidélité | ✅ |
| D | B2B (grossistes, catalogues pro, commandes) + réapprovisionnement | ✅ |
| E | Livraison, livreurs, preuves de livraison | ✅ |
| F | IA assistant (strict no-invention) + actions contrôlées | ✅ |

## 8. Hors périmètre V2 (cahier §36)

Banque, crédit, assurance, comptabilité réglementaire, wallet, paiement réel sans contrat officiel, scoring financier opaque.
