# GAWJAAY — FINAL PRODUCTION REPORT

**Date :** 2026-09-20 · **Branche :** `arena/01a0bf08-gawjaay` · **Commit de référence :** `8e7ffd3`
**Statut global : TECHNICALLY READY — NOT DEPLOYED** (aucune infrastructure réelle fournie : VPS, domaine, S3, Sentry)

> Ce rapport ne contient que des éléments **mesurés**. Toute case non mesurable dans l'environnement
> disponible est marquée `BLOCKED` ou `NOT TESTED` — jamais `PASS`.

---

## 1. Git — STATUS: PASS

- Audit initial : l'arbre ne contenait ni `61b48a9` ni `03aabb7`.
  Vérifications : `git rev-parse` (objet absent), `git log --all` (absent), branche distante absente,
  **API GitHub `GET /repos/aydiarra-star/Gawjaay/commits/61b48a9` → HTTP 422 « No commit found for SHA »**.
  Ces deux SHA n'ont jamais existé sur le dépôt.
- Le travail équivalent (storeIds dynamiques + idempotence composite) existe dans `fbe3b6b`, seule
  autre branche distante, dont le parent est exactement la base de cette session (`d5c2470`) :
  intégration par **`git merge --ff-only`** → aucune réécriture d'historique, aucun `push --force`.
- Historique : `d5c2470` → `fbe3b6b` → `8e7ffd3` (branche poussée sur `origin`).
- Arbre de travail : propre après commit.

## 2. PostgreSQL runtime — STATUS: PASS

Preuves (environnement de cette session) :

| Preuve | Résultat mesuré |
|---|---|
| Serveur réellement démarré | **PostgreSQL 18.4** (`initdb` + `pg_ctl`, port 55432, `postgres` compilé, socket Unix) |
| Driver | **`pg` 8.23.0** (le driver de production) — pas un substitut |
| Bootstrap applicatif sur PG | `DB initialized (PostgreSQL)`, 8 migrations appliquées, `SELECT 1` OK |
| Suite complète sur PG réel | **330/330** tests verts (14 fichiers) |
| Suite concurrence sur PG réel | **4/4** |
| Build production + PG | `node dist/index.js` (NODE_ENV=production) démarre, **migrations « à jour »** au redémarrage |
| Smoke HTTP sur build production + PG | **39/39 PASS** |
| CI GitHub (`backend-postgres`) | **success** — PostgreSQL 16, suite complète + build + smoke |

Corrections apportées pour rendre le runtime réellement fonctionnel :

