#!/usr/bin/env bash
# ============================================================
#  Adven's Manager — Démarrage local (sans Docker)
#
#  Lance :
#    1. PostgreSQL 16 (cluster local, 127.0.0.1:5432)
#    2. Backend FastAPI (http://localhost:8000  + /docs)
#    3. Frontend Vite   (http://localhost:5173)
#
#  Identifiants : admin / admin123  (issu de la sauvegarde restaurée)
#  ⚠️  À changer immédiatement après la première connexion.
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${ROOT_DIR}/.run-logs"
mkdir -p "$LOG_DIR"

PGBIN="${HOME}/.local/share/advens_manager/pgvenv/lib/python3.12/site-packages/pgserver/pginstall/bin"
PGDATA="${HOME}/.local/share/advens_manager/pgdata"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
BACKEND_PY="${BACKEND_DIR}/.venv/bin/python"

# --- Vérifications -------------------------------------------------
[ -d "$PGBIN" ]        || { echo "❌ Binaires PostgreSQL introuvables ($PGBIN)"; exit 1; }
[ -x "$BACKEND_PY" ]   || { echo "❌ Venv backend absent — lancez : cd backend && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt"; exit 1; }
[ -d "$FRONTEND_DIR/node_modules" ] || { echo "❌ node_modules absent — lancez : cd frontend && npm install"; exit 1; }

# --- 1. PostgreSQL -------------------------------------------------
if "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "✅ PostgreSQL déjà en marche (127.0.0.1:5432)"
else
  echo "▶️  Démarrage de PostgreSQL…"
  "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -o "-h 127.0.0.1 -p 5432 -k /tmp" -w start
fi

# --- 2. Backend ----------------------------------------------------
if curl -fs http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
  echo "✅ Backend déjà en marche (http://localhost:8000)"
else
  echo "▶️  Démarrage du backend…"
  ( cd "$BACKEND_DIR" && nohup "$BACKEND_PY" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
      > "$LOG_DIR/backend.log" 2>&1 & echo $! > "$LOG_DIR/backend.pid" )
fi

# --- 3. Frontend ---------------------------------------------------
if curl -fs http://127.0.0.1:5173/ >/dev/null 2>&1; then
  echo "✅ Frontend déjà en marche (http://localhost:5173)"
else
  echo "▶️  Démarrage du frontend…"
  ( cd "$FRONTEND_DIR" && nohup npm run dev -- --host 0.0.0.0 --port 5173 \
      > "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$LOG_DIR/frontend.pid" )
fi

# --- Attente des services -----------------------------------------
for i in $(seq 1 30); do
  curl -fs http://127.0.0.1:8000/api/health >/dev/null 2>&1 && break
  sleep 1
done

echo
echo "============================================================"
echo "  Adven's Manager est démarré ✅"
echo
echo "  Frontend  : http://localhost:5173"
echo "  API       : http://localhost:8000"
echo "  API Docs  : http://localhost:8000/docs"
echo "  Compte    : admin / admin123  (à changer !)"
echo
echo "  Logs      : $LOG_DIR/backend.log | $LOG_DIR/frontend.log"
echo "  Arrêt     : ./stop-local.sh"
echo "============================================================"
