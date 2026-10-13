# syntax=docker/dockerfile:1
#
# Déploiement persistant de l'API GawJaay (backend).
# Le frontend reste sur GitHub Pages ; cette image héberge l'API + sa base
# (PostgreSQL managé en production, SQLite sur volume persistant sinon).
#
# Points d'attention (incident Render du 2026-10-06, cf. AGENTS.md) :
#  - Le client Prisma est généré au BUILD pour le provider de production
#    (`ARG DATABASE_PROVIDER`, postgresql par défaut) puis VÉRIFIÉ : une
#    génération ratée échoue au build, pas au démarrage en production.
#  - Le CLI Prisma n'est plus rétrogradé à la main (`npm i --no-save
#    prisma@6.1.0`) : il provient du lockfile et reste aligné avec
#    `@prisma/client` (sinon le client généré est incohérent).
#  - Au démarrage, `apps/api/docker-entrypoint.sh` génère le client si besoin,
#    prépare la base (migrations + réparation P3009 + repli db push) et ne
#    bloque plus le conteneur sur un échec de migration.

# ---------- Étape 1 : build ----------
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/api apps/api

# Provider cible de l'image : postgresql (production Render/PostgreSQL managé).
# Surchargable : `docker build --build-arg DATABASE_PROVIDER=sqlite`.
ARG DATABASE_PROVIDER=postgresql
ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}

# Génération du client Prisma pour le provider réellement déployé, puis
# vérification stricte (client présent, provider cohérent, versions alignées) :
# le build ÉCHOUE si la génération ne s'est pas correctement exécutée.
RUN node apps/api/scripts/set-db-provider.mjs \
 && node_modules/.bin/prisma generate --schema apps/api/prisma/schema.prisma \
 && node apps/api/scripts/verify-prisma-client.mjs \
 && npm run build:shared && npm run build:api

# ---------- Étape 2 : exécution ----------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# `prisma` est une dépendance de production (package.json) : le CLI installé ici
# est exactement celui du lockfile, comme `@prisma/client` — plus de pinnage
# manuel, donc plus de décalage de version au démarrage.
RUN npm ci --omit=dev
# npm ci s'exécute avant la copie du schéma et laisse donc un client placeholder.
# Transférer le client généré pour PostgreSQL depuis l'étape build évite ce faux démarrage.
COPY --from=build /app/node_modules/.prisma/client node_modules/.prisma/client
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
COPY apps/api/scripts apps/api/scripts
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
RUN chmod +x apps/api/docker-entrypoint.sh

WORKDIR /app/apps/api
# PORT et HOST sont fournis par l'hébergeur ; à défaut : 4000 sur 0.0.0.0.
ENV PORT=4000
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
