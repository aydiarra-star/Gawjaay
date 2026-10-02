#!/bin/sh
# Prépare la base persistante puis démarre l'API GawJaay.
set -e

# Le client Prisma est généré pour le provider demandé (sqlite par défaut,
# postgresql en production via DATABASE_PROVIDER=postgresql).
node scripts/set-db-provider.mjs
npx prisma generate --schema prisma/schema.prisma

# Applique le schéma de façon idempotente :
#  - si des migrations versionnées existent → `migrate deploy` (recommandé en prod) ;
#  - sinon → `db push` (crée/met à jour le schéma sans perte si déjà aligné).
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy --schema prisma/schema.prisma
else
  npx prisma db push --skip-generate --schema prisma/schema.prisma
fi

exec node dist/server.js
