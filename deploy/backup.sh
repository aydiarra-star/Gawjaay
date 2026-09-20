#!/usr/bin/env bash
# Backup quotidien GawJaay V2 — cron : voir deploy/crontab.example
# Couvre les DEUX moteurs (mission §13) :
#   - SQLite (pilote actuel)  : snapshot cohérent VACUUM INTO + integrity_check (testé 2026-09-20)
#   - PostgreSQL (cible prod) : pg_dump -Fc personnalisé + pg_restore --list comme contrôle
# Rétection locale (BACKUP_RETENTION_DAYS, défaut 14) + upload S3 optionnel (AWS_S3_BUCKET).
# Dépend de node (SQLite) et/ou pg_dump (PostgreSQL).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/gawjaay}"
DB_PATH="${DB_PATH:-/var/lib/gawjaay/gawjaay.db}"          # chemin fichier SQLite
DATABASE_URL="${DATABASE_URL:-}"                            # si postgresql://... → mode PG
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ "$DATABASE_URL" == postgresql* ]]; then
  # ---------- PostgreSQL ----------
  command -v pg_dump >/dev/null || { echo "pg_dump absent" >&2; exit 1; }
  TARGET="$BACKUP_DIR/gawjaay-$STAMP.dump"
  pg_dump "$DATABASE_URL" --format=custom --file="$TARGET"
  # contrôle : le dump doit être listable et contenir des tables
  N_TABLES="$(pg_restore --list "$TARGET" | grep -c 'TABLE DATA' || true)"
  if [ "${N_TABLES:-0}" -lt 50 ]; then
    echo "[$(date -Is)] BACKUP PG SUSPECT ($TARGET) : $N_TABLES tables seulement (attendu >= 50)" >&2
    exit 1
  fi
  echo "[$(date -Is)] backup PG OK : $TARGET ($N_TABLES tables)"
else
  # ---------- SQLite ----------
  TARGET_RAW="$BACKUP_DIR/gawjaay-$STAMP.db"
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
  TARGET="$TARGET_RAW.gz"
  echo "[$(date -Is)] backup SQLite OK : $TARGET ($(du -h "$TARGET" | cut -f1))"
fi

# Rétention locale
find "$BACKUP_DIR" -name 'gawjaay-*' -mtime +"$RETENTION_DAYS" -delete

# Upload S3 (optionnel : nécessite aws cli + AWS_S3_BUCKET)
if command -v aws >/dev/null 2>&1 && [ -n "${AWS_S3_BUCKET:-}" ]; then
  aws s3 cp "$TARGET" "s3://$AWS_S3_BUCKET/gawjaay/$(basename "$TARGET")" --storage-class STANDARD_IA
  echo "[$(date -Is)] upload S3 OK"
fi
