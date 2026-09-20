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

PostgreSQL (futur) :
```bash
pg_restore --clean --if-exists --dbname "$DATABASE_URL" gawjaay-<stamp>.dump
psql "$DATABASE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"  # ~53
```

## 4. Rétention & incidents

- 14 jours locaux + copies S3 (STANDARD_IA, rétention bucket à définir par l'exploitant, recommandé 90 j).
- En cas de corruption détectée par le backup : **ne pas supprimer le fichier corrompu**
  (analyse), restaurer le backup précédent (§3), ouvrir un incident (`INCIDENT_RESPONSE.md`).
