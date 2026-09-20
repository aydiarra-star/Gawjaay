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
3. **Intégrité** : **53 tables**, **64 FK**, **248 CHECK**.
   ⚠️ Le compteur `CHECK` provient d'`information_schema.table_constraints`, qui en PostgreSQL
   inclut les contraintes `NOT NULL` : sur ces 248, seulement **13** sont de vrais `CHECK` métier
   (les 235 autres sont des `NOT NULL`).
4. **Parité** : comparaison systématique avec la référence SQLite
   (`reference-schema.sqlite`, régénérable) — tables, colonnes/classes de types,
   NOT NULL, PK, FK, index explicites → **identique (53 tables)**.

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
