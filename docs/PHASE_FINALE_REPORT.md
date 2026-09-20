# GAWJAAY — FINAL PRODUCTION REPORT

**Date :** 2026-09-20 · **Branche :** `arena/01a0bff1-gawjaay` @ **`67b16b2`** (poussée sur `origin`)
**Base :** `main` = `73ea34f` · **Statut global : TECHNICALLY READY — NOT DEPLOYED**

> Aucune ressource d'infrastructure n'a été fournie par l'exploitant (pas de VPS, domaine, PostgreSQL
> de production, bucket S3, DSN Sentry). **Rien n'a été simulé** : chaque ressource absente est
> marquée `BLOCKED`. Tous les chiffres de ce rapport sont **mesurés**, jamais estimés.

## 0. Résumé

| Bloc | Statut |
|---|---|
| Code, tests, migrations, sécurité applicative | **PASS** |
| Infrastructure (VPS, domaine, HTTPS, PostgreSQL prod, S3, Sentry) | **BLOCKED** |
| Tests sur URL publique / appareil mobile réel | **NOT TESTED** |

Un **bug bloquant de déploiement** a été trouvé, reproduit et corrigé (§4) : l'API ne démarrait pas
sur une base créée par les fichiers SQL de déploiement.

---

## 1. Git — STATUS: PASS

- Arbre de travail **propre** à la fin de session (`git status` vide).
- Deux commits poussés sans `--force`, sans `rebase`, sans `reset --hard` :
  - **`4256942`** — `fix(db): démarrage de l'API sur une base migrée par deploy/postgres/*.sql + preuves phase finale`
  - **`67b16b2`** — `docs(pg): parité mesurée sur PostgreSQL 16.6 + chemin de déploiement vérifié`
