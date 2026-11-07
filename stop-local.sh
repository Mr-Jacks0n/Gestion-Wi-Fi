#!/usr/bin/env bash
# ============================================================
#  Adven's Manager — Arrêt local (sans Docker)
#  Arrête le frontend, le backend et PostgreSQL.
# ============================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/.run-logs"
PGBIN="${HOME}/.local/share/advens_manager/pgvenv/lib/python3.12/site-packages/pgserver/pginstall/bin"
PGDATA="${HOME}/.local/share/advens_manager/pgdata"

# --- Frontend / Backend --------------------------------------------
for svc in frontend backend; do
  PIDFILE="$LOG_DIR/$svc.pid"
  if [ -f "$PIDFILE" ]; then
    PID="$(cat "$PIDFILE")"
    if kill -0 "$PID" 2>/dev/null; then
      echo "🛑 Arrêt de $svc (pid $PID)"
      pkill -P "$PID" 2>/dev/null
      kill "$PID" 2>/dev/null
    fi
    rm -f "$PIDFILE"
  fi
done

# --- Processus enfants restants (vite / uvicorn) --------------------
pkill -f "vite/bin/vite.js" 2>/dev/null && echo "🛑 Arrêt du processus vite"
pkill -f "npm run dev" 2>/dev/null
pkill -f "uvicorn app.main:app --host 127.0.0.1" 2>/dev/null && echo "🛑 Arrêt du processus uvicorn"
pkill -f "uvicorn app.main:app --host 0.0.0.0" 2>/dev/null

# --- PostgreSQL ----------------------------------------------------
if [ -d "$PGBIN" ] && "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "🛑 Arrêt de PostgreSQL"
  "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null 2>&1
fi

echo "✅ Arrêt terminé."
