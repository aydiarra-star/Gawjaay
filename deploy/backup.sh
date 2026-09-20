#!/usr/bin/env bash
# Backup quotidien GawJaay V2 — cron : 0 2 * * * /opt/gawjaay/deploy/backup.sh
# - snapshot cohérent via SQLite VACUUM INTO (pas une copie fichier brute, safe en ligne)
# - integrity_check OBLIGATOIRE du snapshot (un backup non vérifié n'existe pas)
# - rétention locale (BACKUP_RETENTION_DAYS, défaut 14)
# - upload S3 optionnel si aws cli + AWS_S3_BUCKET configurés
# Dépend uniquement de node (déjà requis par l'app) — pas de CLI sqlite3.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gawjaay}"
DB_PATH="${DB_PATH:-/var/lib/gawjaay/gawjaay.db}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET_RAW="$BACKUP_DIR/gawjaay-$STAMP.db"

mkdir -p "$BACKUP_DIR"

BACKUP_SCRIPT="const { DatabaseSync } = require('node:sqlite');
const src = new DatabaseSync(process.argv[1]);
const target = process.argv[2];
src.exec(\`VACUUM INTO '\${target}'\`);
const dst = new DatabaseSync(target);
const r = dst.prepare('PRAGMA integrity_check').get();
if (r.integrity_check !== 'ok') { console.error('CORROMPU: ' + JSON.stringify(r)); process.exit(1); }
const n = dst.prepare('SELECT COUNT(*) c FROM _migrations').get();
console.log('integrity ok, migrations=' + n.c);
"
node -e "$BACKUP_SCRIPT" "$DB_PATH" "$TARGET_RAW"

gzip -f "$TARGET_RAW"

# Rétention locale
find "$BACKUP_DIR" -name 'gawjaay-*.db.gz' -mtime +"$RETENTION_DAYS" -delete

# Upload S3 (optionnel)
if command -v aws >/dev/null 2>&1 && [ -n "${AWS_S3_BUCKET:-}" ]; then
  aws s3 cp "$TARGET_RAW.gz" "s3://$AWS_S3_BUCKET/gawjaay/$(basename "$TARGET_RAW.gz")" --storage-class STANDARD_IA
  echo "[$(date -Is)] upload S3 OK"
fi

echo "[$(date -Is)] backup OK : $TARGET_RAW.gz ($(du -h "$TARGET_RAW.gz" | cut -f1))"
