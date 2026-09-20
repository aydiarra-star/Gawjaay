# GawJaay V3 — RUNBOOK PRODUCTION

> Qui : exploitant de garde. Quand : quotidien / sur alerte.
> Prérequis : accès SSH au VPS, accès PM2 (`pm2`), accès Sentry, accès S3.

## 0. Runtime base de données (PostgreSQL en production)

Le moteur est choisi **par la variable `DATABASE_URL`** — aucun code à changer :

| `DATABASE_URL` | Moteur | Usage |
|---|---|---|
| `postgresql://user:pass@host:5432/gawjaay` | **PostgreSQL** | production (source de vérité) |
| `file:./dev.db` (ou absent) | SQLite (`node:sqlite`) | développement / tests |

```bash
# Vérifier le moteur réellement utilisé au démarrage (log attendu) :
#   [db] Runtime: PostgreSQL via host:5432/gawjaay
#   DB initialized (PostgreSQL)
#   [migrations] appliquée: … / [migrations] à jour   ← idempotent à chaque redémarrage
#   [référentiel] 14/14 régions du Sénégal insérées   ← uniquement au 1er démarrage sur une base vierge
pm2 logs gawjaay-api --lines 30

# Contrôle de santé applicative
curl -s https://<domaine>/health            # { "status": "ok", … }

# Contrôle fonctionnel complet (39 vérifications, sans effet de bord destructeur)
SMOKE_BASE_URL=https://<domaine> npx tsx backend/scripts/smoke.ts

# Contrôle de la base
psql "$DATABASE_URL" -c "SELECT count(*) FROM _migrations;"          # 9
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"  # 54
psql "$DATABASE_URL" -c "SELECT count(*) FROM regions;"              # 14 (référentiel chargé au démarrage)

# Paiements : vérifier que rien n'est promis (mode attendu en production : disabled)
curl -s https://<domaine>/api/v1/payments/capabilities
#   { "mode": "disabled", "productionProviderConnected": false, "methods": [ { "code": "CASH", "available": true }, … ] }
```

- **Paiements — NOT CONNECTED TO PRODUCTION PAYMENT PROVIDER** : `PAYMENTS_MODE=disabled` est obligatoire
  (l'API refuse de démarrer en production avec `sandbox`). WAVE / ORANGE_MONEY / CARD répondent **503**
  `SERVICE_UNAVAILABLE` ; seul l'encaissement en **espèces** existe, confirmé par le marchand
  (`POST /payments/:id/confirm-cash`). Si un client signale « bouton de paiement mobile absent », c'est le
  comportement attendu tant qu'aucun fournisseur n'est contractualisé et intégré (`deploy/DEPLOYMENT.md` §5).

- **Transactions** : l'adaptateur utilise une connexion unique (`Pool max: 1`) → `BEGIN/COMMIT`
  portent bien sur la même session. Le déploiement est **mono-processus** (`instances: 1` dans
  `deploy/ecosystem.config.cjs`) ; ne pas passer en cluster sans lire `docs/BACKLOG_V3.md` §7.
- **Backup/restauration** : `docs/BACKUP_RESTORE.md` (pg_dump sur le VPS ; fallback vérifié
  `deploy/pg-backup.mjs` / `deploy/pg-restore.mjs`).
- **Retour arrière** : repointer `DATABASE_URL` vers SQLite est possible (les deux moteurs sont
  supportés) mais **ne préserve pas les données écrites dans PostgreSQL** — préférer la restauration
  d'un dump (§Backup).

## 1. Démarrage / arrêt / statut

```bash
pm2 status                     # gawjaay-api doit être "online"
pm2 logs gawjaay-api --lines 100
pm2 restart gawjaay-api        # redémarrage propre (migrations idempotentes au boot)
pm2 monit                      # CPU/mémoire live
```

L'API écoute en local sur `127.0.0.1:4000` (Nginx fait le HTTPS public).
Healthcheck : `curl -s https://<domaine>/api/v1/health` → `{"status":"ok","version":...}`.

## 2. Vérifications quotidiennes (5 min)

1. `/health` renvoie ok + version attendue.
2. `pm2 status` : pas de restarts anormaux (`pm2 describe gawjaay-api` → uptime).
3. `/var/log/gawjaay/backup.log` : ligne `backup ... OK` datée du matin (sinon §5 incident).
4. Sentry : aucune erreur 5xx non triée.

## 3. Déploiement d'une nouvelle version

```bash
cd /opt/gawjaay && sudo -iu gawjaay git pull origin main
cd backend && npm install && npm run build
pm2 restart gawjaay-api                 # migrations appliquées automatiquement (idempotentes)
cd ../frontend && npm install && npm run build
sudo rsync -a --delete dist/ /opt/gawjaay/frontend/public-dist/
curl -s https://<domaine>/api/v1/health  # version incrémentée attendue
```

Rollback applicatif : `git checkout <tag précédent>` + rebuild + restart (migrations forward-only :
un rollback de CODE est sûr si aucune migration 00X n'a été ajoutée ; sinon restaurer le backup, voir
`BACKUP_RESTORE.md`).

## 4. Vérifier les migrations appliquées

SQLite : `sqlite3 /var/lib/gawjaay/gawjaay.db "SELECT name, appliedAt FROM _migrations ORDER BY appliedAt;"`
Attendu : 001→008 (le journal fait foi).

## 5. Incidents — voir `docs/INCIDENT_RESPONSE.md`.

## 6. Endpoints sensibles (rappel)

- Rate-limits : global 500/min/IP · login 5/min · IA 30/15 min.
- Aucun endpoint admin public : `/admin/*` exige le rôle ADMIN.
- Paiements Wave / Orange Money / carte = **NON CONNECTÉS** en production (`PAYMENTS_MODE=disabled`, 503) ; les fournisseurs `sandbox` n'existent qu'en développement. Ne jamais communiquer un paiement mobile comme possible.

## 7. Observabilité pilote (§22) — requêtes SQL prêtes à l'emploi

Exécuter sur la base (ou via un cron quotidien qui exporte le résultat) :

```sql
-- Ventes du jour / montant
SELECT DATE(createdAt) d, COUNT(*) n, SUM(total) total FROM sales GROUP BY d ORDER BY d DESC LIMIT 7;
-- Commandes par statut (7 j)
SELECT status, COUNT(*) FROM orders WHERE createdAt > datetime('now','-7 days') GROUP BY status;
-- Produits / mouvements de stock (7 j)
SELECT COUNT(*) FROM products;
SELECT type, COUNT(*) FROM inventory_movements WHERE createdAt > datetime('now','-7 days') GROUP BY type;
-- Annulations (ventes et commandes)
SELECT COUNT(*) FROM orders WHERE status='ANNULEE' AND createdAt > datetime('now','-7 days');
-- Erreurs paiement (journal applicatif / Sentry) — 0 attendu en sandbox
-- Usage IA : conversations + actions par jour
SELECT DATE(createdAt) d, COUNT(*) FROM ai_conversations GROUP BY d ORDER BY d DESC LIMIT 7;
SELECT type, status, COUNT(*) FROM ai_actions GROUP BY type, status;
-- Erreurs auth (logs) : tentatives échouées par IP (pm2 logs / fail2ban)
```

Frontend : Sentry FE non instrumenté (hors périmètre V2) — les remontées utilisateurs
passent par le canal support du pilote (PILOT.md §6). Backend : Sentry capte les 5xx
(uniquement), sans PII (`sendDefaultPii:false`).
