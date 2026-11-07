# Changelog

All notable changes to **Adven's Manager** are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — 2026-11

### Security (hardening phase 1 & 2)
- **Strict RBAC**: finances (`/api/expenses`), users, settings and
  backups now require a real `ADMIN`; `TECHNICIAN` / `VENDOR` get clean
  `403`s.
- **Vendor data isolation**: dashboards (`/`, `/sales-trend`,
  `/hourly-trend`), reports and ticket search properly scoped per
  vendor.
- **Removed tokens-from-URL endpoints** (`/api/reports/download`,
  `/api/settings/download-backup`) — every download now requires the
  `Authorization` header.
- **`/uploads` is no longer public**: replaced by an authenticated
  `GET /api/uploads/{path}` route (JWT required, traversal-protected,
  extension whitelist).
- **Hardened Wave QR upload**: Pillow magic-byte verification + PNG
  re-encoding (kills disguised SVG/polyglot payloads), size cap,
  server-generated filenames.
- **Rate limiting** everywhere heavy: login 5/min, reports &
  backups 10/min, general 100/min; proper `429` responses.
- **Timing-safe login** (dummy bcrypt hash) — prevents username
  enumeration.
- **Password policy**: minimum 8 characters (creation, change, admin
  reset).
- **Audit log IP capture** on login and password change.
- **Ticket search hardening**: wildcard escaping on `ILIKE` searches.
- **CORS**: explicit origin allow-list (no more reflected origins).

### Added
- **Smartphone access**: the backend can now serve the built frontend
  (`FRONTEND_DIST_DIR`) on a single port; a QR code is generated
  live (`GET /api/app/access-qr`), shown in *Settings* and printed at
  startup.
- **PWA**: full web-app manifest, PNG icons (192/512 + maskable),
  installable on phones and desktops.
- **Ubuntu “desktop-app” installer** (`install-ubuntu.sh`): user-level
  systemd services (`advens-postgres`, `advens-manager`), dedicated
  Chrome `--app` window launcher, menu icon, session autostart.
- Staff pages: **Expenses**, **Register closures**, **Audit logs**,
  plus automated resupply workflow, webhooks and notification
  scaffolding.
- Production-grade compose (`docker-compose.prod.yml`): Docker
  secrets (`*_FILE`), hardened nginx `nginx.prod.conf`
  (TLS 1.2/1.3, HSTS, CSP, docs disabled), Redis password.

### Changed
- Backend binds `127.0.0.1` in local/dev mode; `0.0.0.0` only when
  installed as the LAN-serving “app” mode.
- nginx dev config reorganized (headers repeated per location,
  `client_max_body_size`, `/uploads` & `/docs` blocked).

## [1.0.0] — 2026-07

### Added
- Initial release: Wi-Fi ticket import (batches, duplicate
  detection), vendor assignment (FIFO), sales workflow with cash /
  Wave (QR) / credit payment, resupply approval workflow, dashboard,
  PDF & Excel reports, audit logs, JWT auth with roles, Docker
  Compose deployment, CI pipeline.
- Clients CRM page, detailed admin dashboard analytics, per-ticket
  deletion (admin), immutable sales history.
