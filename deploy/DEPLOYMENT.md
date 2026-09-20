# GawJaay V2 — Procédure de déploiement (VPS)

> Statut : **TECHNICALLY READY / NOT DEPLOYED** — voir `docs/V2_PRODUCTION_READINESS.md`.
> Ce document liste EXACTEMENT ce qui doit être fourni par l'exploitant. Rien n'est inventé :
> chaque ressource absente est marquée **[À FOURNIR]**.

## 1. Prérequis à provisionner

| Ressource | Détail | Statut |
|---|---|---|
| VPS | **Hetzner Cloud CPX32** (4 vCPU / 8 Go RAM / 160 Go disque / 20 To trafic), région Europe. **Auditer la configuration réelle (`nproc`, `free -h`, `df -h`, `cat /etc/os-release`) avant toute modification — ne pas redimensionner automatiquement.** | **[À FOURNIR]** |
| Domaine | ex. `gawjaay.example.com`, DNS A → IP du VPS | **[À FOURNIR]** |
| Node.js | v22 LTS (`curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -`) | à installer |
| Nginx | `apt install nginx` + config `deploy/nginx.conf.example` | à installer |
| Certificat HTTPS | `apt install certbot python3-certbot-nginx && certbot --nginx` | à exécuter |
| PM2 | `npm i -g pm2` + `deploy/ecosystem.config.cjs` | à installer |
| Sentry | créer un projet sur sentry.io → DSN | **[À FOURNIR]** |
| Bucket S3 backups | + clé IAM limitée `s3:PutObject` (ou équivalent Scaleway/OVH) | **[À FOURNIR]** |
| PostgreSQL | **16+ requis en production** (moteur de production — voir §4). Ne pas exposer le port 5432 publiquement si l'API et la base sont sur le même VPS. | à installer sur le VPS |

## 2. Déploiement application

```bash
sudo useradd -m -d /opt/gawjaay gawjaay && sudo -iu gawjaay
git clone https://github.com/aydiarra-star/Gawjaay.git /opt/gawjaay && cd /opt/gawjaay

# Backend
cd backend && npm install && npm run build   # tsc → dist/
cp ../deploy/.env.production.example .env    # REMPLIR les valeurs [À FOURNIR]
chmod 600 .env
mkdir -p /var/lib/gawjaay /var/log/gawjaay /var/backups/gawjaay

# Premier démarrage : schéma de base + migrations 001→009 appliquées automatiquement au boot
# + référentiel géographique (14 régions / 46 départements / communes) chargé s'il est absent
# (journal `_migrations` ; forward-only, idempotent — un redémarrage ne rejoue rien).
pm2 start ../deploy/ecosystem.config.cjs && pm2 save && pm2 startup

# Frontend
cd ../frontend && npm install && npm run build   # dist/ servi par Nginx
sudo cp -r dist /opt/gawjaay/frontend/dist && sudo chown -R www-data: /opt/gawjaay/frontend/dist

# Nginx : adapter le server_name puis
sudo cp ../deploy/nginx.conf.example /etc/nginx/sites-available/gawjaay
sudo ln -s /etc/nginx/sites-available/gawjaay /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx && sudo certbot --nginx -d <domaine>
```

## 3. Backups (quotidien + restauration testée)

Production = PostgreSQL → la référence est **`pg_dump`** (`deploy/backup.sh`, format custom,
rétention `BACKUP_RETENTION_DAYS` = 14 par défaut, upload S3 optionnel si `AWS_S3_BUCKET`).

```bash
# Cron : 0 2 * * *  BACKUP_DIR=/var/backups/gawjaay DATABASE_URL=postgresql://… /opt/gawjaay/deploy/backup.sh
# Restauration : pg_restore -d gawjaay_restore_test <dump>   (base SÉPARÉE, jamais la prod directe)
#                puis contrôles d'intégrité — voir docs/BACKUP_RESTORE.md
```

Règles : la copie ne doit pas rester uniquement sur le disque du VPS (upload S3 ou copie externe) ;
**un backup n'est pas déclaré opérationnel sans test de restauration réussi** dans une base séparée.

> Fallback sans `pg_dump` : `deploy/pg-backup.mjs` / `deploy/pg-restore.mjs` (dump SQL en deux
> passes, PK avant FK) — utile si `postgresql-client` n'est pas encore installé.

Monitoring du backup : le script sort en `exit 1` en cas d'échec → brancher
un `node_exporter`/cron-mail ou Sentry cron monitor **[À FOURNIR]**.

