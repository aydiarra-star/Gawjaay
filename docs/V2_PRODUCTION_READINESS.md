# GawJaay V2 — PRODUCTION READINESS

> **CORRECTION MESURÉE (2026-09-20, phase finale)** — métriques recalculées sur base réelle
> (identiques SQLite et PostgreSQL) : **54 tables** (dont `_migrations` → **53 tables métier**),
> **64 clés étrangères**, **54 PK**, **31 UNIQUE**, **110 index**, **8 migrations**.
> Le chiffre de « 247/248 CHECK » utilisé précédemment provenait d'un quirk d'`information_schema`
> PostgreSQL (`table_constraints` compte les colonnes `NOT NULL` comme `CHECK` :
> 238 NOT NULL + **13 vrais CHECK = 251**). Le nombre réel de contraintes `CHECK` est **13**.
> Voir `docs/FINAL_PRODUCTION_REPORT.md`.


Date : 2026-09-20 · Commit audité : **0f9dcc2** (mission 2 « Infrastructure Production + Ready for Pilot ») · Branche : `arena/01a0be50-gawjaay`

> **STATUT FINAL : 2. TECHNICALLY READY / NOT DEPLOYED** (réévalué fin mission 2, preuves : `docs/V2_READY_FOR_PILOT.md`)
>
> Justification factuelle : la V2 applicative est complète et validée (313/313 tests, E2E Playwright
> **VERT en CI** run 35510524010, builds type-checkés, parité PostgreSQL 53 tables/64 FK/247 CHECK,
> audit sécurité 0 CRITICAL/HIGH — fuite costPrice corrigée 448cd1d, idempotence commandes/ventes,
> backup avec restauration réellement testée, bugs mobiles bloquants corrigés). **Aucun serveur réel
> n'est déployé** : VPS, domaine, HTTPS, Sentry, bucket S3 ne sont pas provisionnés ([À FOURNIR]).
> Le passage au statut 4 « READY FOR PILOT » demande le déploiement réel (RUNBOOK) + pilote 7 j (PILOT.md).

---

## A. Git

| Contrôle | Résultat |
|---|---|
| Branche | `arena/01a0be50-gawjaay` |
| Remote | `origin` → `https://github.com/aydiarra-star/Gawjaay.git` |
| HEAD local | `664d057` (lot F) — 11 commits, historique linéaire `feat(v2)` un commit/lot |
| Working tree | clean avant audit ; correctifs readiness committés ensuite (§K) |
| Poussé sur GitHub | **OUI** — `git ls-remote` = `664d057ae58a85e57558e97d6d835b2001800c17` = HEAD local |
| Resets destructifs | AUCUN |

## B. Tests

| Suite | Résultat |
|---|---|
| `npx vitest run` (suite complète) | **313/313 PASS, 13 fichiers** (305 préexistants + 6 v2-prod-hardening + 2 masquage costPrice) |
| Tests désactivés/skippés | **0** (`grep skip/todo/only` : aucun) |
| Build backend | `tsc --noEmit` OK |
| Build frontend | `tsc --noEmit` (strict, **tsconfig ajouté** — voir §K) + `vite build` OK (317.5 kB, gzip 95.7) |

### Playwright (§3 mission)
- **Constat** : aucun test Playwright n'existait dans le repo ; l'environnement Arena **ne peut pas télécharger
  Chromium** (CDN bloqué, vérifié 2×, deps apt also unavailable).
- **Action** : suite créée — `frontend/e2e/parcours.spec.ts` (8 parcours × 2 projets = 16 tests : client mobile
  Pixel 7 [recherche→panier→commande], merchant desktop [vente POS scan SKU, commande→préparation→prête],
  assistant [action PENDING→confirmation→exécutée, question chiffrée + refus honnête], multi-tenant [stock B,
  IDOR UI sur URL A], admin [stats + refus client]), config double webServer (API seedée :4000 + `vite preview`
  :4173 avec proxy /api — plomberie validée manuellement : app servie, proxy API OK), workflow
  `.github/workflows/e2e.yml` (Chromium + run en CI GitHub).
- **Statut** : `playwright test --list` = 16 tests validés ; **exécution réelle à faire par la CI GitHub**
  (blocage réseau Arena ≠ échec fonctionnel, conformément à la mission).

## C. Database