- `git push origin arena/01a0bff1-gawjaay` → `* [new branch]` puis `4256942..67b16b2` (avance simple).
- Remote unique : `origin → https://github.com/aydiarra-star/Gawjaay.git`.
- Clone à nouveau **non shallow** (`git fetch --unshallow` a récupéré l'historique complet).

**Commits `61b48a9` et `03aabb7` — vérifiés via l'API GitHub :**

| SHA annoncé | Réalité mesurée |
|---|---|
| `61b48a9` | **HTTP 422 « No commit found for SHA »** → n'a jamais existé sur ce dépôt |
| `03aabb7` | **HTTP 422 « No commit found for SHA »** → n'a jamais existé sur ce dépôt |
| `fbe3b6b` | **existe** — porte exactement leur contenu : `feat(pg): postgresql runtime + dynamic storeids + composite idempotency (325/325)`, et est **déjà contenu dans `main`** (`git merge-base --is-ancestor` → oui) |

Le travail décrit (storeIds relus depuis la base, clé d'idempotence `(key, endpoint, userId)`) est donc
**présent, intégré et vérifié** — voir §10 et §11. Aucune réécriture d'historique n'a été nécessaire.

## 2. PostgreSQL runtime — STATUS: PASS

**Preuve sur un vrai serveur PostgreSQL 16.6** (binaires PostgreSQL officiels obtenus via npm,
`initdb` + `postgres` lancés localement — ce n'est ni PGlite ni un substitut) :

- `DATABASE_URL` en `postgresql://` sélectionne le driver `pg` (`backend/src/lib/db.ts`) ; runtime
  vérifié dans les logs : `[db] Runtime: PostgreSQL via 127.0.0.1:55432/gawjaay_test`.
- **365/365 tests passent sur PostgreSQL 16.6** (et 365/365 sur SQLite).
- **Build de production + smoke HTTP 39/39** sur PostgreSQL (`node dist/index.js`).
- CI : job `backend-postgres` (service `postgres:16`) **vert** — suite complète + chemin de
  déploiement + build + smoke.
- Parité de comportement mesurée : agrégats numériques (`int8`/`numeric` reparsés), `LIKE`→`ILIKE`,
  `datetime('now')`→ISO, `sqlite_master`→catalogue PG, casse restaurée à la lecture.

## 3. SQLite dev/test — STATUS: PASS

`DATABASE_URL` en `file:` (ou vide) → `node:sqlite`. **365/365** en local et dans le job CI `backend`.
SQLite reste intégralement supporté : aucune fonctionnalité retirée.

## 4. Migrations — STATUS: PASS (1 bug bloquant trouvé et corrigé)

**Bug trouvé et reproduit** (PostgreSQL 16.6 réel) : les fichiers `deploy/postgres/*.sql` journalisent
dans `schema_migrations` (noms de fichiers), le runner applicatif dans `_migrations`. Un exploitant
appliquant les fichiers SQL puis démarrant l'API voyait le runner rejouer la migration 001 et
**échouer au démarrage** :

```
Error: column "targetType" of relation "reviews" already exists
```

`ALTER TABLE ADD COLUMN` n'est pas idempotent : l'idempotence est portée par le journal, pas par la
migration. La « chaîne idempotente » documentée ne tenait que dans **un seul** journal.

**Correction** (`backend/src/migrations/runner.ts`) : le runner détecte le journal externe,
**adopte** les migrations déclarées sans les ré-exécuter, puis les recopie dans `_migrations`.
Cas nominal strictement inchangé (SQLite comme PostgreSQL). Après correctif : l'API **démarre** et
`/health` répond 200 sur cette base.

**Chiffres recalculés** (jamais repris de la documentation) :

| Métrique | Chemin déploiement (`.sql`) | Chemin application (TS) | SQLite |
|---|---|---|---|
| Tables | 54 | 54 | 54 |
| dont tables métier | 53 | 53 | 53 |
| Clés étrangères | **64** | **64** | **64** |
| Vrais `CHECK` | **13** | **13** | **13** |
| Clés primaires | 54 | 54 | 54 |
| Index | 109 | 110 | 110 |
| Colonnes | 488 | 489 | 489 |
| Divergences de type | — | — | **aucune** |

> **Le « 248 CHECK » de l'énoncé n'est pas un nombre de `CHECK`.** `information_schema` compte les
> `NOT NULL` comme `CHECK` en PostgreSQL : mesuré **249** (236 `NOT NULL` + 13 `CHECK`) sur PG 16.6 et
> **248** sur PGlite (PG 18.3). Ce compteur **dépend du moteur** ; la valeur comparable est **13 vrais
> `CHECK`**, identique sur les trois chemins. La documentation a été corrigée en conséquence.

- **8 migrations applicatives** appliquées, journal `_migrations` = 8.
- **Idempotence** : 2ᵉ exécution → **0** ré-application (les deux chemins).
- **Base vide → migrations → application** : vérifié ; **redémarrage** : aucune duplication, aucune
  corruption.
- `backend/scripts/verify-deploy-path.mjs` exécute cette vérification de bout en bout et est branché
  dans le job CI `backend-postgres`.

## 5. Tests — STATUS: PASS

| Suite | SQLite | PostgreSQL 16.6 réel |
|---|---|---|
| Vitest (17 fichiers) | **365 / 365** | **365 / 365** |

Évolution : **334** (baseline) → **365** (+31), soit **+27** épreuves critiques `phase-finale.test.ts`
et **+4** régressions `deploy-migrations.test.ts`. **Aucun test supprimé ni désactivé.**

**Couverture PostgreSQL complétée** : `auth.test.ts`, `payment.test.ts` et `stock.test.ts`
**ignoraient `TEST_DATABASE_URL`** — dans le job PostgreSQL de la CI ils s'exécutaient en réalité sur
SQLite. Ils respectent désormais le moteur configuré : l'authentification, les paiements et le stock
sont réellement exercés sur PostgreSQL.

TypeScript : `backend` **OK**, `frontend` (`--noEmit`) **OK**. Builds : backend **OK**
(`dist/lib/postgresWorker.cjs` copié), frontend **OK** (317,64 kB / 95,84 kB gzip).

## 6. Smoke — STATUS: PASS

**39/39** sur le **build de production** (`node dist/index.js`) + **PostgreSQL 16.6 réel** :
auth, marchand, boutique, produit, stock, vente CASH, statistiques réelles, catalogue public, absence
de `costPrice`, client, commande, prix serveur, confirmation, multi-tenant (403), idempotence,
assistant IA, action IA `PENDING → EXECUTED`, audit. Le job CI exécute la même commande.
L'énoncé demandait ≥ 31 : **39** couvertes.

## 7. Playwright — STATUS: PASS (CI)

- Workflow **E2E Playwright vert** sur `4256942` **et** `67b16b2` (Chromium réel sur GitHub Actions),
  étape « Install Playwright Chromium » et « Run E2E parcours » `success` — **8/8** parcours.
- **Limite locale documentée** : le CDN Chromium est **injoignable depuis cet environnement**
  (téléchargement en échec), donc **aucune validation Playwright locale n'a été possible**.
  Conformément à l'énoncé (« aucune validation locale ne remplace la CI réelle »), la CI fait foi.
  Aucun test E2E n'a été contourné, désactivé ou marqué `skip`.

## 8. Security — STATUS: PASS (applicatif) / BLOCKED (HTTPS, headers de bord)

Mesuré :

- **Aucun secret dans le bundle frontend** (`sk-…`, `ghp_…`, `AKIA…`, `PRIVATE KEY` : **0 occurrence**) ;
  seules URLs présentes : `reactjs.org`, `github.com`, `wa.me`.
- **Aucun `.env` versionné** ; aucun secret en dur dans Git (seuls des placeholders `.example`).
- **Fail-fast production** : l'API refuse de démarrer avec les secrets JWT de développement.
- **`costPrice` masqué** sur toutes les surfaces publiques (4 surfaces testées) et **conservé** pour le
  propriétaire.
- **RBAC** : 403 mesurés (marchand → `/admin/stats`, employé sans permission stock).
- **Rate limiting** actif (en-têtes vérifiés), **helmet** appliqué, **CORS** restreint à
  `FRONTEND_URL` en production.
- **Idempotence** sur les opérations d'argent ; **audit** horodaté.

Non mesurable ici : HTTPS/HSTS, CSP et en-têtes au niveau « edge », CSRF (non applicable : auth par
`Bearer`).

## 9. Multi-tenant — STATUS: PASS

Isolation prouvée en HTTP réel (§9 de l'énoncé) : **stores, produits, stock, ventes, commandes,
clients, fournisseurs, statistiques, IA**. Tenant B obtient **403** (ou 404/refus) et **aucune donnée
de A** n'est readable ni modifiable ; les valeurs en base de A sont vérifiées **inchangées** après
tentative. La liste publique des produits est, par conception (vitrine), filtrée en **projection**
(aucun champ interne) et son **écriture** est refusée.

## 10. Idempotence — STATUS: PASS

- Clé primaire composite **`(key, endpoint, userId)`** vérifiée **dans les deux moteurs**
  (contrainte PK lue en base).
- Rejeu même triplé : **une seule opération métier**, réponse **rejouée à l'identique**, stock
  décrémenté **une seule fois**.
- **User A + clé X** et **User B + clé X** → opérations **indépendantes** (2 lignes distinctes par
  `userId`), aucune collision inter-tenant.
- **Journaux conservés** et horodatés ; une seconde frappe ne crée **pas** de doublon.
- Sans en-tête : comportement V1/V2 **inchangé** (aucune régression).

## 11. AI — STATUS: PASS

- Réponses **ancrées sur les données réelles** : nom et quantité exacts du produit sous seuil
  (vérifiés en base).
- **« Je ne dispose pas de cette information »** mesuré pour : boutique **sans aucune vente**,
  question **hors périmètre**. Aucune invention de stock, prix, ventes, CA, commande, paiement.
- **Whitelist strictement limitée à 2 actions** : `GENERATE_REPLENISHMENT_PLAN`,
  `SEND_LOW_STOCK_ALERT`. Action hors whitelist → **400**, **aucune ligne créée**.
- Cycle **`PENDING → confirmation explicite → EXECUTED → audit`** vérifié
  (un refus explicite n'exécute pas). **Aucune action IA ajoutée** dans cette phase.

## 12. VPS — STATUS: BLOCKED

Aucun VPS fourni (pas d'IP/hostname, pas d'accès SSH). Aucun VPS simulé.

## 13. Domain — STATUS: BLOCKED

Aucun domaine ni zone DNS fournis. Aucun domaine inventé.

## 14. HTTPS — STATUS: BLOCKED

Dépend du domaine (§13). Procédure prête (`certbot --nginx`, `deploy/nginx.conf.example`), **non
exécutée**.

## 15. S3 — STATUS: BLOCKED

Aucun `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` fourni.
**Aucune valeur inventée.**

## 16. Sentry — STATUS: BLOCKED

Aucun `SENTRY_DSN` fourni. Le code est prêt : Sentry est **no-op si le DSN est absent** ; aucune
initialisation factice.

## 17. Backup — STATUS: PASS (exécution locale réelle) / BLOCKED (production)

**Backup PostgreSQL réellement exécuté** sur PostgreSQL 16.6 (`deploy/pg-backup.mjs`) :
**54 tables, 68 lignes, 57,1 Ko**, manifeste de contrôle écrit (compteur de lignes par table,
`users=3 stores=3 products=3 inventories=3 sales=3 orders=1 audit_logs=12 _migrations=8`…).
L'absence de `pg_dump` dans cet environnement est **documentée** (le fallback JS du dépôt est la voie
empruntée) — la référence de production reste `pg_dump -Fc` (`deploy/backup.sh`).
**Backup de production : BLOCKED** (pas de `DATABASE_URL` de production, pas de S3 pour la copie hors
site).

## 18. Restore — STATUS: PASS (exécution locale réelle) / BLOCKED (production)

**Restauration réellement exécutée** dans une base **séparée** (`gawjaay_restore`), puis **vérifiée
indépendamment** (script d'audit distinct, pas seulement l'auto-contrôle du script) :

| Contrôle | Source | Restaurée |
|---|---|---|
| users / stores / products / inventories / sales | 3 / 3 / 3 / 3 / 3 | **identiques** |
| orders / order_items / payments | 1 / 1 / 1 | **identiques** |
| audit_logs / ai_action_requests / idempotency_keys | 12 / 1 / 2 | **identiques** |
| `_migrations` | 8 | **8** |
| Somme des ventes | 46 000 FCFA | **46 000 FCFA** |
| Tables / clés étrangères | 54 / 64 | **54 / 64** |

**AUCUNE divergence.** Contrôles métier du script : ventes ↔ lignes de vente, commandes ↔ lignes,
stock jamais négatif, migrations présentes.
**Restauration de production : BLOCKED** (aucune base de production — ne pas la déclarer testée).

## 19. Public URL — STATUS: BLOCKED

Aucune URL publique accessible : aucune ressource de déploiement fournie. Les parcours visiteur,
client et marchand **n'ont pas pu être testés hors environnement local**. `/health` répond
correctement en local et en CI (build de production + PostgreSQL), mais cela **ne vaut pas** test sur
URL publique.

## 20. Mobile — STATUS: PASS (CI) / NOT TESTED (appareil réel)

Les parcours mobiles du plan Playwright (panier, inventaire, checkout, authentification, protections
tenant) sont **verts en CI avec Chromium réel**. Aucun test sur appareil physique : **NOT TESTED**.

## 21. Pilot readiness — STATUS: NOT READY FOR PILOT

Le critère §30/§26 de l'énoncé exige des ressources d'infrastructure **opérationnelles** (VPS,
domaine, HTTPS, PostgreSQL de production, S3, monitoring, backup/restore de production, URL publique
validée). Aucune n'est fournie. Le pilote **ne peut pas** commencer.
Statut retenu, conformément à la §32 : **TECHNICALLY READY — NOT DEPLOYED**.

## 22. Blockers

| # | Ressource manquante | Impact | Action nécessaire |
|---|---|---|---|
| 1 | **VPS** (IP/hostname + SSH) | Ni backend ni frontend ne peuvent tourner hors CI | Fournir hôte, SSH, OS audité |
| 2 | **Domaine + DNS** | URL publique impossible ; HTTPS impossible | Fournir domaine + zone DNS |
| 3 | **Certificat HTTPS** | Cookies sécurisés / HTTPS non vérifiables | `certbot` après DNS (§14) |
| 4 | **PostgreSQL de production** (`DATABASE_URL`) | Aucun backup/restore/monitoring de production | Fournir l'URL (base dédiée, non partagée) |
| 5 | **Bucket S3** (+ clé IAM `PutObject`) | Sauvegardes non déportées hors VPS | Fournir endpoint/région/bucket/clés |
| 6 | **SENTRY_DSN** | Aucune alerte d'erreur en production | Fournir le DSN |
| 7 | **Secrets de production** (JWT, cookies, OTP, sessions) | L'API refuse de démarrer sans eux (fail-fast voulu) | Générer et injecter hors Git |
| 8 | **Monitoring VPS / PostgreSQL / uptime** | Aucune alerte de disponibilité | Fournir l'outil ou l'accès |
| 9 | **`postgresql-client` sur le VPS** | `pg_dump`/`pg_restore` indisponibles (fallback JS seulement) | `apt install postgresql-client` |
| 10 | **Contrats/API officiels Wave / Orange Money** | Paiements mobiles resteraient en **sandbox** | Ne pas présenter le sandbox comme réel |

## 23. Next actions

1. **Fournir les 10 ressources** ci-dessus (aucune ne peut être inventée).
2. Déployer selon `deploy/DEPLOYMENT.md` (git → build → migrations → PostgreSQL → API → frontend →
   nginx → HTTPS).
3. Exécuter les **tests sur URL publique** (§24) : visiteur, client, marchand, sécurité cross-tenant,
   idempotence réelle, `/health`.
4. **Backup + restauration de production réels** (`docs/BACKUP_RESTORE.md`), puis planifier un test de
   restauration récurrent.
5. Activer monitoring/alertes (Sentry + monitoring VPS + PostgreSQL).
6. Vérifier mobile sur appareil réel.
7. Alors seulement : **READY FOR PILOT** → pilote 3–5 commerçants / ≥ 7 jours, avec classification
   des retours (`BUG BLOQUANT` / `MAJEUR` / `MINEUR` / `UX` / `DEMANDE` / `HORS PÉRIMÈTRE`).

---

### Annexe — Preuves d'exécution (toutes mesurées)

| Preuve | Commande | Résultat |
|---|---|---|
| Tests SQLite | `cd backend && npx vitest run` | **365/365** (17 fichiers) |
| Tests PostgreSQL 16.6 | `TEST_DATABASE_URL=… npx vitest run` | **365/365** (17 fichiers) |
| TypeScript backend | `npx tsc --noEmit` | OK |
| TypeScript frontend | `frontend npx tsc --noEmit` | OK |
| Build backend | `npm run build` | OK (`dist/index.js` + `dist/lib/postgresWorker.cjs`) |
| Build frontend | `npm run build` | OK (317,64 kB / 95,84 kB gzip) |
| Smoke HTTP (prod + PG) | `npx tsx scripts/smoke.ts` | **39/39 PASS** |
| Chemin de déploiement | `node scripts/verify-deploy-path.mjs` | **VÉRIFIÉ** (0 échec) |
| CI `backend` | GitHub Actions | **success** |
| CI `backend-postgres` | GitHub Actions | **success** |
| CI `frontend` | GitHub Actions | **success** |
| CI `e2e` (Playwright) | GitHub Actions | **success** |

**Mentions honnêtes :** le CDN Playwright est injoignable depuis cet environnement (aucun E2E local) ;
`psql`/`pg_dump`/`pg_restore` sont absents (backup/restore exécutés avec les outils du dépôt, sur un
**vrai** serveur PostgreSQL 16.6, jamais un substitut) ; les logs de job CI ne sont pas téléchargeables
depuis cet environnement (blob Azure inaccessible), la vérification CI s'appuie donc sur les
**conclusions d'étapes** fournies par l'API GitHub.
