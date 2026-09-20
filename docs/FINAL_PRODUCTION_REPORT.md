# GAWJAAY — FINAL PRODUCTION REPORT

**Date :** 2026-09-20 · **Branche :** `arena/01a0bf77-gawjaay` @ **`de159f4`** (poussée sur `origin`)
**Base auditée :** `main` = `7069be3` (local **et** distant identiques)
**Statut global : TECHNICALLY READY — NOT DEPLOYED**

> Deux audits ont été menés dans cette session (16:16 puis reprise complète). Aucune
> infrastructure réelle n'a été fournie (pas de VPS, pas de domaine, pas de base PostgreSQL de
> production, pas de bucket S3, pas de DSN Sentry). **Rien n'a été déployé.** Ce rapport ne
> contient que des éléments **mesurés** ; tout ce qui ne pouvait pas l'être est marqué `BLOCKED`
> ou `NOT TESTED` — jamais `PASS`.

---

## 0. Synthèse

| Bloc | Statut |
|---|---|
| Code, tests, migrations, sécurité applicative | **PASS** |
| Infrastructure (VPS, domaine, HTTPS, S3, Sentry, backup/restore prod) | **BLOCKED** |
| Tests réels en production (smoke public, mobile réel) | **NOT TESTED** |

**10 ressources manquantes** bloquent le passage à `READY FOR PILOT` — voir §26.

---

## 1. Git — STATUS: PASS

Mesures (`git status`, `git log`, `git branch -a`, `git remote -v`, `git ls-remote origin`) :

- Arbre de travail **propre**.
- Branche de session : `arena/01a0bf77-gawjaay`, HEAD = **`de159f40a6413825205c7e6deaf4d1fa64c22024`**,
  **poussée sur `origin`** (`git push origin arena/01a0bf77-gawjaay` → `* [new branch]`, sans `--force`).
- Remote unique : `origin → https://github.com/aydiarra-star/Gawjaay.git`.
- ⚠️ **Le clone de cet environnement est `grafted` (shallow)** — `git rev-parse
  --is-shallow-repository` → `true`. `git log` ne montre donc que 2 commits. L'historique complet
  n'est **pas vérifiable localement** ; il l'est via l'API GitHub (ci-dessous).
- Aucun `git reset --hard`, aucun `git push --force` n'a été exécuté.

**État réel des branches (`git ls-remote origin`) :**

| Réf distante | SHA | Lecture |
|---|---|---|
| `refs/heads/main` | `7069be3` | base — merge de la PR #5 |
| `refs/heads/arena/01a0bf77-gawjaay` | `de159f4` | **cette session** (audit + corrections doc) |
| `refs/heads/arena/01a0beef-gawjaay` | `fbe3b6b` | branche d'une session antérieure, **périmée** |

**⚠️ `main` et la branche arena ne sont PAS au même commit.** `main` = `7069be3`, la branche de
cette session = `de159f4` (1 commit en avance, non mergé). L'API GitHub le confirme :
`compare/7069be3...fbe3b6b` → `{status: "behind", ahead_by: 0, behind_by: 3}` — c'est-à-dire que
**`fbe3b6b` est déjà entièrement contenu dans `main`** et que `main` a 3 commits de plus. La
branche distante `arena/01a0beef-gawjaay` est donc une copie périmée, à supprimer éventuellement.

Rapprocher `main` de la branche arena passe par une **pull request** (cette session n'a pas le
droit de pousser sur `main`). Aucune PR n'a été ouverte sans demande explicite.

**Commits annoncés — vérifiés un par un via l'API GitHub** (`GET /repos/…/commits/<sha>`) :

| SHA annoncé | Réalité mesurée |
|---|---|
| `61b48a9` | **HTTP 422 « No commit found for SHA »** → n'a jamais existé sur ce dépôt |
| `03aabb7` | **HTTP 422 « No commit found for SHA »** → n'a jamais existé sur ce dépôt |
| `fbe3b6b` | **existe** — `feat(pg): postgresql runtime + dynamic storeids + composite idempotency (325/325)`, parent `d5c2470`, **déjà dans `main`** |
| `be5c016` | **existe** — tête de la PR #5 (`docs(prod): rapport final de production + …`) |
| `7069be3` | **existe** — commit de merge de la PR #5, = `main` actuel |
| `de159f4` | **existe** — travail de cette session, poussé sur `origin` |

