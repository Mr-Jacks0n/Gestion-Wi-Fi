#!/usr/bin/env bash
# ============================================================
#  Adven's Manager — Installation Ubuntu « programme »
# ============================================================
#  Installe (sans sudo, en mode utilisateur) sous
#    ~/.local/share/advens-manager
#  :
#    1. Le build du frontend servi DIRECTEMENT par FastAPI
#       → une seule porte : http://<IP-LAN>:8000 (PC + smartphone)
#    2. Un QR code d'accès smartphone (page Paramètres + log au démarrage)
#    3. Deux services systemd --user :
#         - advens-postgres.service (PostgreSQL 16 local)
#         - advens-manager.service  (API + frontend, 0.0.0.0:8000)
#    4. Un lanceur « Adven's Manager » dans le menu Ubuntu
#       + autostart à la session
#
#  ⚠️  Utilise PostgreSQL en 127.0.0.1 uniquement (pas de risque d'exposition
#      de la base) ; seul le port 8000 est ouvert sur le LAN.
#
#  Désinstallation :
#    systemctl --user disable --now advens-manager advens-postgres
#    rm -rf ~/.local/share/advens-manager ~/.config/systemd/user/advens-*.{service}
#    rm ~/.local/share/applications/advens-manager.desktop \
#       ~/.config/autostart/advens-manager.desktop
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

PGBIN="${HOME}/.local/share/advens_manager/pgvenv/lib/python3.12/site-packages/pgserver/pginstall/bin"
PGDATA="${HOME}/.local/share/advens_manager/pgdata"

PREFIX="${HOME}/.local/share/advens-manager"
APP_DIR="${PREFIX}/app"
VENV_DIR="${PREFIX}/venv"
DIST_DIR="${PREFIX}/frontend-dist"
BACKUPS_DIR="${PREFIX}/backups"
UPLOADS_DIR="${PREFIX}/uploads"

APP_PORT="${APP_PORT:-8000}"
LAN_URL="http://$(hostname -I | awk '{print $1}'):${APP_PORT}"

log()  { echo "▶️  $*"; }
ok()   { echo "✅ $*"; }
die()  { echo "❌ $*" >&2; exit 1; }

# ------------------------------------------------------------
# 0. Pré-requis
# ------------------------------------------------------------
[ -d "$BACKEND_DIR/app" ]     || die "backend/app introuvable"
[ -x "$BACKEND_DIR/.venv/bin/python" ] || die "venv backend absente (backend/.venv)"
[ -d "$PGBIN" ]               || die "binaires PostgreSQL introuvables ($PGBIN)"
[ -d "$PGDATA" ]              || die "cluster PostgreSQL introuvable ($PGDATA)"
[ -f "$BACKEND_DIR/.env" ]    || die "backend/.env introuvable (SECRET_KEY, DATABASE_URL)"

# ------------------------------------------------------------
# 1. Build frontend
# ------------------------------------------------------------
log "Build du frontend (npm run build)…"
if command -v npm >/dev/null 2>&1 && [ -d "$FRONTEND_DIR/node_modules" ]; then
  ( cd "$FRONTEND_DIR" && npm run build >/tmp/advens-frontend-build.log 2>&1 ) \
    || die "build frontend échoué — voir /tmp/advens-frontend-build.log"
else
  echo "   (npm/build indisponible — réutilisation du dist existant)"
fi
[ -f "$FRONTEND_DIR/dist/index.html" ] || die "frontend/dist introuvable"

# ------------------------------------------------------------
# 2. Copie de l'application vers le préfixe d'installation
# ------------------------------------------------------------
log "Installation dans $PREFIX…"
mkdir -p "$PREFIX" "$BACKUPS_DIR" "$UPLOADS_DIR" "$PREFIX/bin"

# Backend (code)
mkdir -p "$APP_DIR"
rm -rf "$APP_DIR/app"
cp -a "$BACKEND_DIR/app" "$APP_DIR/app"
find "$APP_DIR/app" -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true

# Venv Python (copie localement indépendante du SSD du projet)
log "Copie de l'environnement Python (147 Mo)…"
rsync -a --delete "$BACKEND_DIR/.venv/" "$VENV_DIR/" 2>/dev/null || cp -a "$BACKEND_DIR/.venv" "$VENV_DIR"
"$VENV_DIR/bin/python" -c "import fastapi, uvicorn, qrcode, PIL, pydantic_settings" \
  || die "copie venv corrompue"

