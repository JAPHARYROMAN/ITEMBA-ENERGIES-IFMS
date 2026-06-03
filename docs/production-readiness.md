# Production Readiness Checklist

A concrete, verifiable go-live checklist for IFMS. Each item is tagged:

- **[AUTO]** — enforced in code/CI; the app or pipeline fails if it's wrong.
- **[MANUAL]** — you must set a value/secret; verifiable with the command shown.
- **[INFRA]** — requires server/cloud setup that cannot be checked from the repo.

Legend for status: ✅ done · ⚠️ needs action before go-live · 🔲 verify per-environment.

---

## 1. Secrets & authentication

| Item | Tag | Status | How it's enforced / verified |
|---|---|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` ≥ 32 chars | [AUTO] | ✅ | `env.schema.ts` rejects shorter secrets at boot. |
| JWT secrets are not placeholders in prod | [AUTO] | ✅ | In `NODE_ENV=production`, boot fails if either contains `change-me`. |
| JWT secrets are high-entropy (not just "not change-me") | [MANUAL] | ⚠️ | Generate with `openssl rand -base64 48`. The schema only blocks the literal `change-me`; a weak 32-char string would still pass. |
| Login requires ≥ 8-char passwords | [AUTO] | ✅ | `LoginDto @MinLength(8)` (restored from the 1-char regression). |
| Seed admin password is strong | [MANUAL] | ⚠️ | `ADMIN_SEED_PASSWORD` no longer defaults to `1618`; set a strong value before running `db:seed`. |
| Gemini / Groq API keys rotated & stored as secrets | [MANUAL] | ⚠️ | Keys were previously in plaintext `.env` files — **rotate them**. Store via GitHub Secrets / deployment env, never committed. |
| Self-signup intentional | [AUTO] | ✅ | `AUTH_SELF_SIGNUP_ENABLED` defaults to `false` (invite-only). Set `true` only if public signup is desired. |

**Verify secrets boot-gate locally** (should FAIL fast with a clear message):
```bash
cd apps/api
NODE_ENV=production JWT_ACCESS_SECRET="change-me-xxxxxxxxxxxxxxxxxxxxxxxxx" \
  JWT_REFRESH_SECRET="change-me-xxxxxxxxxxxxxxxxxxxxxxxx" \
  DATABASE_URL="postgresql://u:p@h:5432/db" DB_SSL=require node dist/main.js