Conclusion : le travail PostgreSQL runtime est bien présent via `fbe3b6b`, intégré dans `main` par
un **merge classique** (pas de rebase, pas de réécriture d'historique).

## 2. Commit déployable — STATUS: PASS

Deux réponses selon la cible :

- **`main` aujourd'hui** : **`7069be3`** — CI verte (§17), c'est le commit déployable en l'état.
- **Branche de cette session** : **`de159f4`** — également **CI verte** (runs `35522180341` CI Tests
  et `35522180384` E2E Playwright, tous deux `success` sur `de159f4`). Ce commit ne contient que
  des corrections de **documentation de déploiement** : aucun changement de code applicatif.

Les deux sont déployables. `de159f4` est préférable car il corrige un
`deploy/.env.production.example` qui aurait fait déployer SQLite en production (§27).

## 3. PR #5 — STATUS: PASS (mais **déjà mergée**, contrairement à l'énoncé)

L'énoncé indiquait « PR #5 est actuellement ouverte ». **Mesure : elle est `MERGED`.**

```
state        : MERGED
mergedAt     : 2026-09-20T14:03:30Z
baseRefName  : main
headRefOid   : be5c0162cb360a72eef7630f5199444537a2cde9
mergeCommit  : 7069be315f4e35faa27af7969945dca72dd80671
isDraft      : false
```

Les **8 checks** de la PR sont `SUCCESS` (`statusCheckRollup`) :

| Workflow | Job | Conclusion |
|---|---|---|
| CI Tests | `backend` (SQLite + tsc) | SUCCESS |
| CI Tests | `backend-postgres` (PG 16 + build + smoke) | SUCCESS |
| CI Tests | `frontend` (tsc strict + build) | SUCCESS |
| E2E Playwright | `e2e` | SUCCESS |

(doublés car exécutés sur le head de la PR puis sur le merge commit — 4 × 2 = 8).

**Aucun merge n'a été nécessaire** : la PR était déjà intégrée, et son merge commit est le HEAD.
Aucune vérification n'a été contournée.

## 4. Baseline — STATUS: PASS (chiffres **recalculés**, écarts documentés)

Rejouée **deux fois** dans cette session (avant et après les corrections de documentation), sur
`7069be3` puis sur `de159f4` — résultats identiques :

| Référence annoncée | Mesure réelle | Écart |
|---|---|---|
| SQLite 330/330 | **334 passed (334)** — 15 fichiers | **+4** |
| PostgreSQL réel 330/330 | **334 passed (334)** — 15 fichiers | **+4** |
| Concurrence 4/4 (2 moteurs) | **4/4** sur les deux moteurs | conforme |
| Smoke HTTP 39/39 | **39/39 PASS** | conforme |
| Playwright 8/8 | **8 passed, 8 skipped** (annotation CI) | conforme |
| CI verte | **`success`** sur `7069be3` **et** sur `de159f4` | conforme |

**Explication de l'écart 330 → 334 (aucune falsification)** : la suite compte **334 tests au total**,
dont les **4 tests de concurrence**. L'ancien rapport écrivait « SQLite : 330/330 » puis
« donc 334 tests au total (330 + 4) » : le 330 excluait `concurrency.test.ts`, alors que
`npx vitest run` l'exécute bien. La valeur mesurable unique est donc **334/334**, et non 330/330.
Les 330 ne correspondent à aucune exécution réelle de la suite.

**Limite mesurée sur le volet PostgreSQL** : aucun serveur PostgreSQL n'a pu être installé dans ce
sandbox (`apt-get update` → `Connection failed` sur `deb.debian.org` ; `postgresql.org:443` →
`SSL_ERROR_SYSCALL` ; aucun binaire `pg_ctl`/`initdb` présent ; `docker` absent). La suite a donc
été exécutée sur **PGlite 0.5.8, qui embarque un vrai PostgreSQL 18.3** — mesuré :
`PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten`. Ce n'est **pas** un substitut
SQL : c'est le moteur PostgreSQL compilé en WASM, et c'est le chemin `pglite:` prévu par
`backend/src/lib/db.ts`. Le chemin **driver `pg` + serveur PostgreSQL réseau** (celui de la
production) est prouvé par le job CI `backend-postgres` sur un service `postgres:16` (§17),
que je n'ai pas pu rejouer ici.

Commandes réellement exécutées :

```
cd backend && npx vitest run                       → 334 passed (15 files)
cd backend && DATABASE_URL='pglite://' npx vitest run → 334 passed (15 files)
cd backend && npm run build                        → OK (dist/index.js + postgresWorker.cjs copié)
cd backend && npx tsc --noEmit                     → OK
cd frontend && npx tsc --noEmit && npm run build   → OK (dist/assets/index-*.js, 317,64 kB)
```

## 5. VPS — STATUS: BLOCKED

**Aucun accès VPS n'existe dans cet environnement.** Vérifications :

| Vérification | Résultat |
|---|---|
| `ls ~/.ssh` | `No such file or directory` — aucune clé SSH |
| `command -v hcloud` | **absent** (CLI Hetzner non installé) |
| `command -v ssh` | présent (`/usr/bin/ssh`) mais sans cible ni identifiant |
| `command -v ansible` / `terraform` | absents |
| `env \| grep -iE 'hetzner\|hcloud\|ssh\|deploy\|domain'` | **aucune variable** |
| Recherche de credentials dans le workspace (`*.pem`, `id_rsa*`, `*hetzner*`) | **aucun fichier** |
| `grep` d'adresses IP réelles dans le dépôt | **aucune** (hors `0.0.0.0`/`127.0.0.1`) |
| `curl https://api.hetzner.cloud/v1/servers` | **`SSL_ERROR_SYSCALL`** — l'API Hetzner est **injoignable** depuis ce sandbox |

OS, version, CPU, RAM, disque, IP et hostname du CPX32 **ne peuvent donc pas être identifiés** :
`uname -a`, `cat /etc/os-release`, `free -h`, `df -h`, `nproc` n'ont aucun hôte cible.
Rien n'a été supposé, rien n'a été inventé.

**Ressource réseau du sandbox, mesurée** : `github.com` → HTTP 200, `registry.npmjs.org` → OK,
mais `deb.debian.org`, `www.postgresql.org` **et `api.hetzner.cloud`** sont **injoignables**
(`SSL_ERROR_SYSCALL`), et `docker` est absent. Ce sandbox ne peut ni provisionner ni joindre
une infrastructure Hetzner : il n'est pas un environnement de déploiement.

## 6. Sécurisation initiale du VPS — STATUS: BLOCKED

Dépend du §5. Utilisateur admin non-root, clés SSH, désactivation du mot de passe et du login root,
firewall, ports 80/443, mises à jour, timezone, synchronisation horaire, fail2ban, logs :
**aucun de ces points n'est applicable sans hôte**. La procédure reste à exécuter sur le VPS réel.

## 7. PostgreSQL production — STATUS: BLOCKED

Aucune base de production, aucun `DATABASE_URL` réel. **Aucune valeur inventée.**

Ce qui est prêt et **prouvé** côté code :

- Moteur choisi par `DATABASE_URL` (`backend/src/lib/db.ts`) :
  `postgresql://`/`postgres://` → **driver `pg`** (`Pool` `max: 1`, une session → `BEGIN`/`COMMIT`
  atomiques) ; `pglite:` → PostgreSQL WASM ; `file:` → SQLite (dev/tests uniquement).
- Parité de types `pg` : `int8` (COUNT) et `numeric` (SUM) reparsés en nombres
  (`backend/src/lib/postgresWorker.cjs`), sinon `'5' + 1 === '51'`.
- Traduction de dialecte à l'exécution (`postgresAdapter.ts → translateSql`) : `PRAGMA` supprimés,
  `datetime('now')` → ISO-8601 UTC, `sqlite_master` → catalogue PG, `?` → `$1…$n`,
  `LIKE` → `ILIKE`, `MAX(a,b)`/`MIN(a,b)` scalaires → `GREATEST`/`LEAST`.
- Fail-fast : `backend/src/config/env.ts` **refuse de démarrer** en `NODE_ENV=production` avec les
  secrets JWT de développement.

**Version cible PostgreSQL 16+** : à installer sur le VPS. Ne pas rétrograder un PostgreSQL 18
existant si l'application est compatible — la compatibilité PG 18 est d'ailleurs démontrée ici
(suite complète verte sur PostgreSQL 18.3 via PGlite).

## 8. Migrations — STATUS: PASS (sur les deux moteurs) · BLOCKED (sur la base de production)

**Correction de l'énoncé** : les migrations ne vont pas de « 000 → 009 ». Mesure :

```
deploy/postgres/            backend/src/migrations/versions/
000_base.sql                001_lot_a.ts
001_lot_a.sql               002_lot_b.ts
…                           …
008_idempotency.sql         008_idempotency.ts
```

Soit **`000_base` + 8 migrations versionnées (`001` → `008`)**. **Aucune migration `009` n'existe.**

Preuves mesurées dans cet environnement :

| Contrôle | Résultat |
|---|---|
| Application sur base vierge (démarrage API, `NODE_ENV=production`, PostgreSQL) | `001_lot_a` → `008_idempotency_keys` appliquées, **8/8** |
| Journal de migration | table **`_migrations`** — 8 lignes (mesuré) |
| Idempotence | `deploy/postgres/validate.mjs` : 2ᵉ exécution → **0 ré-application** |
| Tables | **54** tables publiques = **53 tables métier** + `_migrations` |
| Clés étrangères | **64** |
| Index | **110** |
| CHECK | **248** au sens `information_schema`, dont **235 NOT NULL** → **13 vrais CHECK** métier |
| Parité SQLite ↔ PostgreSQL | **identique** — 53 tables, colonnes/classes de types, NOT NULL, PK, FK, index |
| Migrations sur la base de **production** | **BLOCKED** (pas de base) |

> Le `248 CHECK` n'est pas contradictoire avec le « 13 vrais CHECK » : PostgreSQL expose les
> contraintes `NOT NULL` comme des `CHECK` dans `information_schema`. Les deux chiffres sont
> mesurés et réconciliés (235 + 13 = 248).

## 9. Backup initial — STATUS: BLOCKED (production) · NOT TESTED (`pg_dump`)

- Aucun `pg_dump`/`pg_restore`/`psql` dans cet environnement (`psql` absent, aucun binaire PG) →
  la procédure de référence `deploy/backup.sh` (format custom) **n'a pas pu être exécutée ici**.
- Aucune base de production à sauvegarder.
- Le mécanisme existe et est documenté (`deploy/backup.sh`, `docs/BACKUP_RESTORE.md`), avec
  fallback SQL `deploy/pg-backup.mjs` / `deploy/pg-restore.mjs`.
- **Aucun backup n'est déclaré opérationnel** : aucun test de restauration n'a été mené dans
  cette session (§10).

## 10. Restauration — STATUS: NOT TESTED

Aucune restauration exécutée dans cette session (ni `pg_dump`/`pg_restore`, ni base cible).
Un backup ne sera déclaré opérationnel qu'après une restauration **réussie dans une base séparée**
avec comparaison d'intégrité (tables, users, stores, products, inventory, sales, orders, payments,
audit, migrations).