### Migrations 001→006 (base vierge de test)
- Exécution sur base neuve : **6/6 appliquées dans l'ordre**, 2ᵉ exécution idempotente (« à jour »).
- `PRAGMA integrity_check` = ok · `foreign_key_check` = **0 violation** · **53 tables**, 0 table V2 manquante.
- Colonnes ALTER vérifiées présentes : stores(loyalty*), orders/sales(pointsToUse), products(sku/barcode/stockMax), deliveries(driverId/otpCode/otpSentAt/failedReason/deliveredTo).
- Rollback : runner **forward-only** (pas de `down()`), choix documenté en tête de chaque fichier. Sur SQLite, restauration par backup testée (ci-dessous) — pas de rollback SQL automatique.
- **PostgreSQL** : **aucun serveur PG disponible dans l'environnement d'audit** (vérifié : `psql`/`pg_ctl` absents). Le schéma final ne peut donc pas être vérifié sur PG vierge ici. Portage documenté précisément dans `deploy/DEPLOYMENT.md` §4 (dialecte, driver, requêtes, estimation 2-4 j) — SQLite retenu pour le pilote.

### Audit par table V2 (tenant / permissions / index / audit / intégrité)
| Domaine | Tables | Tenant ownership | Permission | Audit log | Intégrité |
|---|---|---|---|---|---|
| Promotions | promotions, promotion_products | storeId+merchantId / via parent | authorize + assertStoreAccess | via actions sensibles | FK ✓ CHECK(type/value) ✓ |
| Coupons | coupons, coupon_redemptions | storeId+merchantId | idem | consommation tracée (orderId) | FK ✓ UNIQUE ✓ |
| Reviews/Modération | reviews, review_reports, moderation_actions | storeId / via parent | CLIENT écrit, MERCHANT répond, modération dédiée | MODERATION_* ✓ | FK ✓ CHECK ✓ — **gap mineur** : `moderation_actions` sans FK contrainte (moderatorId libre) |
| Barcodes/Inventaires | inventory_counts(+items), products(sku/barcode) | storeId | assertStoreAccess partout | adjustStock INVENTORY tracé | UNIQUE barcode/sku par boutique ✓ CHECK(OPEN) ✓ |
| Analytics/Exports | lectures seules | assertStoreAccess | MERCHANT/EMPLOYEE | n/a (lecture) | n/a |
| Favoris | favorites | userId (client) | CLIENT only (403 sinon) | n/a | UNIQUE(userId,type,targetId) ✓ |
| Notifications | notifications | userId (destinataire) | siennes uniquement | n/a | FK users ✓ |
| Fidélité | loyalty_accounts, loyalty_transactions | storeId+clientUserId | config = propriétaire, audit LOYALTY_CONFIG | ✓ | solde jamais écrit direct, via transactions signées ✓ |
| B2B | b2b_profiles/catalogs/catalog_items/orders/order_items | wholesalerUserId / buyerMerchantId (isolations testées A↔B) | rôles acheteur/grossiste séparés serveur | B2B_ORDER_CREATE ✓ | CHECK états ✓ UNIQUE(catalog,product) ✓ minQty serveur ✓ |
| Réappro | replenishment_suggestions | storeId+merchantId | assertStoreAccess | via exécution IA auditable | CHECK(OPEN/DISMISSED/ORDERED) ✓ |
| Livraisons | deliveries, delivery_proofs, drivers | storeId / merchantId | machine à états + rôles (marchand/livreur/tiers) | DRIVER_CREATE ✓ | CHECK types preuve ✓ OTP usage unique ✓ |
| IA | ai_conversations, ai_messages, ai_action_requests | storeId+userId | assertStoreAccess + authorize sur chaque route | AI_ACTION ✓ | CHECK états ✓ TTL expiration ✓ |

### Backup & restauration (§8 mission — TEST RÉEL)
- `deploy/backup.sh` exécuté réellement : snapshot `VACUUM INTO` cohérent + `integrity_check=ok` + gzip + rétention 14 j + S3 optionnel.
- Restauration réelle (`gunzip` → ouverture SQLite) : **integrity ok, 10/10 tables à l'identique, _migrations 001→006 identiques → CONFORME ✓**.

## D. Security