# Expect: validation error on JWT_ACCESS_SECRET (must be a strong production secret)
```

## 2. Network / CORS / TLS

| Item | Tag | Status | Notes |
|---|---|---|---|
| `FRONTEND_ORIGIN` is an exact allowlist of https URLs | [AUTO] | ✅ | Validated per-origin in `env.schema.ts`; CORS uses it as a strict whitelist (`main.ts`). Set it to your real prod origin(s), comma-separated. |
| Security headers (CSP, HSTS, X-Frame-Options) | [AUTO] | ✅ | Set in `nginx.conf` and Helmet. |
| **HTTPS/TLS actually terminated** | [INFRA] | ⚠️ **GAP** | `docker-compose.production.yml` maps `443:443`, but `nginx.conf` only has a `listen 80` server — **no `listen 443 ssl`, no certificate**. HTTPS is not actually served. Fix before go-live (see template below) or terminate TLS at an upstream LB/ingress and document it. |

**TLS gap — minimum fix.** Either (a) terminate TLS at a load balancer/ingress in front of nginx (then keep nginx on :80 internally and document it), or (b) add a TLS server block to `nginx.conf` and mount certs. Template for (b):
```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name your-domain.com;
  ssl_certificate     /etc/nginx/certs/fullchain.pem;
  ssl_certificate_key /etc/nginx/certs/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  # ... reuse the existing location / proxy blocks ...
}
server {                      # redirect http -> https
  listen 80;
  server_name your-domain.com;
  return 301 https://$host$request_uri;
}
```
And mount the certs in the `nginx` service of `docker-compose.production.yml`:
```yaml
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt/live/your-domain/:/etc/nginx/certs/:ro
```

## 3. Database

| Item | Tag | Status | Notes |
|---|---|---|---|
| `DB_SSL` enabled in prod | [AUTO] | ✅ | Boot fails if `DB_SSL=false` under `NODE_ENV=production` (use `require` or `no-verify`). |
| Migrations apply cleanly on a fresh DB | [AUTO] | ✅ | History rebaselined to `0000_baseline` + `0001_materialized_views`. CI e2e now runs `db:migrate:ci`; `drizzle-kit check` validates consistency in CI. Verified: 61 tables + 4 matviews. |
| No accidental startup migrations in prod | [AUTO] | ✅ | `RUN_MIGRATIONS_ON_STARTUP` requires `ALLOW_PROD_STARTUP_MIGRATIONS=true`; prod compose sets both to false. Migrations run as an explicit deploy step. |
| Existing push-built DBs baselined | [MANUAL] | ⚠️ | Any DB created via `drizzle-kit push` has an empty migration journal — baseline it (mark `0000`/`0001` applied) or recreate before pointing it at the `migrate` path. |
| Connection pool / statement timeouts tuned | [AUTO] | 🔲 | Defaults in `env.schema.ts` (`DB_POOL_MAX=20`, `DB_STATEMENT_TIMEOUT=30000`). Review for prod load. |
| Materialized views refreshed on schedule | [MANUAL] | 🔲 | `ReportsRefreshService` cron (02:10) or `POST /admin/reports/refresh`. Confirm the cron runs in prod. |

## 4. Backups, retention & rollback

| Item | Tag | Status | Notes |
|---|---|---|---|
| Automated daily backups + retention | [INFRA] | ✅ | `db-backup` sidecar in prod compose runs `scripts/backup-db.sh` (30-backup retention). Confirm the volume is on durable/offsite storage. |
| Restore tested | [MANUAL] | 🔲 | `scripts/restore-db.sh` (guarded by `CONFIRM_DB_RESTORE=YES_RESTORE`). **Do a real restore drill** into a scratch DB before go-live. |
| Pre-deploy backup | [AUTO] | ✅ | `deploy-production.yml` takes a `pg_dump` before migrating. |
| Rollback path | [MANUAL] | 🔲 | Re-run `deploy-production.yml` with the previous image tag; restore from pre-deploy backup if a migration must be reverted. No automatic rollback on failed smoke tests — document the manual step. |

## 5. Observability & operations

| Item | Tag | Status | Notes |
|---|---|---|---|
| Health endpoints | [AUTO] | ✅ | `/api/health/live`, `/api/health/ready`; used by Docker healthchecks and smoke tests. |
| Swagger locked down in prod | [AUTO] | ✅ | Disabled by default; if `ENABLE_SWAGGER=true`, boot fails unless `SWAGGER_BASIC_USER`/`PASS` are set. |
| Email (password reset, notifications) works | [MANUAL] | ⚠️ | Set `SMTP_HOST`/`SMTP_*`. Without it, password-reset emails are skipped (token only logged). Required for self-service reset in prod. |
| Structured logging / request IDs | [AUTO] | ✅ | `AppLogger` + request-id middleware. Ship stdout to your log aggregator. |
| Rate limiting on auth | [AUTO] | ✅ | `@Throttle` on login/signup/forgot-password. Consider extending to bulk/export endpoints. |

## 6. CI / supply chain

| Item | Tag | Status | Notes |
|---|---|---|---|
| All CI jobs green | [AUTO] | ✅ | lint+typecheck, test, e2e (real migrate path), build (+`drizzle-kit check`), security. |
| `npm audit` blocking, 0 high | [AUTO] | ✅ | web 0 vulns; api 0 high (4 moderate dev-only `drizzle-kit→esbuild`, breaking-only fix, documented). |
| `lint:strict` (0 warnings) | [AUTO] | ✅ | Passes; enforced via `eslint . --max-warnings 0`. |

---

## Go-live blockers (must clear)
1. ⚠️ **Configure real HTTPS/TLS** (nginx TLS block + certs, or upstream LB) — currently HTTP-only.
2. ⚠️ **Rotate the previously-exposed Gemini/Groq API keys** and inject all secrets via the deployment environment.
3. ⚠️ **Set strong `JWT_*` secrets and `ADMIN_SEED_PASSWORD`** (high-entropy, not placeholders).
4. ⚠️ **Configure SMTP** so password-reset/notification email works.
5. 🔲 **Run a backup→restore drill** and document the rollback runbook.

## Nice-to-have before scale
- Raise API test coverage (currently ~20%; CI floor pinned so it can only rise).
- Load/performance testing against the full stack.
- Lazy-load report routes to shrink initial JS payload further (charts chunk is isolated and ready for it).