## 11. Application (backend) — STATUS: PASS (local) · BLOCKED (déploiement)

- Build de production exécuté : `npm run build` → `dist/index.js`, et `postgresWorker.cjs`
  **copié dans `dist/`** par `scripts/copy-assets.cjs` (sans quoi l'API planterait au démarrage
  avec PostgreSQL).
- API démarrée avec `NODE_ENV=production` + PostgreSQL : `🚀 GawJaay API running on
  http://0.0.0.0:4000`, migrations appliquées au boot.
- Process manager (PM2) : `deploy/ecosystem.config.cjs` prêt — **non exécuté** (pas de VPS).
- **SQLite n'est pas utilisé en production** : `deploy/.env.production.example` fournit désormais
  un `DATABASE_URL` PostgreSQL (voir §27 — c'était un défaut corrigé dans cette session).

## 12. Secrets production — STATUS: BLOCKED

**Aucun secret réel fourni.** Rien n'a été inventé.

Variables réellement lues par le backend (mesure exhaustive :
`grep -rhoE "process\.env\.[A-Z0-9_]+" backend/src backend/scripts | sort -u`) :

```
DATABASE_URL  JWT_ACCESS_SECRET  JWT_REFRESH_SECRET  JWT_ACCESS_EXPIRES
JWT_REFRESH_EXPIRES  PORT  FRONTEND_URL  NODE_ENV  SENTRY_DSN
WAVE_API_KEY  WAVE_WEBHOOK_SECRET  OM_API_KEY  OM_WEBHOOK_SECRET
(+ SMOKE_BASE_URL et TEST_DATABASE_URL, hors runtime)
```

**Correction de l'énoncé** : il n'existe **ni « OTP secrets » ni variable S3 lue par
l'application**. Aucun `process.env` d'OTP ni d'`AWS_*`/`S3_*` n'est lu dans `backend/src`.
Les variables S3 ne servent qu'à l'upload des **backups** par `deploy/backup.sh` (via `aws` CLI).

Contrôles effectués :

| Contrôle | Résultat |
|---|---|
| Secrets dans Git | **aucun** — uniquement `.env.example` / `.env.production.example` avec placeholders ; `.env` est dans `.gitignore` |
| Secrets dans le bundle frontend | **aucun** (recherche de motifs `secret`/`password`/`api_key`/`aws_`/`bearer` dans `frontend/dist/assets/*.js` → vide) |
| `http://localhost` dans le bundle | 1 occurrence, **interne à axios** (`origin = window.location.href \|\| "http://localhost"`), jamais atteinte dans un navigateur. **Aucune URL localhost dans `frontend/src`** |
| Secrets dans les logs / erreurs HTTP | non vérifiable sans environnement déployé → NOT TESTED |

## 13. S3 — STATUS: BLOCKED · et **écart de périmètre à signaler**

Aucun bucket, aucune clé. Mais surtout, **mesure du code** :

- **Aucun SDK S3 dans les dépendances** (`grep aws-sdk\|@aws-sdk backend/package.json
  deploy/postgres/package.json` → aucun résultat).
- **Aucune route d'upload** dans le backend (`grep -rniE "upload\|multipart" backend/src` → vide) ;
  `multer` figure dans `package.json` mais **n'est importé nulle part** dans `backend/src`.
- Le seul `<input type="file">` du frontend est la **photo de preuve de livraison** du livreur
  (`frontend/src/pages/driver/DriverApp.tsx`), lue en `data:` URL côté client, limitée à 500 Ko.
- `logoUrl` / `imageUrl` existent dans le schéma mais **rien ne les écrit** côté backend.

**Conséquence** : le test demandé « upload image produit → stockage S3 → affichage dans GawJaay »
**ne peut pas être réalisé**, et pas seulement faute de bucket : **la fonctionnalité d'upload de
fichiers n'existe pas dans l'application**. L'ajouter serait une nouvelle fonctionnalité, donc
**interdit par la règle absolue** de cette mission. C'est un écart de périmètre à trancher, pas un
bug à corriger ici. Le seul usage réel de S3 aujourd'hui est la copie distante des backups.

## 14. Sentry — STATUS: BLOCKED

- SDK **installé et intégré** : `@sentry/node` **10.75.0** ; `Sentry.init` conditionnel dans
  `backend/src/app.ts` ; `Sentry.captureException` sur les 5xx dans
  `backend/src/middlewares/errorHandler.ts`.
- **Inactif sans `SENTRY_DSN`** (no-op). Aucun DSN fourni → aucun événement de test n'a pu être
  émis, donc rien à supprimer/identifier.
- > L'ancien `docs/V2_PRODUCTION_READINESS.md` affirmait « Sentry **non intégré au code** (aucun
  > SDK installé) ». **C'était faux** — corrigé dans cette session (§27).