1. **Connexion unique** (`Pool max: 1`) → `BEGIN`/`COMMIT`/`ROLLBACK` s'exécutent sur la même session
   (un pool multi-connexions ne garantit pas l'atomicité).
2. **Parité de types** : `pg` renvoie `int8` (COUNT) et `numeric` (SUM) en **chaînes** — `COUNT(*)`
   valait `'0'` au lieu de `0`. Sans ce correctif, les agrégats (dashboard, statistiques, IA)
   produisaient des concaténations (`'5' + 1 === '51'`).
3. **Worker non bloquant** : `unref()` + `close()` — scripts et tests se terminaient plus jamais
   (processus suspendus 300 s constatés avant correction).
4. **Traduction SQL** : `datetime('now')` → ISO-8601 UTC, `sqlite_master` → catalogue PG,
   `LIKE` → `ILIKE` (SQLite est insensible à la casse, PostgreSQL non), `MAX(a,b)` → `GREATEST`
   (SQLite uniquement).
5. **Mapping des colonnes** : +15 alias manquants (`storeName`, `customerName`, `availableQty`,
   `qtySold`, `totalSpent`, …) — sans eux, l'application lisait `undefined` (bug silencieux).
6. **Packaging** : `postgresWorker.cjs` n'était **pas copié dans `dist/`** par `tsc` → l'API en build
   de production aurait planté au démarrage avec PostgreSQL. Corrigé (`npm run build` copie l'asset) ;
   Dockerfile backend passé en Node 22.

## 3. SQLite dev/test — STATUS: PASS

`npx vitest run` : **330/330** (14 fichiers) — SQLite reste le runtime de développement/tests,
inchangé, aucune fonctionnalité retirée. Le choix de moteur est fait par `DATABASE_URL`
(`postgres://`/`postgresql://`/`pglite:` → PostgreSQL, sinon SQLite).

## 4. Migrations — STATUS: PASS (chiffres recalculés, corrections apportées)

- Fichiers : `000_base` + **8 migrations versionnées** (`001_lot_a` → `008_idempotency`).
- Base vierge → bootstrap + 8 migrations appliquées (SQLite **et** PostgreSQL).
- Base migrée → redémarrage → `[migrations] à jour` : **aucune duplication, aucune corruption**.
- **Métriques mesurées sur la base réelle (identiques SQLite et PostgreSQL)** :
  **54 tables** (dont `_migrations`/journal du runner → **53 tables métier**),
  **64 clés étrangères**, **54 PK**, **31 UNIQUE**, **110 index**, **8 migrations**.
- ⚠️ **Correction documentaire** : les documents précédents annonçaient « 247 CHECK ».
  Vérification à la source : `information_schema.table_constraints` en PostgreSQL compte les
  colonnes `NOT NULL` comme des `CHECK` (238 NOT NULL + **13 vrais CHECK = 251**).
  Le nombre réel de contraintes `CHECK` est **13** (mesuré sur les deux moteurs).

## 5. Tests — STATUS: PASS

- SQLite : **330/330** · PostgreSQL réel : **330/330** · Concurrence : **4/4** sur les deux moteurs
- Donc **334 tests** au total, tous verts sur les deux moteurs (330 + 4).
- Tests ajoutés dans cette phase (aucun test supprimé ni désactivé) :
  - `concurrency.test.ts` (4) : 10 ventes simultanées pour 5 articles → 5 succès/5 refus, stock 0,
    jamais négatif ; vente multi-lignes contestée ; comptage des mouvements ; confirmation
    concurrente d'une action IA → une seule exécution.
  - `v2-prod-hardening.test.ts` : **5 tests HTTP réels** remplaçant un test synthétique qui
    re-simulait la logique de masquage au lieu d'appeler l'API (il ne prouvait rien).
- CI : `backend` (SQLite + `tsc`), `backend-postgres` (PG 16 réel + build + smoke), `frontend`
  (`tsc` + build) → **tous verts**.

## 6. Smoke — STATUS: PASS

`backend/scripts/smoke.ts` (nouveau, rejouable contre n'importe quelle URL cible via
`SMOKE_BASE_URL`) : **39/39 PASS** contre le **build de production sur PostgreSQL réel**.
Couvre : santé, auth (register/login/me), boutique, produit, stock, **scénario critique storeIds**
(nouveau magasin utilisable sans reconnexion), vente CASH, décrément de stock, statistiques,
boutique publique, **absence de costPrice**, recherche publique, client, commande RETRAIT,
**prix serveur imposé** (prix client falsifié ignoré), confirmation, **isolation multi-tenant (403)**,
**idempotence** (même réponse, une seule opération, indépendance par utilisateur), assistant IA
(hors périmètre → « Je ne dispose pas de cette information » ; CA annoncé = CA réel en base),
action IA PENDING → confirmation → EXECUTED → horodatage, RBAC audit (403 marchand).

## 7. Playwright — STATUS: PASS (CI) · NOT TESTED (local)

- **CI E2E Playwright : success** sur le commit `8e7ffd3` — Chromium réel sur GitHub Actions,
  **8/8** parcours (mobile Pixel 7 + desktop), incluant panier, checkout, inventaire,
  authentification, protections tenant.
- Exécution locale impossible : le téléchargement de Chromium est bloqué depuis le sandbox
  (`Download failure`) → `NOT TESTED` localement, sans incidence : la CI est la référence.

## 8. Security — STATUS: PASS (failles trouvées et corrigées)

**Failles réelles découvertes par audit puis corrigées dans cette phase :**

| Faille | Impact | Correction |
|---|---|---|
| `GET /stores/slug/:slug` (public) renvoyait `SELECT *` des produits → **`costPrice` exposé** | Un anonyme lisait le prix d'achat du marchand (ses marges) | Masquage serveur ; propriétaire/ADMIN conservent la marge (`optionalAuth` + règle unique `publicPayload.ts`) |
| `GET /auth/me` renvoyait `passwordHash` | Hash bcrypt envoyé au client | Champ retiré |
| `GET /admin/users` renvoyait `passwordHash` | Même pour un ADMIN | Champ retiré |

- Le « fix HIGH costPrice » du cycle précédent était **incomplet** et son test **synthétique**
  (il recopiait la logique dans le test au lieu d'appeler l'API) : remplacé par 5 tests HTTP réels
  couvrant toutes les surfaces publiques.
- Vérifié également : RBAC (403 rôle non autorisé), isolation tenant, `Idempotency-Key`,
  rate-limiting actif en production (5 connexions/min constatées → 429),
  CORS production limité à `FRONTEND_URL`, Helmet, `NODE_ENV=production` refuse de démarrer avec les
  secrets de développement (`fail-fast`), **aucun secret** dans le bundle frontend, dans Git
  (seuls `.env.example`) ou en dur dans le code.
- HTTPS / reverse proxy : dépend de l'infrastructure → **BLOCKED** (§13-14).

## 9. Multi-tenant — STATUS: PASS

Vérifié en test **et** par smoke sur environnement PG réel : lecture stock, écriture produit, vente et
action sur commande d'un tenant A par un tenant B → **403** dans les 4 cas ; falsifier un `storeId`
n'ouvre aucun accès ; l'IA est scopée par boutique.

## 10. Idempotence — STATUS: PASS

`Idempotency-Key` : deux requêtes identiques → **même réponse et une seule opération métier**
(stock décrémenté une fois) ; la même clé pour un **autre utilisateur** produit une opération
**indépendante** ; clé primaire `(key, endpoint, userId)` ; journaux conservés. Validé également en
concurrence.

## 11. AI — STATUS: PASS

- Aucune invention : question hors périmètre → `intent=UNKNOWN` + **« Je ne dispose pas de cette
  information »** ; réponse chiffrée = valeur réellement en base (comparée à l'API de statistiques).
- Whitelist inchangée : `GENERATE_REPLENISHMENT_PLAN`, `SEND_LOW_STOCK_ALERT` (aucune action ajoutée).
- Cycle `PENDING` → confirmation explicite → `EXECUTED` → journalisé (audit), non contournable (403),
  sans double exécution même en confirmation concurrente.

## 12. VPS — STATUS: BLOCKED

Aucun hôte fourni (IP/hostname, accès SSH, OS) → aucun déploiement n'a été effectué.

## 13. Domain — STATUS: BLOCKED

Aucun domaine ni zone DNS fournis.

## 14. HTTPS — STATUS: BLOCKED

Dépend du VPS + domaine. Configuration prête dans `deploy/` (nginx + certbot décrits), non applicable.

## 15. S3 — STATUS: BLOCKED

Aucun `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` fourni.
Aucune valeur inventée : l'upload S3 du backup reste conditionné à la présence d'un bucket réel.

## 16. Sentry — STATUS: BLOCKED

Aucun `SENTRY_DSN` fourni. Le code est prêt et **inactif sans DSN** (initialisation conditionnelle,
5xx uniquement, sans données personnelles).

## 17. Backup — STATUS: PASS (réel, sur PostgreSQL) · pg_dump NOT TESTED

- `pg_dump` **absent** de l'environnement : la procédure officielle (`deploy/backup.sh`, format custom)
  n'a pas pu être exécutée ici → `NOT TESTED` pour ce chemin précis.
- Un **backup logique réel** a donc été produit par un outil du dépôt
  (`deploy/pg-backup.mjs`) : **54 tables, 331 lignes, 150 Ko**, cohérent (transaction unique,
  schéma + données + contraintes + index, manifeste de lignes).
- Backup SQLite (`VACUUM INTO` + `integrity_check`) : déjà validé (documenté le 2026-09-20).

## 18. Restore — STATUS: PASS (réel)

Restauration **effective** dans une base distincte (`gawjaay_restore_test`) via
`deploy/pg-restore.mjs` : dump rejoué en 89 ms, puis contrôles automatiques →
**aucune divergence** de lignes sur les 54 tables, `ventes ↔ lignes de vente` = 0 anomalie,
`commandes ↔ lignes` = 0 anomalie, **stock jamais négatif**, **8 migrations** restaurées.
Un bug réel a été trouvé et corrigé grâce à ce test : les clés étrangères étaient émises avant les
clés primaires référencées (`transformFkeyCheckAttrs`) → dump désormais en **deux passes**.
Procédure, rétention (14 j), emplacement et responsabilités : `docs/BACKUP_RESTORE.md`.

## 19. Public URL — STATUS: BLOCKED

Aucune URL publique : l'application n'a tourné qu'en local (jamais exposée sur Internet).
Aucun test sur URL publique n'a donc pu être réalisé.

## 20. Mobile — STATUS: PASS (CI, émulation) · NOT TESTED (appareil réel)

Parcours mobile exécutés en CI avec le profil **Pixel 7** (Chromium réel) : 8/8 verts.
Test sur téléphone physique : `NOT TESTED` (aucun appareil dans l'environnement).

## 21. Pilot readiness — STATUS: TECHNICALLY READY — NOT DEPLOYED

Le code, les tests, la sécurité et la base de données sont prouvés sur les deux moteurs, mais
**aucune infrastructure réelle n'est opérationnelle** : les conditions « Infrastructure » et
« Public » de la définition de `READY FOR PILOT` ne sont pas démontrées.

## 22. Blockers

| # | Ressource manquante | Impact | Action nécessaire |
|---|---|---|---|
| 1 | VPS (IP/hostname + accès SSH + OS) | Aucun déploiement, aucun test réel sur URL | Fournir l'hôte et un accès administrateur |
| 2 | Domaine + DNS | Pas d'URL publique, pas de HTTPS | Fournir le domaine et créer les enregistrements |
| 3 | PostgreSQL de production (`DATABASE_URL`) | Pas de base de production, pas de backup/restore réels de production | Fournir une base PG (ou l'héberger sur le VPS) |
| 4 | S3 (`S3_*`) | Pas de copies distantes des sauvegardes | Fournir un bucket et des clés dédiées |
| 5 | Sentry (`SENTRY_DSN`) | Pas d'alerte d'erreur automatique | Fournir le DSN |
| 6 | `pg_dump`/`pg_restore`/`psql` (absents du sandbox) | Procédure pg_dump non exécutée ici | Disponibles sur un VPS standard (paquet postgresql-client) ; le fallback SQL est validé |

## 23. Next actions

1. Fournir les ressources du §22 (VPS, domaine, base PG, S3, Sentry).
2. Sur le VPS : installer Node 22 + PostgreSQL + nginx, `npm ci && npm run build`, renseigner
   `DATABASE_URL` et les secrets (JWT, OAuth/OTP), puis `pm2 start deploy/ecosystem.config.cjs`.
3. Activer HTTPS (certbot), vérifier `GET /health`, puis rejouer
   `SMOKE_BASE_URL=https://<domaine> npx tsx scripts/smoke.ts` → attendu 39/39.
4. Configurer le cron de backup (`deploy/crontab.example`) avec `pg_dump`, puis **tester une
   restauration réelle** sur le serveur (§17-18) avant d'ouvrir le pilote.
5. Ouvrir le pilote (3-5 commerçants, 7 jours) avec le protocole `docs/PILOT.md`.
