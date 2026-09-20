# GawJaay V2 — Backup & Restauration

## 1. Politique

| Élément | Valeur |
|---|---|
| Fréquence | quotidienne, 02:00 (cron `deploy/crontab.example`) |
| Moteur | auto-détecté : SQLite (`VACUUM INTO` + integrity_check) ou PostgreSQL (`pg_dump -Fc` + contrôle tables) |
| Vérification | intégrité à CHAQUE backup (exit 1 si corrompu) |
| Rétention locale | 14 jours (`BACKUP_RETENTION_DAYS`) |
| Copies distantes | S3 (`AWS_S3_BUCKET`, classe STANDARD_IA) — à configurer |
| Monitoring | Sentry Cron Monitor recommandé sur le job |

## 2. Test de restauration — RÉALISÉ (preuve)

Exécuté le 2026-09-20 dans le sandbox (SQLite) :

```
BACKUP_DIR=/tmp/bk2 DB_PATH=... deploy/backup.sh
→ [backup SQLite OK] integrity ok, migrations=8
gunzip -c gawjaay-*.db.gz > restored.db
→ PRAGMA integrity_check = ok ; _migrations = 8 ; tables/data identiques à la source
```

Un backup sans restauration testée n'est pas un backup. Le cron `restore-check.sh`
(mensuel) doit rejouer cette procédure sur le VPS.

## 2.2 Test de restauration PostgreSQL — RÉALISÉ (preuve, 2026-09-20)

`pg_dump`/`pg_restore` **n'étaient pas disponibles** dans l'environnement de la phase finale.
Un backup/restore **réel** a donc été exécuté avec les outils du dépôt sur un vrai serveur
PostgreSQL 18.4, puis vérifié automatiquement :

```bash
# Backup (schéma + données + contraintes + index, transaction unique, manifeste de lignes)
DATABASE_URL=postgresql://…/gawjaay_prod_smoke node deploy/pg-backup.mjs /tmp/backups/gawjaay.sql
#  → [pg-backup] tables=54 lignes=331 taille=150.5 Ko

# Restauration dans une base SÉPARÉE
DATABASE_URL=postgresql://…/gawjaay_restore_test node deploy/pg-restore.mjs /tmp/backups/gawjaay.sql
#  → dump rejoué en 89 ms
#  → OK ventes ↔ lignes de vente (0 anomalie)
#  → OK commandes ↔ lignes (0 anomalie)
#  → OK stock jamais négatif
#  → OK migrations présentes (8)
#  → lignes : users=20 stores=15 products=15 inventories=15 sales=15 orders=5 payments=5 audit_logs=64
#  → RESTAURATION VÉRIFIÉE — aucune divergence détectée
```

Un **bug réel** a été découvert par ce test : les clés étrangères étaient écrites avant les clés
primaires des tables référencées (`transformFkeyCheckAttrs`) → le dump émettrait une erreur à la
restauration. Corrigé : contraintes émises en **deux passes** (PK/UNIQUE/CHECK puis FK).

**Sur le VPS**, `deploy/backup.sh` reste la référence : il utilise `pg_dump -Fc` (format custom) et
`pg_restore --list` comme contrôle (échec si < 50 tables). Le fallback `deploy/pg-backup.mjs` sert
lorsque les binaires PostgreSQL ne sont pas installables.

## 3. Procédure de restauration (incident)

```bash
# 1. STOPPER l'écriture
pm2 stop gawjaay-api

# 2. Sauvegarder l'état actuel (même cassé) pour analyse
cp /var/lib/gawjaay/gawjaay.db /var/backups/gawjaay/incident-$(date +%Y%m%d-%H%M%S).db

# 3. Restaurer
gunzip -c /var/backups/gawjaay/gawjaay-<stamp>.db.gz > /var/lib/gawjaay/gawjaay.db

# 4. VÉRIFIER avant redémarrage (obligatoire)
sqlite3 /var/lib/gawjaay/gawjaay.db "PRAGMA integrity_check; SELECT COUNT(*) FROM _migrations;"
# attendu : ok + 8

# 5. Redémarrer et contrôler
pm2 start gawjaay-api
curl -s https://<domaine>/api/v1/health
# + test métier : login marchand, lecture d'une vente, création d'une vente test
```

PostgreSQL (runtime actif, cf. §2.2) :
```bash
# option 1 — dump custom pg_dump (recommandé sur le VPS)
pg_restore --clean --if-exists --dbname "$DATABASE_URL" gawjaay-<stamp>.dump
# option 2 — dump SQL du dépôt (utilisé et vérifié le 2026-09-20)
DATABASE_URL="$DATABASE_URL" node deploy/pg-restore.mjs /var/backups/gawjaay/gawjaay-<stamp>.sql
# contrôle : 54 tables (dont _migrations) — mesuré sur base réelle
```

## 4. Rétention & incidents

- 14 jours locaux + copies S3 (STANDARD_IA, rétention bucket à définir par l'exploitant, recommandé 90 j).
- En cas de corruption détectée par le backup : **ne pas supprimer le fichier corrompu**
  (analyse), restaurer le backup précédent (§3), ouvrir un incident (`INCIDENT_RESPONSE.md`).