# Frontend build
rsync -a --delete "$FRONTEND_DIR/dist/" "$DIST_DIR/" 2>/dev/null || { rm -rf "$DIST_DIR"; cp -a "$FRONTEND_DIR/dist" "$DIST_DIR"; }

# .env de l'application installée : SECRET_KEY + DATABASE_URL de backend/.env
# (mot de passe déjà URL-encodé) + options mode installé.
{ grep -E '^(SECRET_KEY|DATABASE_URL|RATE_LIMIT_ENABLED|JWT_ACCESS_TOKEN_EXPIRE_MINUTES)' "$BACKEND_DIR/.env" || true
  echo "FRONTEND_DIST_DIR=${DIST_DIR}"
  echo "APP_PORT=${APP_PORT}"
  echo "DOCS_ENABLED=false"
  echo "UPLOAD_DIR=${UPLOADS_DIR}"
} > "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env" 2>/dev/null || true

# ------------------------------------------------------------
# 3. Services systemd --user
# ------------------------------------------------------------
SYSTEMD_DIR="${HOME}/.config/systemd/user"
mkdir -p "$SYSTEMD_DIR"

log "PostgreSQL service…"
cat > "$SYSTEMD_DIR/advens-postgres.service" <<EOF
[Unit]
Description=Adven's Manager — PostgreSQL 16 (local)
Wants=network-pre.target
Before=advens-manager.service

[Service]
Type=forking
PIDFile=${PGDATA}/postmaster.pid
# Nettoie un éventuel postmaster.pid périmé après un arrêt brutal
ExecStartPre=/bin/sh -ec 'PIDF="${PGDATA}/postmaster.pid"; if [ -f "\$PIDF" ] && ! kill -0 "\$(head -1 "\$PIDF")" 2>/dev/null; then rm -f "\$PIDF"; fi'
ExecStart=${PGBIN}/pg_ctl -D ${PGDATA} -l ${PGDATA}/server.log -o "-h 127.0.0.1 -p 5432 -k /tmp" -w start
ExecStop=${PGBIN}/pg_ctl -D ${PGDATA} -m fast stop
ExecReload=${PGBIN}/pg_ctl -D ${PGDATA} reload
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

log "Adven's Manager service…"
cat > "$SYSTEMD_DIR/advens-manager.service" <<EOF
[Unit]
Description=Adven's Manager — API FastAPI + frontend (port ${APP_PORT})
Wants=advens-postgres.service
After=advens-postgres.service

[Service]
WorkingDirectory=${APP_DIR}
ExecStart=${VENV_DIR}/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${APP_PORT}
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

# ------------------------------------------------------------
# 4. Lanceur menu Ubuntu + autostart session
# ------------------------------------------------------------
log "Icône et lanceur…"
"$VENV_DIR/bin/python" - <<PYEOF
from PIL import Image, ImageDraw

icon_path = "${PREFIX}/icon.png"
img = Image.new("RGB", (256, 256), "#0f2718")
d = ImageDraw.Draw(img)
# pastille QR stylisée
pad = 40
cell = 22
colors = ["#31c48d", "#f4faf6"]
for r in range(5):
    for c in range(5):
        if (r * 7 + c * 3) % 2 == 0:
            x0 = pad + c * cell; y0 = pad + r * cell
            d.rectangle([x0, y0, x0 + cell - 4, y0 + cell - 4], fill=colors[(r + c) % 2])
d.rectangle([60, 130, 196, 196], outline="#31c48d", width=6)
img.save(icon_path)
print("icône générée")
PYEOF

cat > "${HOME}/.local/share/applications/advens-manager.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Adven's Manager
Comment=Gestion Wi-Fi Adven's Center (tickets, ventes, caisse)
Exec=${PREFIX}/bin/open.sh
Icon=${PREFIX}/icon.png
Terminal=false
Categories=Office;Finance;
StartupWMClass=AdvensManager
EOF

cat > "${PREFIX}/bin/open.sh" <<EOF
#!/usr/bin/env bash
# Démarre les services si besoin puis ouvre l'app dans le navigateur
systemctl --user start advens-postgres.service 2>/dev/null
systemctl --user start advens-manager.service  2>/dev/null
for i in \$(seq 1 30); do
  curl -fs http://127.0.0.1:${APP_PORT}/api/health >/dev/null 2>&1 && break
  sleep 1
