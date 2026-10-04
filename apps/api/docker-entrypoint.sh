#!/bin/sh
# Prépare la base persistante puis démarre l'API GawJaay.
set -e

# Le client Prisma est généré pour le provider demandé (sqlite par défaut,
# postgresql en production via DATABASE_PROVIDER=postgresql).
node scripts/set-db-provider.mjs
npx prisma generate --schema prisma/schema.prisma

# Applique le schéma de façon idempotente, non interactive et non destructive.
# PostgreSQL → migrations versionnées (`migrate deploy`), avec baseline
# automatique de 0_init si la base existante n'a pas encore d'historique.
# SQLite → `db push` (base jetable de dev).
node scripts/db-migrate.mjs

exec node dist/server.js
