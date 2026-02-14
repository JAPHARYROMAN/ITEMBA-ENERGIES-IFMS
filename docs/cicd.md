# IFMS CI/CD (GitHub Actions)

This document describes the CI and staging CD pipelines added for IFMS.

## Workflows

- PR checks: `.github/workflows/ci.yml`
- Staging deploy (on `main`): `.github/workflows/deploy-staging.yml`

## 1) Pull Request Pipeline

Trigger:

- `pull_request` on all branches

Checks executed:

1. Web lint (`npm run lint` at repo root)
2. Web typecheck (`npx tsc --noEmit`)
3. Web build (`npm run build`)
4. API lint (`npm run lint` in `apps/api`)
5. API typecheck (`npx tsc -p tsconfig.json --noEmit`)
6. API unit tests (`npm test -- --testPathIgnorePatterns=test/`)
7. API build (`npm run build`)

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
   - `GET /api/health/ready`
   - `GET /api/docs` (staging only)
   - `GET /` (web root)

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

Notes:

- CI uses `${{ secrets.GITHUB_TOKEN }}` to push images from GitHub Actions.
- No secret values are hardcoded in workflow files.

## Staging Host Requirements

The staging server should have:

- Docker + Docker Compose plugin
- Repository checked out at `STAGING_APP_PATH`
- Access to pull from GHCR using `GHCR_USERNAME`/`GHCR_TOKEN`
- Correct `.env.staging` files for root web and `apps/api`

## Operational Notes

- Migrations are run before deployment and only in staging workflow.
- Compose image selection uses environment variables:
  - `API_IMAGE`
  - `WEB_IMAGE`
- `docker-compose.staging.yml` supports both local builds and prebuilt image pulls.
