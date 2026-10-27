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
base de données vivent sur un hébergeur applicatif séparé. Le workflow de publication lit la variable
Actions `VITE_API_URL`, valide qu'elle est une URL HTTPS publique se terminant par `/api/v1`, puis
l'écrit dans `config.js`. Le déploiement échoue si cette variable manque ou est invalide.

---

## 1. Déployer le backend (Render — recommandé)

Le dépôt contient [`render.yaml`](../render.yaml) : un *blueprint* qui crée **l'API (Docker)**
et **une base PostgreSQL managée**, en injectant `DATABASE_URL` et en générant les secrets JWT.

1. Créer un compte sur <https://render.com> et connecter le dépôt GitHub `aydiarra-star/Gawjaay`.
2. **New** → **Blueprint** → choisir le dépôt → Render lit `render.yaml` et propose
   `gawjaay-api` + `gawjaay-db`.
3. Valider. Render construit l'image (Dockerfile : le client Prisma est généré **au build** pour
   PostgreSQL puis vérifié), applique les migrations versionnées au démarrage du conteneur, puis
   démarre l'API.
4. Noter l'**URL réelle** du service, du type `https://gawjaay-api.onrender.com`.
5. Vérifier : `curl https://gawjaay-api.onrender.com/api/v1/health` → `{"status":"ok",...}`,
   avec `database.schema` = `ok`.

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

### Migrations de base au démarrage (et réparation automatique)

Le conteneur prépare la base **avant** de servir le trafic
(`apps/api/docker-entrypoint.sh` → `apps/api/scripts/db-migrate.mjs`), sans intervention :

| Étape | Ce qui se passe |
| --- | --- |
| 1. Connexion | La base répond-elle ? Sinon, nouvelles tentatives espacées (`DB_CONNECT_ATTEMPTS`, `DB_CONNECT_DELAY_MS`) puis échec **explicite** : sans base, l'API ne peut rien servir. |
| 2. Baseline | Base déjà peuplée par l'ancien `db push` (pas d'historique) → `migrate resolve --applied 0_init` (aucun SQL exécuté). |
| 3. Réparation | Migration enregistrée **en échec** (erreur Prisma `P3009`) → `migrate resolve --rolled-back` puis nouvelle tentative : la base se débloque toute seule. |
| 4. Migrations | `prisma migrate deploy` (migrations versionnées, **additives**). |
| 5. Dernier recours | `prisma db push --accept-data-loss` aligne le schéma sur `schema.prisma`, puis l'historique est complété (`migrate resolve --applied`). Désactivable : `DB_PUSH_FALLBACK=false`. |

Un **échec de migration ne tue plus le conteneur** (l'ancien comportement rendait *tous* les
déploiements impossibles : l'API restait figée sur une version antérieure, sans alerte). En cas
d'échec, l'API démarre en **mode dégradé**, visible dans les logs et dans la sonde :

```bash
curl -s https://gawjaay-api.onrender.com/api/v1/health
# {"status":"ok","time":"…","database":{"connected":true,"schema":"ok","mode":"migrations"}}
#                                   schema: "ok" | "degraded" (migrations refusées) | "unknown"
```

- `database.schema = "degraded"` → une migration a été refusée : lire les logs Render
  (`[db-migrate]`), corriger le SQL fautif (`TIMESTAMP(3)` et non `DATETIME`, cf.
  `apps/api/test/migrations.test.ts`), puis redéployer — la réparation du point 3 s'applique
  automatiquement.
- Pour préférer un déploiement marqué **en échec** plutôt qu'une API en mode dégradé :
  `MIGRATIONS_STRICT=true` (variable Render).
- La sonde `GET /api/v1/health` répond toujours `200` : un mode dégradé n'empêche pas le
  déploiement d'aboutir, mais il est **observable**.

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

Le workflow **échoue** si `VITE_API_URL` est vide ou invalide, n'utilise pas HTTPS, pointe vers
un hôte local/privé, contient des identifiants, ou ne se termine pas par `/api/v1`. Le bundle
est également vérifié contre les références localhost et les runtimes temporaires.

## 4. Vérifications

| Contrôle | Commande / action attendue |
| --- | --- |
| Health | `curl https://<api>/api/v1/health` → `200 {"status":"ok","database":{"connected":true,"schema":"ok"}}` |
| Base à jour | `database.schema` = `"ok"` (sinon `"degraded"` → voir « Migrations de base au démarrage ») |
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
