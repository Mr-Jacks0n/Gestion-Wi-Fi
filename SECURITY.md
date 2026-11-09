# Security Policy · Adven's Manager

**Supported version:** the latest commit on `main`.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

1. Preferred: use GitHub **Private vulnerability reporting** ·
   `Security ▸ Report a vulnerability` on this repository.
2. If impossible, contact the maintainer through the repository
   profile page.

Include: affected endpoint/module, steps to reproduce (curl commands
welcome), impact assessment, and any PoC. Reports will be acknowledged
within **72 hours**, investigated, and fixed on `main`. We ask for
**90 days** coordinated disclosure, reduced to 7 days for actively
exploited issues.

## Security posture (what is already in place)

| Area | Control |
|---|---|
| Authentication | JWT (HS256, 8 h expiry), bcrypt password hashing |
| Password policy | minimum 8 characters enforced server-side (NIST SP 800-63B) |
| Authorization | RBAC · `ADMIN`, `TECHNICIAN`, `VENDOR` with *strict-admin* dependency for finances, users & settings |
| Rate limiting | slowapi-backed limits on login (5/min), reports & backups (10/min), general API (100/min) |
| Time-safety | login always validates against a dummy hash to prevent username enumeration |
| File uploads | Pillow magic-byte validation + PNG re-encoding (SVG/polyglot hostile payloads rejected), size cap, server-generated filenames |
| Served files | `/uploads` was replaced by an authenticated router (`/api/uploads/…`), path-traversal protected |
| SQL | SQLAlchemy ORM, parameterized queries, `%`/`_` escaping for `ILIKE` search |
| Secrets | `.env` git-ignored; `SECRET_KEY` fail-fast on boot if missing/weak; Docker secrets (`*_FILE`) in production compose |
| Transport | production nginx: TLS 1.2/1.3 only, HSTS, CSP, `nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy; `/docs` & `/openapi.json` blocked |
| Backup integrity | persistent tamper-proof sales history (no delete), audit log of every mutation |
| Tokens in URLs | none · all downloads use `Authorization` headers |

## Operational requirements

- Change the default `admin` password immediately.
- Never expose the API over HTTP (plain) to the Internet; use the
  TLS reverse proxy in `nginx/nginx.prod.conf` or an equivalent.
- Keep `SECRET_KEY` a 32-byte (64 hex chars) random value; rotate it
  only with a planned logout of all sessions.
