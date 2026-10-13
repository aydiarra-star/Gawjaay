#!/bin/sh
# Prépare la base persistante puis démarre l'API GawJaay.
#
# Politique de démarrage :
#   - CLIENT PRISMA manquant/incohérent  → ÉCHEC (sans client, l'API ne peut
#     répondre à aucune requête : mieux vaut un échec explicite).
#   - BASE INJOIGNABLE                   → ÉCHEC (db-migrate attend puis sort).
#   - MIGRATIONS EN ÉCHEC                → le conteneur DÉMARRE quand même, en
#     mode dégradé signalé (logs + GET /api/v1/health → database.schema), sauf
#     si MIGRATIONS_STRICT=true. C'est ce qui évite qu'une migration refusée par
#     PostgreSQL rende TOUS les déploiements Render impossibles (incident du
#     2026-10-06 : migration `DATETIME` → P3009 → API figée).
set -eu

echo "[entrypoint] préparation de l'API GawJaay (provider=${DATABASE_PROVIDER:-sqlite})…"

# 1. Provider Prisma demandé (sqlite par défaut, postgresql en production).
node scripts/set-db-provider.mjs

# 2. Client Prisma : régénéré seulement si nécessaire (client absent, provider
#    différent de l'image, ou schéma modifié depuis la dernière génération).
node scripts/verify-prisma-client.mjs --generate-if-needed

# 3. Base de données : migrations versionnées, réparation des migrations en
#    échec (P3009), repli `db push --accept-data-loss` en dernier recours.
node scripts/db-migrate.mjs

# 4. Recalcul idempotent de `Product.searchName` (M3) — non bloquant : si la
#    base est incomplète, l'API démarre tout de même et le signalera.
if ! node scripts/backfill-search.mjs; then
  echo "[entrypoint] ⚠️  backfill searchName ignoré (base indisponible ou incomplète) — démarrage de l'API."
fi

exec node dist/server.js
