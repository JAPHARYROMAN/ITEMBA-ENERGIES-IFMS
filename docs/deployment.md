# IFMS API Deployment Runbook

## Runtime Components
- `postgres` (PostgreSQL 16)
- `api` (NestJS + Drizzle)

Docker compose includes both services:
- `docker-compose.yml`

## Required Environment Variables
- `NODE_ENV` (`production` recommended)
- `PORT` (default `3001`)
- `FRONTEND_ORIGIN` (comma-separated CORS allow origins; local development should include `http://localhost:3005` and `http://localhost:5173`)
- `DATABASE_URL` (Postgres connection string)
- `JWT_ACCESS_SECRET` (min 32 chars)
- `JWT_REFRESH_SECRET` (min 32 chars)

## Hardening/Operations Variables
- `REQUEST_BODY_LIMIT` (default `1mb`)
- `RUN_MIGRATIONS_ON_STARTUP` (`true|false`, default `false`)
- `ALLOW_PROD_STARTUP_MIGRATIONS` (`true|false`, default `false`)
- `ENABLE_SWAGGER` (`true|false`, default `false`)
- `SWAGGER_BASIC_USER` (required in prod if swagger enabled)
- `SWAGGER_BASIC_PASS` (required in prod if swagger enabled)
- `EXPORT_STORAGE_DIR` (default `storage/exports`; runtime files under `apps/api/storage/` are ignored and must not be committed)

## Security Controls Enabled
- Helmet headers enabled
- CORS with explicit configured origin
- Request body size limits (`json` + `urlencoded`)
- Correlation IDs (`x-request-id`) on all requests
- Request lifecycle logging with correlation ID
- Global exception filter with consistent error payload
- Global throttling + endpoint-specific throttles on auth/sensitive routes

## Swagger Policy
- Enabled automatically in non-production.
- In production, disabled unless `ENABLE_SWAGGER=true`.
- If enabled in production, Swagger routes are basic-auth protected and startup fails unless `SWAGGER_BASIC_USER` and `SWAGGER_BASIC_PASS` are set.

## Database Migrations
- Startup migration is controlled by `RUN_MIGRATIONS_ON_STARTUP`.
- Recommended:
  - Staging: `false`, run migrations in a controlled release step.
  - Production: `false`, run migrations in a controlled release step after backup.
- In production, startup migrations require both `RUN_MIGRATIONS_ON_STARTUP=true` and `ALLOW_PROD_STARTUP_MIGRATIONS=true`; otherwise startup validation fails.

Manual migration:
```bash
cd apps/api
npm run db:migrate:ci
```

## Docker Deployment
```bash
docker compose up -d --build
```

Verify health:
- API live: `GET /health/live`
- API ready: `GET /health/ready` (returns `503` when the DB is down)
- Reverse proxy live: `GET /nginx-health` when using `nginx.conf`

## Release Checklist
1. Build + test in CI (`lint`, `test`, `build`).
2. Apply DB migrations.
3. Deploy API container.
4. Smoke test:
   - Reverse-proxy deployment: `bash scripts/smoke-test.sh "$BASE_URL" "false"`
   - Local development: `bash scripts/smoke-test.sh` defaults to API `http://localhost:3001` and web `http://localhost:3005`
   - Staging Swagger check: pass `SMOKE_STAGING=true`; provide `SMOKE_SWAGGER_USER`/`SMOKE_SWAGGER_PASS` to expect `200`, otherwise the script expects protected docs to return `401`.
5. Monitor logs filtered by `x-request-id`.

## Incident Runbook (Quick)
1. Check `/health/ready` and DB connectivity.
2. Inspect request logs by correlation ID from client response header `x-request-id`.
3. Validate throttling status for auth/sensitive endpoints.
4. Roll back to previous image if regression is confirmed.