done

# ── Ouverture « comme une applique » : fenêtre dédiée Chrome --app ──
APP_URL="http://localhost:${APP_PORT}"
PROFILE="${PREFIX}/browser-profile"
BROWSER=""
for b in google-chrome-stable google-chrome chromium chromium-browser brave-browser; do
  command -v "\$b" >/dev/null 2>&1 && { BROWSER="\$b"; break; }
done

if [ -n "\$BROWSER" ]; then
  # Fenêtre standalone (pas d'adresse/onglets) + profil dédié → icône
  # propre dans le dock, comportement d'application de bureau
  exec "\$BROWSER" \\
    --app="\$APP_URL" \\
    --user-data-dir="\$PROFILE" \\
    --class=AdvensManager \\
    --window-size=1360,900 \\
    --no-first-run --no-default-browser-check \\
    --disable-features=Translate
else
  xdg-open "\$APP_URL" >/dev/null 2>&1
fi
EOF
chmod +x "${PREFIX}/bin/open.sh"

cat > "${HOME}/.config/autostart/advens-manager.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Adven's Manager (services)
Comment=Démarre PostgreSQL + Adven's Manager à la session
Exec=/bin/sh -c "systemctl --user enable --now advens-postgres.service advens-manager.service 2>/dev/null"
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

# ------------------------------------------------------------
# 5. Redémarrage propre de la stack de développement
# ------------------------------------------------------------
if curl -fs http://127.0.0.1:8000/api/health >/dev/null 2>&1 || curl -fs http://127.0.0.1:5173 >/dev/null 2>&1; then
  log "Arrêt de la stack de développement (relançable : ./run-local.sh)…"
  "${ROOT_DIR}/stop-local.sh" >/dev/null 2>&1 || true
fi
# (l'ancienne instance uvicorn de dev sur :8000 peut rester accrochée)
pkill -f "uvicorn app.main:app" 2>/dev/null || true
sleep 2

# PostgreSQL : s'il tournait « à la main » (run-local.sh), l'arrêter pour
# que ce soit désormais systemd --user qui en ait la charge. Mais si l'unité
# systemd le gère déjà, on ne le touche pas (sinon une réinstallation
# arrêterait la base sans redémarrage automatique).
if "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  if [ "$(systemctl --user is-active advens-postgres.service 2>/dev/null || true)" = "active" ]; then
    ok "PostgreSQL déjà sous systemd --user — conservé"
  else
    log "Passage de PostgreSQL sous la gestion systemd --user…"
    "$PGBIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
    sleep 1
  fi
fi

# ------------------------------------------------------------
# 6. Activation + démarrage
# ------------------------------------------------------------
log "Activation des services…"
systemctl --user daemon-reload
systemctl --user enable --now advens-postgres.service  >/dev/null 2>&1 || true
systemctl --user enable advens-manager.service        >/dev/null 2>&1 || true
systemctl --user restart advens-manager.service       >/dev/null 2>&1

log "Démarrage…"
for i in $(seq 1 60); do
  curl -fs "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fs "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1 \
  || { journalctl --user -u advens-manager -n 40 --no-pager; die "backend n'a pas démarré"; }

# ------------------------------------------------------------
# 7. Vérifications
# ------------------------------------------------------------
ok "API : http://127.0.0.1:${APP_PORT}/api/health"
ok "App PC : http://localhost:${APP_PORT}"
ok "App smartphone (même Wi-Fi) : ${LAN_URL}"
systemctl --user is-active advens-postgres.service advens-manager.service | sed 's/^/   → service : /'

# si ufw actif, prévenir (la commande d'autorisation nécessite sudo)
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "active"; then
  echo "⚠️  ufw est actif : autorisez le port ${APP_PORT}/tcp  →  sudo ufw allow ${APP_PORT}/tcp"
fi

echo
echo "============================================================"
echo "  Adven's Manager est installé ✅"
echo
echo "  Lanceur Ubuntu       : « Adven's Manager » (menu Applications)"
echo "  Services             : systemctl --user status advens-manager"
echo "  Logs                 : journalctl --user -u advens-manager -f"
echo "  QR smartphone        : page Paramètres, carte « Accès smartphone »"
echo "  Arrêt                : systemctl --user stop advens-manager"
echo "  Désinstallation      : voir en-tête install-ubuntu.sh"
echo "============================================================"
