# GawJaay V2 — Migrations PostgreSQL

Portage **fidèle** des migrations V2 (base V1 `db.ts` + 001→006, puis 007 index prod et
008 idempotence) en dialecte PostgreSQL, **validé sur un moteur PostgreSQL réel** via PGlite
(PostgreSQL compilé en WASM ; PGlite 0.5.8 embarque PostgreSQL 18.3).

## Contenu

| Fichier | Source 1:1 |
|---|---|
| `000_base.sql` | `backend/src/lib/db.ts` (schéma V1 : 30 tables) |
| `001_lot_a.sql` … `006_lot_f.sql` | `backend/src/migrations/versions/00{1..6}_*.ts` |
| `007_prod_indexes.sql` | `backend/src/migrations/versions/007_prod_indexes.ts` |
| `008_idempotency.sql` | `backend/src/migrations/versions/008_idempotency.ts` |

Transformations de dialecte **uniquement** :
- `datetime('now')` → `now()::text` (colonnes TEXT, l'application écrit des chaînes ISO) ;
- lignes `PRAGMA` retirées (sans objet en PG).

## Validation exécutée (`node validate.mjs`)

1. **Fresh database** : base PG vierge → **9/9** fichiers appliqués dans l'ordre
   (`000_base` + `001`→`008`), journalisés dans `schema_migrations`.
2. **Idempotence** : 2ᵉ exécution → **0** ré-application.
3. **Intégrité** : **54 tables** (53 tables métier + le journal), **64 FK**, **13 vrais CHECK**.
   ⚠️ Le compteur affiché par `validate.mjs` provient d'`information_schema.table_constraints`, qui
   en PostgreSQL **inclut les contraintes `NOT NULL`**. Ce nombre est **dépendant du moteur** :
   mesuré **249** sur PostgreSQL 16.6 (236 NOT NULL + 13 CHECK) et **248** sur le PostgreSQL 18.3
   embarqué par PGlite. La seule valeur stable et comparable entre moteurs est le nombre de
   **vrais `CHECK` : 13** (identique à SQLite).
4. **Parité** : comparaison systématique avec la référence SQLite
   (`reference-schema.sqlite`, régénérable) — tables, colonnes/classes de types,
   NOT NULL, PK, FK, index explicites.

### Parité mesurée sur PostgreSQL 16.6 réel (audit phase finale)

Comparaison, sur le **même serveur**, du chemin **déploiement** (ces fichiers `.sql`) et du chemin
**application** (`backend/src/lib/postgresBaseSchema.ts` + migrations TypeScript) :

| Métrique | Chemin déploiement | Chemin application | Verdict |
|---|---|---|---|
| Tables | 54 | 54 | identique |
| Colonnes (métier) | 488 | 489 | écart = journal seul |
| Clés étrangères | 64 | 64 | identique |
| Vrais `CHECK` | 13 | 13 | identique |
| Clés primaires | 54 | 54 | identique |
| Types de colonnes divergents | — | — | **aucune** |

Le **schéma métier est strictement identique**. Le seul écart porte sur la table de journal :
`schema_migrations` (2 colonnes, 1 PK) côté déploiement, `_migrations` (3 colonnes, 1 PK + 1 UNIQUE)
côté application — d'où les écarts `-1` sur colonnes/index.

### Vérification du chemin de déploiement de bout en bout

```bash
cd backend
DATABASE_URL=postgresql://…/gawjaay_deploy_check \
PG_ADMIN_URL=postgresql://…/postgres \
node scripts/verify-deploy-path.mjs
```

Exécuté **en CI** (job `backend-postgres`, serveur `postgres:16` réel) et en local sur
PostgreSQL 16.6 : base vierge → 9/9 fichiers → idempotence 0 → intégrité (54 tables, 64 FK,
13 CHECK, 109 index) → **démarrage de l'API sur cette base**. Ce dernier point est une
**régression corrigée** : le runner applicatif ne voyait pas le journal `schema_migrations`,
rejouait la migration 001 et échouait au démarrage
(`column "targetType" of relation "reviews" already exists`). Le runner détecte désormais ce
journal externe, adopte les migrations déjà appliquées **sans les ré-exécuter**, puis les recopie
dans `_migrations` (une seule source de vérité).

## Régénérer la référence SQLite

```bash
cd backend && npx tsx scripts/generate-sqlite-reference.ts   # écrit deploy/postgres/reference-schema.sqlite
cd ../deploy/postgres && npm install && node validate.mjs
```

## Conventions & limites (documentées, aucune invention)

- **Identifiants en minuscules côté PG** : PostgreSQL replie les identifiants non quotés
  (`merchantId` → `merchantid`). Convention retenue : colonnes en minuscules ; le futur
  driver applicatif PG devra écrire ses requêtes en minuscules (ou quoter explicitement).
- `reference-schema.sqlite` et `node_modules/` ne sont pas versionnés (régénérables).
- **Portée de cette validation : le SCHÉMA** (parité SQLite ↔ PostgreSQL).
  Le **portage runtime est réalisé** : l'application tourne sur PostgreSQL via le driver `pg`
  (`backend/src/lib/postgresAdapter.ts` + `backend/src/lib/postgresWorker.cjs`), activé par un
  `DATABASE_URL` en `postgresql://`. Toute la suite de tests est verte sur les deux moteurs et le
  job CI `backend-postgres` rejoue suite + build + smoke HTTP contre un `postgres:16` réel.
  Détails : `deploy/DEPLOYMENT.md` §4.
- Rollback : forward-only (identique au runner SQLite) ; retour arrière = restauration backup.