## 4. Base de données — PostgreSQL en production (décision actée)

**Le runtime PostgreSQL est réalisé et prouvé.** Le moteur est choisi par `DATABASE_URL`
(`backend/src/lib/db.ts`) :

| `DATABASE_URL` | Moteur | Usage |
|---|---|---|
| `postgresql://…` / `postgres://` | **PostgreSQL via le driver `pg`** (pool `max: 1`, une session → transactions fiables) | **production** |
| `pglite://…` | PostgreSQL compilé en WASM (PGlite) | tests / vérification locale sans serveur |
| `file:…` ou vide | SQLite (`node:sqlite`) | développement, tests, CI SQLite |

> ⚠️ **SQLite ne doit PAS être utilisé en production.** `deploy/.env.production.example`
> fournit un `DATABASE_URL` PostgreSQL ; le remplacer par un `file:` en production est une erreur.

Ce qui a été fait (et non « à faire ») :

- **Dialecte** traduit à l'exécution (`backend/src/lib/postgresAdapter.ts` → `translateSql`) :
  `PRAGMA` supprimés, `datetime('now')` → ISO-8601 UTC, `sqlite_master` → catalogue PG,
  `?` → `$1…$n`, `LIKE` → `ILIKE`, `MAX(a,b)`/`MIN(a,b)` scalaires → `GREATEST`/`LEAST`.
- **Parité de types** : `int8` (COUNT) et `numeric` (SUM) renvoyés en chaînes par `pg` → reparsés
  en nombres (`postgresWorker.cjs`), sinon `'5' + 1 === '51'` dans les agrégats.
- **Mapping de casse** : PostgreSQL replie les identifiants non quotés (`storeName` → `storename`) ;
  la casse est restaurée à la lecture (`backend/src/lib/columnMapping.ts`, couvert par
  `column-mapping.test.ts`).
- **Migrations** : `000_base` + `001_lot_a` → `008_idempotency`, portées en dialecte PostgreSQL
  dans `deploy/postgres/*.sql` et appliquées au boot par le runner applicatif.
- **Preuves** : suite complète verte sur SQLite **et** sur PostgreSQL, job CI `backend-postgres`
  (service `postgres:16`) exécutant suite + build + smoke HTTP.

**Rollback** : forward-only ; retour arrière = restauration d'un backup (`docs/BACKUP_RESTORE.md`).

## 5. Paiements — NOT CONNECTED TO PRODUCTION PAYMENT PROVIDER

- **Aucun fournisseur de paiement de production n'est connecté** (ni Wave, ni Orange Money, ni carte). Le dépôt ne
  contient que des abstractions (`PaymentProvider`) et des fournisseurs **simulés** réservés au développement.
- `PAYMENTS_MODE=disabled` (**obligatoire et valeur par défaut en production**) :
  - `POST /payments/initiate` avec `WAVE` / `ORANGE_MONEY` / `CARD` → **503** `{ code: "SERVICE_UNAVAILABLE" }` ;
  - `GET /payments/capabilities` (public) → `productionProviderConnected: false`, seules les méthodes `available: true`
    sont proposées par l'interface (le client voit « paiement mobile NON CONNECTÉ ») ;
  - **CASH** (espèces) : la commande est créée avec un paiement `CASH / PENDING` ; seul le marchand (ou un employé
    autorisé) le passe à `SUCCESS` via `POST /payments/:id/confirm-cash`. Un client ne peut jamais marquer un paiement payé.
- `PAYMENTS_MODE=sandbox` est **refusé au démarrage** quand `NODE_ENV=production` (fail-fast dans `config/env.ts`).
- Connecter un vrai fournisseur = contrat signé + implémentation d'un `PaymentProvider` (initiation, vérification,
  webhook signé) + tests, puis renseigner les clés dans `.env`. Tant que ce n'est pas fait, ne rien promettre aux
  utilisateurs : l'UI et l'API disent explicitement « non connecté ».

## 6. Secrets — checklist

- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` : `openssl rand -hex 32` (l'app **refuse de démarrer** en production avec les défauts de dev — fail-fast ajouté).
- [ ] `FRONTEND_URL` = domaine HTTPS réel (CORS : en production, seul ce domaine est autorisé).
- [ ] `PAYMENTS_MODE=disabled` (toute autre valeur bloque le démarrage en production) — voir §5.
- [ ] Fichier `.env` en `chmod 600`, jamais committé (vérifié : aucun secret dans Git).
