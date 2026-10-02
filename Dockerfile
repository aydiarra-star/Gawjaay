# syntax=docker/dockerfile:1
#
# Déploiement persistant de l'API GawJaay (backend).
# Le frontend reste sur GitHub Pages ; cette image héberge l'API + sa base SQLite
# sur un volume persistant, afin de ne plus dépendre d'un serveur éphémère.

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
RUN node apps/api/scripts/set-db-provider.mjs \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build:shared && npm run build:api

# ---------- Étape 2 : exécution ----------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev && npm i --no-save prisma@6.1.0
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
