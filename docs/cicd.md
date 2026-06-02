# IFMS CI/CD (GitHub Actions)

This document describes the CI, staging CD, and production CD pipelines for IFMS.

## Workflows

- PR checks: `.github/workflows/ci.yml`
- Staging deploy (on `main`): `.github/workflows/deploy-staging.yml`
- Production deploy (manual): `.github/workflows/deploy-production.yml`

## 1) Pull Request Pipeline

Trigger:

- `pull_request` on all branches

Checks executed:

1. Web lint/typecheck (`npm run lint`, `npx tsc --noEmit`)
2. API lint/typecheck (`npm run lint`, `npx tsc -p tsconfig.json --noEmit`)
3. Frontend tests (`npx vitest run`)
4. API unit tests with coverage (`npm test -- --testPathIgnorePatterns=test/ --coverage`)
5. API E2E tests against a PostgreSQL service container
6. Web and API builds
7. Drizzle migration generation check
8. Dependency audits (`npm audit --audit-level=high`; API audit is currently non-blocking)

## 2) Main Branch Staging Deployment Pipeline

Trigger:

- `push` to `main`

Stages:

1. Build and push images (`ghcr.io`):
   - `ifms-api:sha-<commit>` + `ifms-api:staging`
   - `ifms-web:sha-<commit>` + `ifms-web:staging`
2. Run staging migrations (staging only) through SSH using `scripts/migrate.sh`
3. Deploy to staging host via SSH:
   - `docker compose pull`
   - `docker compose up -d`
4. Run smoke tests via `scripts/smoke-test.sh`:
   - `GET /health/ready`
   - `GET /api/docs` (staging only; expects `401` unless Swagger credentials are supplied)
   - `GET /` (web root)

## 3) Manual Production Deployment Pipeline

Trigger:

- `workflow_dispatch` with `tag` or commit SHA

Stages:

1. Validate selected ref and operator context.
2. Build and push production API/web images (`ghcr.io`).
3. Create a pre-deploy database backup on the production host.
4. Run production migrations through SSH using `scripts/migrate.sh` and `docker-compose.production.yml`.
5. Pull and restart production services.
6. Run smoke tests via `scripts/smoke-test.sh` unless `skip_smoke` is selected. Production smoke does not check Swagger by default.

## Scripts

### `scripts/migrate.sh`

Runs migration command inside compose service:

- default compose: `docker-compose.staging.yml`
- default service: `api`
- default command: `npm run db:migrate:ci`

Example:

```bash
COMPOSE_FILE=docker-compose.staging.yml MIGRATION_SERVICE=api MIGRATION_CMD="npm run db:migrate:ci" bash scripts/migrate.sh
```

### `scripts/migrate.ps1` (Windows)

Windows PowerShell equivalent for local/admin use on Windows hosts.

```powershell
pwsh -File scripts/migrate.ps1 -ComposeFile docker-compose.staging.yml -ServiceName api -MigrationCommand "npm run db:migrate:ci"
```

### `scripts/smoke-test.sh`

Smoke checks against target base URL.

Example:

```bash
bash scripts/smoke-test.sh "https://staging.example.com" "true"
```

For local development, the script defaults to API `http://localhost:3001` and web `http://localhost:3005`:

```bash
bash scripts/smoke-test.sh
```

Override `SMOKE_API_BASE_URL` and `SMOKE_WEB_BASE_URL` only when using non-default local ports.

For authenticated staging Swagger checks:

```bash
SMOKE_SWAGGER_USER=admin SMOKE_SWAGGER_PASS='<password>' bash scripts/smoke-test.sh "https://staging.example.com" "true"
```

### `scripts/smoke-test.ps1` (Windows)

Windows PowerShell equivalent:

```powershell
pwsh -File scripts/smoke-test.ps1 -BaseUrl "https://staging.example.com" -IsStaging "true"
```

### Shell compatibility note

- GitHub Actions runners use Linux and execute the `.sh` scripts.
- On Windows, use the `.ps1` scripts unless you have Git Bash/WSL configured.

## Required GitHub Secrets

Set these in repository settings:

- `STAGING_SSH_HOST` - staging server hostname/IP
- `STAGING_SSH_USER` - SSH user
- `STAGING_SSH_PRIVATE_KEY` - private key for SSH
- `STAGING_APP_PATH` - absolute path to checked-out repo on staging host
- `STAGING_BASE_URL` - public base URL for smoke tests (e.g. `https://staging.example.com`)
- `GHCR_USERNAME` - registry username with package read on staging host
- `GHCR_TOKEN` - registry token/password (do not use plaintext in repo)
- `PROD_SSH_HOST` - production server hostname/IP
- `PROD_SSH_USER` - SSH user
- `PROD_SSH_PRIVATE_KEY` - private key for SSH
- `PROD_APP_PATH` - absolute path to checked-out repo on production host
- `PROD_BASE_URL` - public base URL for production smoke tests

Notes:

- CI uses `${{ secrets.GITHUB_TOKEN }}` to push images from GitHub Actions.
- No secret values are hardcoded in workflow files.

## Staging Host Requirements

The staging server should have:

- Docker + Docker Compose plugin
- Repository checked out at `STAGING_APP_PATH`
- Access to pull from GHCR using `GHCR_USERNAME`/`GHCR_TOKEN`
- Correct `.env.staging` runtime files for root web and `apps/api`, created from `.env.example` templates and stored outside git

## Operational Notes

- Migrations are run before deployment in both staging and production workflows.
- Compose image selection uses environment variables:
  - `API_IMAGE`
  - `WEB_IMAGE`
- `docker-compose.staging.yml` supports both local builds and prebuilt image pulls.