| Contrôle | Résultat |
|---|---|
| Secrets dans Git | **AUCUN** — seul `backend/.env.example` (placeholders) est versionné |
| JWT | 2 secrets (access 15 m / refresh 7 j) ; **fail-fast ajouté** : en `NODE_ENV=production`, démarrage refusé si défauts de dev (avant : simple warn) |
| RBAC / multi-tenant | `authorize()` + `assertStoreAccess()` sur chaque route sensible ; testés par 305 tests + E2E IDOR |
| IDOR | getOrder B2B tiers→403, suggestions B→A→403, assistant B→A→403, URL UI boutique A vue par B→liste vide (E2E) |
| CORS | allowlist FRONTEND_URL ; **hardci durci** : `localhost`/`*.e2b.app` retirés en production (§K) |
| Rate limiting | global 500/min `/api` · login 5/min · assistant 30/15 min (skip uniquement NODE_ENV=test) |
| Upload fichiers | aucun endpoint d'upload ; preuves = dataURL en JSON, plafonnées (corps 1 Mo, contrôle 700 kB serveur) |
| S3 | non branché à l'app (backups seulement) — clé IAM dédiée à fournir |
| OTP livraison | jamais retourné par l'API (sanitizé), usage unique, vérifié serveur — testé lot E |
| Injection SQL | **0 voie** : toutes les requêtes préparées ; les 2 `UPDATE` dynamiques utilisent des allowlists de colonnes fixes (customers, products) |
| XSS | 0 `dangerouslySetInnerHTML`/`innerHTML` ; échappement React ; helmet actif |
| Audit logs | actions sensibles journalisées : MODERATION_*, LOYALTY_CONFIG, B2B_ORDER_CREATE, DRIVER_CREATE, PRODUCT_UPDATE, AI_ACTION |
| IA | voir §E |

## E. IA (audit spécifique §6 mission — exécuté en live sur serveur)

| Test demandé | Résultat |
|---|---|
| Question réelle « Combien ai-je vendu ? » (sans vente) | « **Je ne dispose pas de cette information.** Aucune vente enregistrée sur les 30 derniers jours » ✓ |
| idem après vente réelle (30 000 FCFA) | « Aujourd'hui : 1 vente(s) — 30 000 FCFA » + `sources: ['sales (temps réel)']` + disclaimer ✓ |
| « Quelle est ma marge ? » sans prix d'achat | « Je ne dispose pas… je ne l'invente pas », `margeEstimee = null` ✓ |
| Tenant (marchand B → boutique A) | 403 « Accès refusé à cette boutique » ✓ |
| RBAC (CLIENT) | 403 ✓ |
| Rate limit | 30 questions/15 min en code (skip test uniquement) ✓ |
| Action réappro | PENDING (TTL 15 min) → **confirmation explicite** → EXECUTED → suggestion créée 0→1 → **audit AI_ACTION lié à la demande** ✓ |
| Actions interdites prix/stock/paiement | `SET_PRICE`, `UPDATE_STOCK`, `REFUND_PAYMENT`, `DELETE_PRODUCT`, `EXECUTE_SQL` → toutes **400** ; whitelist code = 2 actions seulement (réappro = SUGGESTIONS modifiables par le commerçant ; alerte = notification) ✓ |
| Architecture | moteur d'intentions **déterministe** — aucun LLM générateur branché ; chaque réponse embarque les chiffres SQL du moment |

## F. Infrastructure (§7 mission — rien inventé, tout manquant est listé)

| Élément | État |
|---|---|
| Procédure VPS complète | `deploy/DEPLOYMENT.md` (clone→build→PM2→Nginx→certbot) |
| PM2 | `deploy/ecosystem.config.cjs` (fork ×1 — cohérent SQLite) |
| Nginx + HTTPS | `deploy/nginx.conf.example` (TLS 1.2/1.3, headers, cache, SPA fallback, proxy /api) |
| `.env` production | `deploy/.env.production.example` — **variables nommées, aucune valeur secrète** |
| **[À FOURNIR]** | VPS (2 vCPU/4 Go), domaine + DNS, Sentry DSN, bucket S3 + clé IAM `s3:PutObject`, clés Wave/OM si sortie de sandbox |
| Sentry | **non intégré au code** (aucun SDK installé) — DSN à fournir puis brancher (`@sentry/node`) |
| Monitoring | PM2 logs `/var/log/gawjaay/` + `/health` versionné ; métriques avancées à brancher (cf §I) |
| Base de données pilote | SQLite fichier (justifié §4 DEPLOYMENT.md) — PostgreSQL = portage documenté, non réalisé exprès |

## G. Payments

