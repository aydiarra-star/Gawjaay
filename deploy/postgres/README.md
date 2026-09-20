# GawJaay V2 — Migrations PostgreSQL

Portage **fidèle** des migrations V2 (base V1 `db.ts` + 001→006) en dialecte PostgreSQL,
**validé sur un PostgreSQL 16 réel** via PGlite (moteur PostgreSQL WASM).

## Contenu

| Fichier | Source 1:1 |
|---|---|
| `000_base.sql` | `backend/src/lib/db.ts` (schéma V1 : 30 tables) |
| `001_lot_a.sql` … `006_lot_f.sql` | `backend/src/migrations/versions/00{1..6}_*.ts` |

Transformations de dialecte **uniquement** :
- `datetime('now')` → `now()::text` (colonnes TEXT, l'application écrit des chaînes ISO) ;
- lignes `PRAGMA` retirées (sans objet en PG).

## Validation exécutée (`node validate.mjs`)

1. **Fresh database** : base PG vierge → 7/7 fichiers appliqués dans l'ordre (journal `schema_migrations`).
2. **Idempotence** : 2ᵉ exécution → 0 ré-application.
3. **Intégrité** : 52 tables applicatives, 64 FK, 243 CHECK.
4. **Parité** : comparaison systématique avec la référence SQLite
   (`reference-schema.sqlite`, régénérable) — tables, colonnes/classes de types,
   NOT NULL, PK, FK, index explicites → **identique**.

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
- **Portée de cette validation : le SCHÉMA.** Le moteur de données applicatif reste
  `node:sqlite` à ce stade — le portage runtime (requêtes, `INSERT OR IGNORE` →
  `ON CONFLICT`, dates, transactions) est chiffré dans `docs/V2_PRODUCTION_READINESS.md`
  §C / `deploy/DEPLOYMENT.md` §4 et reste **à réaliser avant toute prod PostgreSQL**.
- Rollback : forward-only (identique au runner SQLite) ; retour arrière = restauration backup.
