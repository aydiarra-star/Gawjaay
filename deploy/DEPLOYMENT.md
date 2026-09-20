# GawJaay V2 — Procédure de déploiement (VPS)

> Statut : **TECHNICALLY READY / NOT DEPLOYED** — voir `docs/V2_PRODUCTION_READINESS.md`.
> Ce document liste EXACTEMENT ce qui doit être fourni par l'exploitant. Rien n'est inventé :
> chaque ressource absente est marquée **[À FOURNIR]**.

## 1. Prérequis à provisionner

| Ressource | Détail | Statut |
|---|---|---|
| VPS | 2 vCPU / 4 Go RAM / 40 Go SSD, Ubuntu 22.04+, accès SSH | **[À FOURNIR]** |
| Domaine | ex. `gawjaay.example.com`, DNS A → IP du VPS | **[À FOURNIR]** |
| Node.js | v22 LTS (`curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -`) | à installer |
| Nginx | `apt install nginx` + config `deploy/nginx.conf.example` | à installer |
| Certificat HTTPS | `apt install certbot python3-certbot-nginx && certbot --nginx` | à exécuter |
| PM2 | `npm i -g pm2` + `deploy/ecosystem.config.cjs` | à installer |
| Sentry | créer un projet sur sentry.io → DSN | **[À FOURNIR]** |
| Bucket S3 backups | + clé IAM limitée `s3:PutObject` (ou équivalent Scaleway/OVH) | **[À FOURNIR]** |
| PostgreSQL | **NON requis pour le pilote** (SQLite embarqué) — voir §4 | décision §4 |

## 2. Déploiement application

```bash
sudo useradd -m -d /opt/gawjaay gawjaay && sudo -iu gawjaay
git clone https://github.com/aydiarra-star/Gawjaay.git /opt/gawjaay && cd /opt/gawjaay

# Backend
cd backend && npm install && npm run build   # tsc → dist/
cp ../deploy/.env.production.example .env    # REMPLIR les valeurs [À FOURNIR]
chmod 600 .env
mkdir -p /var/lib/gawjaay /var/log/gawjaay /var/backups/gawjaay

# Premier démarrage : migrations 001→006 appliquées automatiquement au boot.
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

```bash
# Cron : 0 2 * * *  BACKUP_DIR=/var/backups/gawjaay DB_PATH=/var/lib/gawjaay/gawjaay.db /opt/gawjaay/deploy/backup.sh
# Restauration (testée le 2026-09-20, voir rapport §C) :
#   gunzip -c /var/backups/gawjaay/gawjaay-<stamp>.db.gz > /var/lib/gawjaay/gawjaay.db
#   pm2 restart gawjaay-api   # integrity_check = ok requis avant redémarrage
```

Monitoring du backup : le script sort en `exit 1` si `integrity_check != ok` → brancher
un `node_exporter`/cron-mail ou Sentry cron monitor **[À FOURNIR]**.

## 4. Base de données — décision à acter

La V2 tourne sur **SQLite** (node:sqlite, WAL). Pour le pilote (1 VPS, faible volumétrie),
SQLite est **adapté** : transactions ACID, backup à chaud (VACUUM INTO), un seul writer.

Le passage à PostgreSQL (cahier long terme) nécessite un travail d'adaptation **non réalisé**
(fait exprès, hors périmètre « readiness ») :
- dialecte SQL : `datetime('now')` → `now()`, `AUTOINCREMENT` → `IDENTITY`, dates TEXT ISO → `timestamptz`, `PRAGMA` → n/a ;
- driver : `node:sqlite` → `pg`/`postgres` + pool ;
- requêtes : `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`, `VACUUM INTO` → `pg_dump` ;
- migration 001→006 à réécrire pour PG + outil (node-pg-migrate).
Estimation : 2-4 jours de dev + revalidation complète des suites. Ne PAS improviser sur la prod.

## 5. Paiements — règle pilote

- **CASH (espèces) + retrait boutique** = seuls paiements « réels » du pilote.
- Wave / Orange Money : intégrations **SANDBOX** (`WaveSandbox`, `OrangeMoneySandbox`,
  `provider: 'WAVE_SANDBOX'`) — jamais présenter comme production tant que les contrats
  officiels et clés réelles ne sont pas obtenus.

## 6. Secrets — checklist

- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` : `openssl rand -hex 32` (l'app **refuse de démarrer** en production avec les défauts de dev — fail-fast ajouté).
- [ ] `FRONTEND_URL` = domaine HTTPS réel (CORS : en production, seul ce domaine est autorisé).
- [ ] Fichier `.env` en `chmod 600`, jamais committé (vérifié : aucun secret dans Git).