- Pilote : **CASH + retrait boutique** (réels, testés par la suite V1/V2 : `paymentMethod CASH`, monnaie rendue, ventes POS).
- Wave / Orange Money : classes `WaveSandbox` / `OrangeMoneySandbox`, `provider: 'WAVE_SANDBOX'|'OM_SANDBOX'`, UI libellée « Payer Wave (sandbox) » + alerte « Simulation sandbox ». Webhooks à secret configurables. **Rien n'est présenté comme production** — conforme à la mission §10.

## H. Monitoring

- Actuel : `/health` (version+timestamp), logs PM2+rotatés, audit_logs DB, `backup.sh` exit≠0 si corruption.
- Recommandé pilote : Sentry (erreurs), uptime externe (healthcheck /health toutes les min), Sentry Cron Monitor sur le backup. **Non branché — DSN à fournir.**

## I. Remaining blockers (pour passer en « READY FOR PILOT »)

1. **Provisionner le VPS + domaine + HTTPS** et exécuter `deploy/DEPLOYMENT.md` (blocage n°1 — rien n'est déployé).
2. **Secrets de production** : 2 JWT secrets + FRONTEND_URL (fail-fast en place).
3. **Playwright en CI** : pousser puis vérifier le run vert du workflow `e2e.yml` (impossible localement, Chromium bloqué par Arena).
4. **Index avant montée en charge** (identifiés via EXPLAIN QUERY PLAN — tous en SCAN ; recommandés, non créés « pour ne pas optimiser prématurément ») :
   ```sql
   CREATE INDEX idx_sales_store_created   ON sales(storeId, createdAt);
   CREATE INDEX idx_movements_store_prod  ON inventory_movements(storeId, productId, createdAt);
   CREATE INDEX idx_deliveries_store      ON deliveries(storeId, status);
   CREATE INDEX idx_notifications_user    ON notifications(userId, createdAt);
   ```
   (à livrer en migration 007 versionnée — temps réponse actuels < 4 ms sur volumes de démo)
5. **Sentry + monitoring backup** (DSN à créer).
6. **Gap fonctionnel mineur documenté (non développé — hors périmètre)** : `delivery_events` (journal des événements de livraison) et `delivery_zones` prévus au plan lot E non créés (compensé par statusHistory/preuves horodatées) ; FK manquante sur `moderation_actions.moderatorId` ; workflow `deploy.yml` déclenché sur branche `principal` inexistante (mort) avec Node 18 EOL — décision exploitant requise.
7. **Paiements** : rester CASH/retrait tant que Wave/OM ne sont pas contractés.

## J. Pilot readiness

| Domaine | Prêt ? | Condition |
|---|---|---|
| Code + tests | ✅ 305/305, builds type-checkés | — |
| Données démo | ✅ filtrées serveur (boutique fermée/hors ligne jamais exposées — vérifié API live) | ne pas seed le monde démo en prod |
| Sécurité | ✅ audit §D + durcissements | secrets prod à définir |
| IA | ✅ audit §E complet | — |
| Backups | ✅ script + restauration réelle conformes | cron à activer sur VPS + S3 |
| Déploiement | ⏳ scripts/docs prêts | **exécution VPS réelle** |
| Monitoring | ⏳ procédure prête | DSN Sentry |
| Paiements pilote | ✅ CASH/retrait | Wave/OM = sandbox assumée |

**Décision : STATUT 2 — TECHNICALLY READY / NOT DEPLOYED.**
Le logiciel est validé de bout en bout et l'exécution déploiement est une procédure, pas un projet :
compter ~½ journée une fois le VPS et le domaine fournis (puis §I.3-§I.5).

## K. Correctifs apportés par cet audit (aucune nouvelle fonctionnalité)

1. `frontend/tsconfig.json` ajouté (strict) — le build ne vérifiait **aucun type** ; + `build = tsc && vite build`.
2. **Bug réel corrigé** : `InventoryCount.tsx` — `confirm` local masquait `window.confirm` (récursion infinie au clic « Confirmer »).
3. Fail-fast JWT en production (`env.ts`).
4. CORS production restreint à `FRONTEND_URL` (`app.ts`).
5. `deploy/` : DEPLOYMENT.md, nginx, PM2, `.env.production.example`, `backup.sh` (testé), `backend/scripts/seed-demo.ts`.
6. E2E Playwright + workflow CI (`frontend/e2e/`, `.github/workflows/e2e.yml`).
7. `docs/V2_PRODUCTION_READINESS.md` (ce document).
