#!/bin/sh
# Prépare la base persistante puis démarre l'API GawJaay.
set -e

# Le client Prisma est généré pour le moteur SQLite de l'image d'exécution.
npx prisma generate --schema prisma/schema.prisma

# Crée le schéma si la base est vide ; idempotent sur une base existante.
npx prisma db push --skip-generate --schema prisma/schema.prisma

exec node dist/server.js
