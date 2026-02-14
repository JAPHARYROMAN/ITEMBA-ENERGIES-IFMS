# Environment Hardening Runbook

This runbook defines how to manage environment configuration safely for both frontend and API services.

## 1) Principles

- Never commit real secrets to git.
- Commit only template/profile files with placeholder values.
- Validate environment values at startup/build and fail fast on invalid config.
- In production, do not run schema migrations automatically unless explicitly allowed.

## 2) Environment Profiles

### Frontend (repo root)

Tracked template/profile files:

- `.env.example` (documented baseline)
- `.env.staging` (staging placeholders)
- `.env.production` (production placeholders)

Ignored local secret files:

- `.env`
- `.env.local`
- `.env.*` (except the tracked templates above)

Used variables:

- `VITE_API_URL` (preferred API base URL)
- `NEXT_PUBLIC_API_BASE_URL` (compatibility alias)
- `VITE_DEMO_MODE` (preferred boolean)
- `DEMO_MODE` (compatibility alias)
- `GEMINI_API_KEY` (client-side demo key only)

Frontend validation:

- Implemented in `lib/env-schema.ts` and consumed by `lib/env.client.ts` and `vite.config.ts`.
- Build/start fails if demo mode is off and no API URL is provided.

### API (`apps/api`)

Tracked template/profile files:

- `.env.example` (documented baseline)
- `.env.staging` (staging placeholders)
- `.env.production` (production placeholders)

Ignored local secret files:

- `.env`
- `.env.local`
- `.env.*` (except tracked templates above)

API env validation:

- Implemented in `apps/api/src/common/env/env.schema.ts`.
- Applied by `ConfigModule.forRoot(... validate: envSchema.parse)` in `apps/api/src/app.module.ts`.

Additional safeguards:

- `DATABASE_URL` must be a valid `postgres://` or `postgresql://` URL.
- `FRONTEND_ORIGIN` entries must be valid HTTP/HTTPS URLs.
- JWT secrets must be at least 32 chars.
- In production, placeholder secrets containing `change-me` are rejected.
- Production startup migrations require both:
  - `RUN_MIGRATIONS_ON_STARTUP=true`
  - `ALLOW_PROD_STARTUP_MIGRATIONS=true`

## 3) Startup Safety Checks

API startup includes:

1. **DB reachability check** before serving traffic (`select 1` against pool).
2. **Migration gating** so production startup migrations remain opt-in only.

This behavior is implemented in `apps/api/src/main.ts`.

## 4) Scripts and Operational Commands

### Frontend (repo root)

- Local dev: `npm run dev`
- Explicit profile dev: `npm run dev:staging`, `npm run dev:production`
- Profile builds: `npm run build:staging`, `npm run build:production`

### API (`apps/api`)

- Local dev: `npm run start:local` (or `npm run start:dev`)
- Staging runtime: `npm run build && npm run start:staging`
- Production runtime: `npm run build && npm run start:prod`

Migration commands (CI/CD controlled):

- `npm run db:migrate:ci`
- `npm run db:migrate:prod`

Recommended deployment order:

1. Inject secrets via CI/CD secret manager.
2. Run `db:migrate:*` as an explicit deployment step.
3. Start API with `start:staging` or `start:prod`.
4. Verify health checks.

## 5) Secret Management Checklist

- Store production/staging secrets in your secret manager (not git).
- Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` periodically.
- Keep `RUN_MIGRATIONS_ON_STARTUP=false` in production by default.
- Keep `ALLOW_PROD_STARTUP_MIGRATIONS=false` in production by default.
- If swagger is enabled in production, enforce strong `SWAGGER_BASIC_*` credentials.

## 6) Troubleshooting

### API fails at startup with env validation error

- Inspect missing/invalid variable message.
- Compare your runtime env with `apps/api/.env.example`.

### API fails DB connectivity check

- Verify `DATABASE_URL` host/user/password/db name.
- Confirm DB is reachable from runtime network.

### Frontend build fails env validation

- Ensure `VITE_DEMO_MODE=true` for demo-only runs, OR set `VITE_API_URL`/`NEXT_PUBLIC_API_BASE_URL`.
