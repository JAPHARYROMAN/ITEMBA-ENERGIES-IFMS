# 031 — DevOps Configuration & Production Hardening

**Date:** 2026-04-16
**Scope:** CI/CD workflows, Docker, NestJS 11 upgrade, env profiles, nginx, production compose

---

## Summary

Comprehensive DevOps hardening pass that resolves all deployment blockers identified in the readiness assessment. Upgraded NestJS from v10 to v11 to eliminate all production npm audit vulnerabilities. Fixed critical infrastructure bugs, aligned environment profiles, and validated both Docker builds.

---

## Changes

### 1. NestJS 10 → 11 Upgrade (Zero Production Vulnerabilities)

| Package | Before | After |
|---------|--------|-------|
| @nestjs/core | 10.4.15 | 11.1.19 |
| @nestjs/common | 10.4.15 | 11.1.19 |
| @nestjs/platform-express | 10.4.15 | 11.1.19 |
| @nestjs/platform-socket.io | 10.4.15 | 11.1.19 |
| @nestjs/websockets | 10.4.15 | 11.1.19 |
| @nestjs/jwt | 10.2.0 | 11.0.2 |
| @nestjs/passport | 10.0.3 | 11.0.5 |
| @nestjs/schedule | 4.1.2 | 5.0.1 |
| @nestjs/config | 3.3.0 | 4.0.4 |
| @nestjs/swagger | 8.0.7 | 11.3.0 |
| @nestjs/cli | 10.4.9 | 11.0.21 |
| @nestjs/schematics | 10.2.3 | 11.1.0 |
| @nestjs/testing | 10.2.0 | 11.1.19 |
| drizzle-kit | 0.28.1 | 0.31.10 |

**Result:** `npm audit --omit=dev` → **0 vulnerabilities** (was 12: 3 high, 9 moderate)

### 2. TypeScript Fixes for NestJS 11

- **`src/main.ts`**: Added explicit types to CORS origin callback parameters
- **`src/modules/auth/strategies/jwt.strategy.ts`**: Non-null assertion on `configService.get()`
- **`src/modules/notifications/guards/socket-auth.guard.ts`**: Fixed `JWT_SECRET` → `JWT_ACCESS_SECRET` (env schema uses `JWT_ACCESS_SECRET`)

### 3. Nginx Upstream Port Fix

- **`nginx.conf`**: Changed `server web:4173` → `server web:80`
- The frontend Dockerfile serves via nginx on port 80, not Vite preview on 4173

### 4. CI/CD Workflow Fixes

**`.github/workflows/ci.yml`:**
- Fixed E2E test env vars: `JWT_SECRET` → `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET`

**`.github/workflows/deploy-staging.yml`:**
- Added `environment: staging` to `migrate-staging`, `deploy-staging`, and `smoke-tests` jobs
- Secrets now correctly scoped to staging environment

**`.github/workflows/deploy-production.yml`:**
- Added `environment: production` to `backup-database`, `migrate-production`, `deploy-production`, and `smoke-tests` jobs
- Changed compose file reference from `docker-compose.yml` → `docker-compose.production.yml`
- Backup step now uses `-f docker-compose.production.yml`

### 5. Production Docker Compose

- **Created `docker-compose.production.yml`** — dedicated production stack with:
  - Higher resource limits (API: 2GB/2CPU, PostgreSQL: 1GB/1CPU)
  - 30-day backup retention (vs 14 in staging)
  - 50MB log file limits (vs 10MB in staging)
  - Port 443 exposed for HTTPS
  - Production env file references

### 6. Environment Profile Completion

**`apps/api/.env`** — Added:
- `ADMIN_SEED_EMAIL=admin@ifms.local`
- `ADMIN_SEED_PASSWORD=Admin!Strong1Password`

**`apps/api/.env.staging`** — Added 35+ missing vars:
- Export/signing configuration
- TSA integration (blank to disable)
- SMTP email configuration
- SMS provider (optional)
- AI keys (optional)
- Database pool tuning
- DB_SSL=require
- Admin seed credentials

**`apps/api/.env.production`** — Added same 35+ vars with production defaults:
- DB_POOL_MAX=30 (vs 20 staging)
- SMTP_SECURE=true
- DB_SSL=require

**`apps/api/.env.example`** — Added:
- SMTP, SMS, AI key sections
- Database pool tuning vars
- DB_SSL documentation

**`.env.example`** — Removed duplicate ADMIN vars (only needed in API .env)

---

## Validation

| Check | Result |
|-------|--------|
| Backend TypeScript | 0 errors |
| Backend tests | 53/53 passed |
| Frontend tests | 17/17 passed |
| NestJS build | Clean |
| Frontend Docker build | Success |
| API Docker build | Success |
| `npm audit --omit=dev` | 0 vulnerabilities |

---

## Remaining GitHub Configuration (Manual Steps)

These require repository admin access and cannot be done via code:

1. **Create GitHub Environments:** `staging` and `production` in Settings → Environments
2. **Configure Environment Secrets:**
   - Staging: `STAGING_SSH_HOST`, `STAGING_SSH_USER`, `STAGING_SSH_PRIVATE_KEY`, `STAGING_APP_PATH`, `STAGING_BASE_URL`, `GHCR_TOKEN`, `GHCR_USERNAME`
   - Production: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_PRIVATE_KEY`, `PROD_APP_PATH`, `PROD_BASE_URL`, `GHCR_TOKEN`, `GHCR_USERNAME`
3. **Production environment protection rules:** Require manual approval before deploy

---

## Files Changed

| File | Change |
|------|--------|
| `apps/api/package.json` | NestJS 10→11, drizzle-kit 0.28→0.31 |
| `apps/api/package-lock.json` | Dependency lockfile updated |
| `apps/api/src/main.ts` | CORS callback types |
| `apps/api/src/modules/auth/strategies/jwt.strategy.ts` | Non-null assertion |
| `apps/api/src/modules/notifications/guards/socket-auth.guard.ts` | JWT_SECRET→JWT_ACCESS_SECRET |
| `nginx.conf` | Upstream port 4173→80 |
| `.github/workflows/ci.yml` | JWT env vars for E2E |
| `.github/workflows/deploy-staging.yml` | Environment declarations |
| `.github/workflows/deploy-production.yml` | Environment declarations + compose file |
| `docker-compose.production.yml` | **NEW** — production stack |
| `apps/api/.env` | Admin seed credentials |
| `apps/api/.env.staging` | 35+ missing env vars |
| `apps/api/.env.production` | 35+ missing env vars |
| `apps/api/.env.example` | SMTP, SMS, AI, DB pool vars |
| `.env.example` | Remove duplicate admin vars |
