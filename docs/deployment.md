# IFMS API Deployment Runbook

## Runtime Components
- `postgres` (PostgreSQL 16)
- `api` (NestJS + Drizzle)

Docker compose includes both services:
- `docker-compose.yml`

## Required Environment Variables
- `NODE_ENV` (`production` recommended)
- `PORT` (default `3001`)
- `FRONTEND_ORIGIN` (CORS allow origin)
- `DATABASE_URL` (Postgres connection string)
- `JWT_ACCESS_SECRET` (min 16 chars)
- `JWT_REFRESH_SECRET` (min 16 chars)

## Hardening/Operations Variables
- `REQUEST_BODY_LIMIT` (default `1mb`)
- `RUN_MIGRATIONS_ON_STARTUP` (`true|false`, default `false`)
- `ENABLE_SWAGGER` (`true|false`, default `false`)
- `SWAGGER_BASIC_USER` (required in prod if swagger enabled)
- `SWAGGER_BASIC_PASS` (required in prod if swagger enabled)

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
- If enabled in production and credentials are set, Swagger routes are basic-auth protected.

## Database Migrations
- Startup migration is controlled by `RUN_MIGRATIONS_ON_STARTUP`.
- Recommended:
  - Staging: `true`
  - Production: `false` by default, run migrations in a controlled release step.

Manual migration:
```bash
cd apps/api
npm run db:migrate
```

## Docker Deployment
```bash
docker compose up -d --build
```

Verify health:
- API live: `GET /health/live`
- API ready: `GET /health/ready`

## Release Checklist
1. Build + test in CI (`lint`, `test`, `build`).
2. Apply DB migrations.
3. Deploy API container.
4. Smoke test:
   - `POST /api/auth/login`
   - `GET /api/reports/overview`
   - `POST /api/shifts/open` then `/api/shifts/:id/close`
5. Monitor logs filtered by `x-request-id`.

## Incident Runbook (Quick)
1. Check `/health/ready` and DB connectivity.
2. Inspect request logs by correlation ID from client response header `x-request-id`.
3. Validate throttling status for auth/sensitive endpoints.
4. Roll back to previous image if regression is confirmed.