## 15. Nginx — STATUS: BLOCKED (non déployé) + **1 défaut de configuration identifié**

`deploy/nginx.conf.example` est correct sur l'essentiel : redirection HTTP→HTTPS, TLS 1.2/1.3,
headers de sécurité, `proxy_pass http://127.0.0.1:4000` pour `/api/` (le port Node n'est pas
exposé), frontend statique avec fallback SPA, cache des assets fingerprintés, gzip.

**Défaut mesuré** : le template ne proxifie que `/api/`. Or l'API expose **deux** health checks
(vérifié par requête réelle sur l'API démarrée) :

```
GET /health        → 200 application/json   (backend/src/app.ts:46)
GET /api/v1/health → 200 application/json   (backend/src/routes/index.ts:70)
```

Avec le template tel quel, `https://<domaine>/health` tomberait dans le `location /`
(`try_files … /index.html`) et renverrait **le HTML de la SPA, pas le JSON de santé**.
→ Surveiller **`https://<domaine>/api/v1/health`**, ou ajouter une `location /health`
pointant sur le proxy. Documenté dans `docs/V2_PRODUCTION_READINESS.md` §F.

## 16. HTTPS — STATUS: BLOCKED

Dépend du VPS (§5) et du domaine. Aucun certificat émis, aucune validation possible.

## 17. CI — STATUS: PASS

Mesuré via l'API GitHub.

**Sur `main` (`7069be3`)** :

| Run | Workflow | Conclusion |
|---|---|---|
| `35515323280` | CI Tests | **success** |
| `35515323282` | E2E Playwright | **success** |

**Sur la branche de cette session (`de159f4`), déclenchés par le push** :

| Run | Workflow | Conclusion |
|---|---|---|
| `35522180341` | CI Tests | **success** |
| `35522180384` | E2E Playwright | **success** |

Jobs du run `35515177927` (tête de PR #5) : `backend` **success**, `backend-postgres` **success**,
`frontend` **success**, `e2e` **success**.

Le job `backend-postgres` monte un **service `postgres:16`** et exécute : suite complète sur
PostgreSQL réel → `npm run build` → démarrage de l'API en `NODE_ENV=production` avec
`DATABASE_URL` PostgreSQL → `npx tsx scripts/smoke.ts`. C'est la preuve du chemin
**driver `pg` + serveur PostgreSQL réseau** que ce sandbox ne peut pas rejouer.

**Incident CI constaté** : trois runs nommés `.github/workflows/deploy.yml`
(`35501937055`, `35502479279`, `35503880192`, poussés sur `main`) sont en **`failure`**, et
`GET …/actions/runs/35503880192/jobs` renvoie **`total_count: 0`** → le workflow échouait **sans
créer le moindre job** (fichier invalide ou référence inexistante). Ce fichier **n'existe plus**
dans le dépôt (`ls .github/workflows/` → `ci.yml`, `e2e.yml` uniquement). **Aucun déploiement
automatique n'a jamais fonctionné** sur ce dépôt.

## 18. Smoke — STATUS: PASS (local, build production + PostgreSQL)

`SMOKE_BASE_URL=http://127.0.0.1:4000 npx tsx scripts/smoke.ts` contre l'API en **build de
production** (`node dist/index.js`, `NODE_ENV=production`) sur **PostgreSQL** :

```
=== SMOKE 39/39 PASS — OK ===
```

Couverture réellement exécutée : santé · register/login/me marchand · **aucun `passwordHash`
exposé** · boutique · produit · stock · scénario storeIds dynamiques · vente CASH · décrément de
stock · statistiques · boutique publique · **catalogue public sans `costPrice`** · recherche
publique sans `costPrice` · client · commande RETRAIT · **prix serveur imposé** (15000, pas 1) ·
confirmation · **isolation multi-tenant (4 × 403)** · **idempotence (4 contrôles)** · assistant IA
(200, refus honnête, CA = valeur réelle en base) · action IA PENDING → EXECUTED → horodatage ·
RBAC audit (403).

**Smoke sur URL publique : NOT TESTED** (aucune URL publique).

## 19. E2E — STATUS: PASS (CI) · NOT TESTED (local)

Annotation CI du job `e2e` (`check-runs/106089790300/annotations`) :

```
8 skipped
8 passed (23.8s)
```

La spec `frontend/e2e/parcours.spec.ts` contient **8 `test()`** réels, exécutés sur 2 projets
Playwright (`client-mobile` = Pixel 7, `desktop`) avec des `test.skip` conditionnels
(`parcours client = mobile uniquement` / `back-office = desktop`) → 8 exécutés + 8 sautés = 16.
**Le « 8/8 » de l'énoncé est donc exact**, et correspond aux 8 parcours réels.

Exécution locale impossible : le téléchargement de Chromium est bloqué depuis ce sandbox.

## 20. Sécurité — STATUS: PASS (applicatif) · BLOCKED (surface exposée)

Vérifié **dans cette session**, par exécution réelle :

| Contrôle | Preuve |
|---|---|
| Isolation multi-tenant | 4 × **403** au smoke (lecture stock, écriture produit, vente, action commande du tenant A par B) ; un `storeId` falsifié n'ouvre aucun accès |
| RBAC | **403** — accès marchand à l'audit admin ; **403** — client sur `/admin` (E2E) |
| `passwordHash` | **jamais exposé** (contrôle smoke sur `/auth/me`) |
| `costPrice` | **jamais exposé** sur le catalogue public ni la recherche publique |
| Idempotence | même clé → même réponse, **une seule** opération, stock décrémenté une fois ; même clé pour un autre utilisateur → opération indépendante |
| Prix serveur | prix client falsifié (`1`) ignoré → **15000** appliqué |
| Rate limiting | actif en production (`5/min` sur `/auth/login`, `500/min` global sur `/api/`) ; désactivé uniquement en `NODE_ENV=test` |
| CORS | en production, **seul** `FRONTEND_URL` est autorisé (`localhost`/`*.e2b.app` uniquement hors production) |
| Fail-fast secrets | `env.ts` **lève une erreur** en production avec les secrets JWT de dev |
| Secrets dans Git / bundle | **aucun** (§12) |

**Non testé faute d'infrastructure** : SQL injection et XSS en conditions réelles, IDOR sur surface
publique, uploads, comportement du rate limiting derrière un reverse proxy
(`X-Forwarded-For`), TLS/HSTS. **Audit de sécurité production complet : BLOCKED.**

Résultat « 0 CRITICAL / 0 HIGH non traité » : **non démontrable** tant que la surface publique
n'existe pas.

## 21. Mobile — STATUS: NOT TESTED (appareil réel) · PASS (émulation CI)

- CI : parcours mobile exécuté sur **Pixel 7** (Chromium réel) — vert.
- **Aucun iPhone ni Android** dans cet environnement → connexion, navigation, recherche, store,
  produit, panier, commande, dashboard marchand, stock, vente, assistant, responsive, clavier,
  scroll, boutons, erreurs réseau, connexion faible : **NOT TESTED sur appareil réel**.

## 22. Monitoring / observabilité — STATUS: BLOCKED

- Présent dans le code : `/health` versionné, logs PM2 (`/var/log/gawjaay/api.out.log`,
  `api.error.log`, `merge_logs`, `time`), `audit_logs` en base, Sentry conditionnel.
- **Écart mesuré** : les **deux** health checks renvoient un JSON **statique** et **n'interrogent
  pas la base**. Preuve à la source — `backend/src/app.ts:46` et `backend/src/routes/index.ts:70`
  contiennent tous deux uniquement :

  ```js
  res.json({ status: 'ok', service: 'GawJaay API', version: '2.5.0-lot-f', timestamp: new Date().toISOString() });
  ```

  Aucun `db.prepare(...)`, aucune requête. Un `/health` 200 ne prouve donc **pas** que
  `API → PostgreSQL` fonctionne. Ce n'est pas corrigé ici (modifier `/health` serait un changement
  de comportement non demandé) ; la connectivité DB est prouvée par le **smoke**, qui effectue de
  vraies requêtes (39/39, dont lecture/écriture stock, ventes, statistiques).
- Alertes, `node_exporter`, Sentry Cron Monitor sur le backup : **à brancher**, rien d'inventé.

## 23. URL publique — STATUS: BLOCKED

Aucune URL publique. L'application n'a tourné que sur `127.0.0.1:4000` dans ce sandbox.

## 24. Incidents

| # | Incident | Détail | Impact |
|---|---|---|---|
| 1 | `deploy.yml` en échec sur `main` (×3) | `total_count: 0` jobs → workflow invalide ; fichier depuis supprimé | Aucun déploiement auto n'a jamais fonctionné |
| 2 | 3 runs E2E en `failure` avant la PR #3 | `35508918046`, `35510093657` (`ff35f8d`, `019a0f3`) | Résolus — E2E vert depuis |
| 3 | Contradictions documentaires | voir §27 | Corrigées dans cette session |
| 4 | Erreurs 403 dans les logs de l'API pendant le smoke | Contrôles d'isolation multi-tenant **attendus**, journalisés par `errorHandler` | Aucun — comportement nominal |

Aucun incident de production : **rien n'a été déployé**.

## 25. Performance — STATUS: NOT TESTED

Aucune mesure de production (pas d'infrastructure). Mesures locales indicatives, non
représentatives : suite SQLite 22–25 s, suite PostgreSQL (PGlite) 35 s, smoke complet **2,8 s**
pour 39 vérifications HTTP, build frontend **1,83 s** (bundle 317,64 kB / 95,84 kB gzip).
Conformément à la règle : **aucune optimisation** n'a été faite.

## 26. Blockers

| # | RESSOURCE MANQUANTE | IMPACT | ACTION REQUISE |
|---|---|---|---|
| 1 | **VPS Hetzner CPX32** (IP, hostname, accès SSH, OS) | Aucun déploiement possible ; §5-7, 11, 15-18, 20, 22-23 non réalisables | Fournir l'hôte et un accès administrateur (clé SSH). Auditer la config réelle avant toute modification |
| 2 | **Domaine + DNS** | Pas d'URL publique, pas de HTTPS, smoke public impossible | Fournir le domaine et créer l'enregistrement A vers l'IP du VPS |
| 3 | **PostgreSQL de production** (`DATABASE_URL`) | Pas de base prod, pas de migrations réelles, pas de backup/restore | Créer database + user + mot de passe fort sur le VPS, privilèges minimaux, port 5432 non exposé |
| 4 | **Bucket S3 + clés** | Pas de copie distante des sauvegardes | Fournir bucket + clé limitée `s3:PutObject` |
| 5 | **`SENTRY_DSN`** | Pas d'alerte d'erreur ; le test d'événement Sentry est impossible | Créer le projet Sentry et fournir le DSN |
| 6 | **Appareils iPhone / Android** | Tests mobiles réels impossibles | Mettre à disposition au moins un appareil de chaque plateforme |
| 7 | **Accès réseau de déploiement** | Ce sandbox ne joint ni `deb.debian.org` ni `postgresql.org`, et n'a ni `docker` ni `hcloud` | Exécuter le déploiement depuis un environnement ayant accès au VPS |
| 8 | **`pg_dump` / `pg_restore` / `psql`** | Procédure de backup de référence non exécutable ici | Disponibles sur le VPS (`postgresql-client`) ; le fallback SQL du dépôt est validé |
| 9 | **Upload de fichiers vers S3** | Le test « image produit → S3 → affichage » est **irréalisable** : la fonctionnalité n'existe pas (aucun SDK S3, aucune route d'upload, `multer` non importé) | **Décision produit à trancher** — l'implémenter serait une nouvelle fonctionnalité, interdite par cette mission |
| 10 | **`/health` sans sonde DB** + **Nginx ne proxifie pas `/health`** | Un 200 sur `/health` ne prouve pas `API → PostgreSQL` ; derrière Nginx, `/health` renverrait la SPA | Décider : ajouter une sonde DB à `/health` et/ou une `location /health` dans Nginx, ou surveiller `/api/v1/health` + smoke |

## 27. Corrections apportées dans cette session

**Aucune fonctionnalité ajoutée, aucune retirée, aucun test modifié ou désactivé, aucune UI
touchée.** Uniquement des corrections factuelles de documents de déploiement qui **contredisaient
l'état réel du code** et auraient produit un déploiement faux :

| Fichier | Ce qui était faux | Correction |
|---|---|---|
| `deploy/.env.production.example` | `DATABASE_URL="file:/var/lib/gawjaay/gawjaay.db"` → **aurait déployé SQLite en production**, en violation directe de la règle « Ne pas utiliser SQLite en production » | `DATABASE_URL` PostgreSQL + avertissement explicite |
| `deploy/DEPLOYMENT.md` §1 | « PostgreSQL **NON requis pour le pilote** (SQLite embarqué) » ; VPS « 2 vCPU / 4 Go / 40 Go » | PostgreSQL 16+ requis ; VPS = Hetzner CPX32 (4 vCPU / 8 Go / 160 Go) avec consigne d'audit préalable |
| `deploy/DEPLOYMENT.md` §4 | « passage à PostgreSQL **non réalisé** … estimation 2-4 jours » | Décision actée : runtime PG **réalisé et prouvé**, avec le détail de ce qui a été fait |
| `deploy/DEPLOYMENT.md` §2 | « migrations **001→006** » | `000_base` + `001`→`008` |
| `deploy/DEPLOYMENT.md` §3 | Backup décrit pour SQLite (`DB_PATH`, `VACUUM INTO`, `gunzip`) | `pg_dump` en référence + `pg_restore` vers base séparée + fallback SQL |
| `deploy/postgres/README.md` | « **7/7** fichiers », « **52** tables », « **243** CHECK », « moteur applicatif reste `node:sqlite` », « portage runtime **à réaliser** », table `001…006` seulement | **9/9**, **53** tables, **248** CHECK (235 NOT NULL + 13 vrais), portage runtime réalisé, `007`/`008` ajoutés, PGlite = PostgreSQL 18.3 |
| `deploy/ecosystem.config.cjs` | commentaire « SQLite : 1 processus en écriture » | Justification réelle (adaptateur PG à connexion unique, pool `max: 1`) |
| `docs/V2_PRODUCTION_READINESS.md` §F | « Sentry **non intégré au code** (aucun SDK installé) » → **faux**, `@sentry/node` 10.75.0 est installé et branché ; « SQLite fichier … PostgreSQL non réalisé » ; VPS « 2 vCPU/4 Go » | Sentry décrit tel quel (intégré, inactif sans DSN) ; PostgreSQL en production ; CPX32 ; défaut Nginx `/health` signalé |

**Vérification après corrections** (commit `de159f4`, poussé sur `origin`) :

| Vérification | Résultat |
|---|---|
| `npx tsc --noEmit` (backend) | OK |
| `npx vitest run` (SQLite) | **334 passed (15 fichiers)** |
| `DATABASE_URL='pglite://' npx vitest run` (PostgreSQL 18.3) | **334 passed (15 fichiers)** |
| `npm run build` | OK — `dist/index.js` + `dist/lib/postgresWorker.cjs` copié |
| Smoke sur build prod + PostgreSQL | **39/39 PASS** |
| `node deploy/postgres/validate.mjs` | **9/9**, idempotence **0**, **53 tables**, 64 FK, 248 CHECK, **parité ✓** |
| `frontend` : `tsc --noEmit` + `npm run build` | OK (317,64 kB / 95,84 kB gzip) |
| CI GitHub sur `de159f4` | **CI Tests `success`** + **E2E Playwright `success`** |

Les artefacts locaux (bases de test, référence SQLite régénérable) ont été supprimés ; `git status`
est **propre**. Aucun test modifié, aucun désactivé.

## 28. Statut final

# TECHNICALLY READY — NOT DEPLOYED

Le code, les migrations, la sécurité applicative et la base de données sont **prouvés sur les deux
moteurs** (334/334 SQLite, 334/334 PostgreSQL, smoke 39/39 sur build production + PostgreSQL,
E2E 8/8 en CI, CI verte sur le commit déployable `7069be3`).

Mais **aucune ressource d'infrastructure réelle n'a été fournie** : pas de VPS, pas de domaine, pas
de PostgreSQL de production, pas de S3, pas de Sentry, pas d'appareils mobiles. Les critères
« Infrastructure » et « Public » de `READY FOR PILOT` ne sont donc **pas démontrés**, et déclarer
`READY FOR PILOT` serait une affirmation sans preuve.

### Tableau des critères de fin

| Critère | Statut | Preuve |
|---|---|---|
| Code validé | **PASS** | 334/334 ×2 moteurs, tsc OK backend + frontend |
| PostgreSQL runtime | **PASS** | 334/334 sur PG 18.3 (PGlite) + job CI `backend-postgres` sur `postgres:16` |
| CI verte | **PASS** | runs `35515323280`+`35515323282` (`7069be3`) et `35522180341`+`35522180384` (`de159f4`) — tous `success` |
| PostgreSQL production | **BLOCKED** | aucune base fournie |
| Migrations | **PASS** (moteurs) / **BLOCKED** (prod) | 8/8 appliquées, idempotence 0, 53 tables, 64 FK, 110 index, parité ✓ |
| VPS | **BLOCKED** | aucune clé SSH, `hcloud` absent, aucune IP |
| Nginx | **BLOCKED** | template prêt, défaut `/health` signalé |
| HTTPS | **BLOCKED** | pas de domaine |
| Domaine | **BLOCKED** | non fourni |
| S3 | **BLOCKED** | pas de bucket — **et fonctionnalité d'upload inexistante** |
| Sentry | **BLOCKED** | SDK 10.75.0 intégré, aucun DSN |
| Secrets | **BLOCKED** | aucun secret réel ; aucun secret dans Git ni dans le bundle |
| Backup | **BLOCKED** | `pg_dump` absent, aucune base de prod |
| Restore | **NOT TESTED** | aucune restauration exécutée |
| URL publique | **BLOCKED** | aucune |
| Smoke production | **NOT TESTED** | smoke 39/39 validé **en local** seulement |
| Sécurité | **PASS** (applicatif) / **BLOCKED** (surface exposée) | 4×403 tenant, RBAC, `costPrice`/`passwordHash` masqués, idempotence |
| Multi-tenant | **PASS** | 4 × 403 mesurés |
| Idempotence | **PASS** | 4 contrôles mesurés |
| IA | **PASS** | refus honnête + CA = valeur réelle en base + PENDING→EXECUTED |
| Mobile réel | **NOT TESTED** | aucun appareil ; Pixel 7 en CI seulement |
| Monitoring | **BLOCKED** | `/health` sans sonde DB ; alertes à brancher |

## 29. Prochaines étapes

0. **Git** : `main` (`7069be3`) ne contient pas encore `de159f4`. Ouvrir une PR
   `arena/01a0bf77-gawjaay` → `main` (CI déjà verte sur `de159f4`) puis la merger, pour que la
   correction du `.env.production.example` soit sur la branche déployée. Supprimer ensuite la
   branche distante périmée `arena/01a0beef-gawjaay` (`fbe3b6b`, déjà contenu dans `main`).
1. Fournir les ressources du §26 (1 → 8). Sans le **VPS** et le **domaine**, rien d'autre
   n'avance.
2. Sur le VPS : auditer la configuration réelle (`uname -a`, `cat /etc/os-release`, `nproc`,
   `free -h`, `df -h`) **avant** toute modification ; sécuriser (admin non-root, clés SSH,
   firewall 22/80/443, fail2ban, NTP) ; installer Node 22 + PostgreSQL 16+ + Nginx + PM2.
3. Créer la base et l'utilisateur PostgreSQL (privilèges minimaux, 5432 non exposé), renseigner
   `backend/.env` depuis `deploy/.env.production.example` (`chmod 600`), **jamais dans Git**.
4. Premier démarrage → vérifier les **8 migrations** dans `_migrations`, puis **backup
   `pg_dump`** + **restauration testée dans une base séparée** avant d'ouvrir quoi que ce soit.
5. Nginx + certbot, puis vérifier **`https://<domaine>/api/v1/health`** (et non `/health`,
   cf. §15).
6. Rejouer le smoke contre l'URL publique : `SMOKE_BASE_URL=https://<domaine> npx tsx
   scripts/smoke.ts` → **attendu 39/39**.
7. Tests mobiles réels (iPhone + Android), audit de sécurité sur surface exposée, cron de backup
   quotidien avec rétention et restauration testée.
8. Trancher le §26.9 (upload S3) et le §26.10 (`/health`) **avant** le pilote.
9. Pilote : 3-5 commerçants, 7 jours minimum, puis bilan. **Pas de V3.**
