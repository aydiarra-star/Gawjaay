#!/usr/bin/env bash
# Garde l'API GawJaay en marche dans un environnement sans superviseur système.
#
# Dans un sandbox de développement, le processus est récolté dès que la commande
# qui l'a lancé se termine. Ce script tourne en arrière-plan détaché et redémarre
# l'API si elle s'arrête, afin que le frontend (GitHub Pages) reste joignable.
#
# Usage : scripts/serve-api.sh   (puis vérifier http://localhost:$PORT/api/v1/health)
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"
PORT="${PORT:-12000}"
LOG="${API_LOG:-/tmp/gawjaay-api.log}"
PIDFILE="${API_PIDFILE:-/tmp/gawjaay-api.pid}"

if [ ! -f "$API_DIR/dist/server.js" ]; then
  echo "[serve-api] dist introuvable — exécutez d'abord: npm run build -w @gawjaay/api" >&2
  exit 1
fi

cd "$API_DIR" || exit 1

echo $$ > "$PIDFILE"
echo "[serve-api] superviseur démarré (pid $$), port $PORT, log $LOG"

while true; do
  node dist/server.js >> "$LOG" 2>&1
  code=$?
  echo "[serve-api] API arrêtée (code $code) — redémarrage dans 2s" >> "$LOG"
  sleep 2
done
