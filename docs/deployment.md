# Déploiement GawJaay

Ce document décrit comment mettre GawJaay en ligne **réellement** :

```
iPhone / navigateur
      │  HTTPS
      ▼
Frontend statique  ── GitHub Pages ── https://aydiarra-star.github.io/Gawjaay/
      │  HTTPS (fetch VITE_API_URL)
      ▼
Backend API        ── hébergeur applicatif ── https://<api>/api/v1
      │
      ▼
Base de données    ── PostgreSQL managé (ou SQLite sur volume persistant)
```

GitHub Pages **ne peut héberger que le frontend statique**. L'API, l'authentification et la
base de données vivent sur un hébergeur applicatif séparé. Aucune URL de production n'est codée
en dur : le frontend lit `VITE_API_URL`, injecté au build.

---

## 1. Déployer le backend (Render — recommandé)

Le dépôt contient [`render.yaml`](../render.yaml) : un *blueprint* qui crée **l'API (Docker)**
et **une base PostgreSQL managée**, en injectant `DATABASE_URL` et en générant les secrets JWT.

1. Créer un compte sur <https://render.com> et connecter le dépôt GitHub `aydiarra-star/Gawjaay`.
2. **New** → **Blueprint** → choisir le dépôt → Render lit `render.yaml` et propose
   `gawjaay-api` + `gawjaay-db`.
3. Valider. Render construit l'image (Dockerfile), applique le schéma Prisma
   (`db push`) et démarre l'API.
4. Noter l'**URL réelle** du service, du type `https://gawjaay-api.onrender.com`.
5. Vérifier : `curl https://gawjaay-api.onrender.com/api/v1/health` → `{"status":"ok",...}`.

Variables créées automatiquement par le blueprint :

| Variable | Source |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_PROVIDER` | `postgresql` |
| `DATABASE_URL` | base `gawjaay-db` (interne) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | générés par Render |
| `FRONTEND_URL` | `https://aydiarra-star.github.io` |
| `PAYMENTS_MODE` | `disabled` |

> ⚠️ Offre *free* : le service s'endort après inactivité (premier appel lent) et la base gratuite
> expire au bout de 90 jours. Pour une production durable → plan payant.

## 2. Déployer le backend (Docker — tout hôte : VPS, Hetzner…)

```bash
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export FRONTEND_URL="https://aydiarra-star.github.io"

# SQLite sur volume persistant :
docker compose up -d --build

# PostgreSQL :
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
docker compose --profile postgres up -d --build
```

Placez l'API derrière un reverse-proxy HTTPS (Caddy ou Nginx + Let's Encrypt), par ex. :

```
api.gawjaay.sn {
    reverse_proxy localhost:4000
}
```

Le conteneur écoute sur `0.0.0.0:$PORT` (via `HOST`/`PORT`) et expose
`GET /api/v1/health` pour les sondes de disponibilité.

## 3. Connecter le frontend (GitHub Pages)

1. GitHub → dépôt → **Settings** → **Secrets and variables** → **Actions** → onglet **Variables**.
2. Définir/modifier `VITE_API_URL` = `https://<url-api-reelle>/api/v1`.
3. Relancer le workflow **Deploy frontend to GitHub Pages** (onglet Actions → *Run workflow*).
4. Ouvrir <https://aydiarra-star.github.io/Gawjaay/> et vérifier inscription/connexion.

Le workflow **échoue** si `VITE_API_URL` est vide, pointe vers `localhost`/`127.0.0.1`, ou vers
le runtime temporaire `*.all-hands.dev` (`apps/web/scripts/verify-bundle.mjs`).

## 4. Vérifications

| Contrôle | Commande / action attendue |
| --- | --- |
| Health | `curl https://<api>/api/v1/health` → `200 {"status":"ok"}` |
| CORS | `curl -s -D- -o /dev/null -H 'Origin: https://aydiarra-star.github.io' https://<api>/api/v1/health` → `access-control-allow-origin: https://aydiarra-star.github.io` |
| Inscription | `POST https://<api>/api/v1/auth/register` → `201` + `accessToken` |
| Connexion | `POST https://<api>/api/v1/auth/login` → `200` + `accessToken` |
| Dashboard | Frontend → connexion → tableau de bord chargé |
| Routes profondes | Ouvrir `https://aydiarra-star.github.io/Gawjaay/marketplace` puis recharger |

## 5. Sauvegarde & exploitation (PostgreSQL)

- Sauvegarde : `pg_dump "$DATABASE_URL" > gawjaay-$(date +%F).sql`
- Restauration : `psql "$DATABASE_URL" < gawjaay-YYYY-MM-DD.sql`
- Logs : fournis par l'hébergeur (Render → *Logs*) ; l'API journalise chaque requête
  (`méthode chemin statut durée`) et trace les erreurs 500 côté serveur, sans exposer de secret.

## 6. Secrets — règles

- **Jamais** de secret dans Git (`JWT_*`, `DATABASE_URL`, `POSTGRES_PASSWORD`).
- Secrets → variables d'environnement de la plateforme (Render, ou `.env` local non versionné).
- `VITE_API_URL` **n'est pas un secret** : c'est une variable Actions publique.
