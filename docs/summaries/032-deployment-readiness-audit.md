# 032 – Deployment Readiness Audit

**Date:** 2026-04-16  
**Type:** Read-only research / deployment assessment  
**Scope:** Full production deployment readiness for IFMS Enterprise Financial Suite

---

## Executive Summary

The IFMS project has a **remarkably complete deployment infrastructure** already in place. The CI/CD pipelines, Docker configurations, backup/restore scripts, health checks, migration tooling, and operational runbooks are all production-grade. What remains is primarily **manual provisioning and configuration work** — no significant code changes are needed.

---

## A) What Is ALREADY DONE and Working

### Git & Source Control
- ✅ GitHub repo configured: `https://github.com/JAPHARYROMAN/ITEMBA-ENERGIES-IFMS.git`
- ✅ Single `main` branch with remote tracking

### CI Pipeline (`.github/workflows/ci.yml`)
- ✅ Runs on push to `main`/`master` and all PRs
- ✅ **4 jobs**: lint-and-typecheck → test → e2e → build
- ✅ Frontend: lint, typecheck, vitest, build
- ✅ API: lint, typecheck, unit tests, build
- ✅ E2E tests: spins up Postgres 16 service, runs drizzle push, runs integration tests

### Staging CD (`.github/workflows/deploy-staging.yml`)
- ✅ Triggers on push to `main`
- ✅ Builds & pushes Docker images to GHCR (API + Web)
- ✅ SSHs into staging host to run migrations via `scripts/migrate.sh`
- ✅ Pulls new images and restarts services via `docker compose`
- ✅ Post-deploy smoke tests against staging URL
- ✅ Concurrency control (no parallel deploys)

### Production CD (`.github/workflows/deploy-production.yml`)
- ✅ **Manual dispatch only** (workflow_dispatch with tag/SHA input)
- ✅ Pre-deploy database backup step
- ✅ Explicit migration step (after backup, before deploy)
- ✅ Image tagging with git tag + `production` label
- ✅ Post-deploy smoke tests (skippable)
- ✅ Concurrency control

### Docker Configurations
- ✅ **Root Dockerfile** (frontend): Multi-stage build → Node 22 + Vite → Nginx 1.27 serving static + health endpoint
- ✅ **API Dockerfile** (`apps/api/Dockerfile`): Multi-stage build → Node 22 → production-only deps + HEALTHCHECK + runs as `node` user (non-root)
- ✅ **docker-compose.yml**: Local dev (Postgres + API)
- ✅ **docker-compose.staging.yml**: Full stack (Postgres + db-backup + API + Web + Nginx) with health checks, logging limits, memory/CPU limits
- ✅ **docker-compose.production.yml**: Full stack with higher resource limits, 30-day backup retention, port 443 exposed

### Nginx Reverse Proxy (`nginx.conf`)
- ✅ Security headers: X-Frame-Options, XSS-Protection, Content-Type-Options, HSTS, CSP
- ✅ Routes: `/` → web, `/api/` → API, `/docs` → Swagger
- ✅ WebSocket upgrade support
- ✅ Health endpoint at `/nginx-health`

### Database & Migrations
- ✅ **12 Drizzle migration files** in `apps/api/drizzle/` (from init through compound indexes)
- ✅ `drizzle.config.ts` properly configured with schema path
- ✅ Migration scripts: `db:generate`, `db:migrate`, `db:migrate:ci`, `db:migrate:prod`, `db:push`, `db:studio`
- ✅ Seed script (`db:seed`) — creates companies, stations, branches, roles, permissions, admin user, products, tanks, pumps, nozzles
- ✅ Admin reset script (`db:reset-admin`)
- ✅ Startup migration gating: requires both `RUN_MIGRATIONS_ON_STARTUP=true` AND `ALLOW_PROD_STARTUP_MIGRATIONS=true` for production
- ✅ DB connectivity check at startup (fail-fast)

### Health Checks
- ✅ `GET /health/live` — liveness probe (API alive)
- ✅ `GET /health/ready` — readiness probe (API + DB connected)
- ✅ `GET /nginx-health` — nginx proxy health
- ✅ `GET /health` — frontend nginx health (in root Dockerfile)
- ✅ All Docker Compose services have `healthcheck` blocks with intervals, timeouts, retries, start_period

### Backup & Restore
- ✅ `scripts/backup-db.sh` — pg_dump with custom format, UTC timestamps, configurable retention
- ✅ `scripts/restore-db.sh` — pg_restore with safety gate (`CONFIRM_DB_RESTORE=YES_RESTORE`)
- ✅ `db-backup` service in both staging/production compose files (auto daily backups)
- ✅ Staging retains 14 backups, production retains 30

### Migration Scripts
- ✅ `scripts/migrate.sh` — Linux/CI migration runner via docker compose
- ✅ `scripts/migrate.ps1` — Windows PowerShell equivalent

### Smoke Tests
- ✅ `scripts/smoke-test.sh` — checks `/api/health/ready`, `/`, and `/api/docs` (staging-only)
- ✅ `scripts/smoke-test.ps1` — Windows PowerShell equivalent

### Security Hardening
- ✅ Helmet middleware enabled
- ✅ CORS with explicit origin allowlist
- ✅ Request body size limits
- ✅ Correlation IDs (`x-request-id`)
- ✅ Global throttling + endpoint-specific throttles
- ✅ JWT secrets require 32+ chars; `change-me` values rejected in production
- ✅ Swagger basic-auth protected in production
- ✅ API runs as `node` user (non-root) in Docker

### Monitoring / Observability
- ✅ `GET /ops/metrics` endpoint (request counts, latency buckets, cache hit/miss)
- ✅ Structured JSON logging with correlation IDs
- ✅ Slow query alert logging for reports (configurable threshold)
- ✅ JSON file log driver on all containers with rotation limits

### Environment Management
- ✅ `.env.example` files for both frontend and API
- ✅ Zod-based env validation at startup (both frontend and API)
- ✅ `.gitignore` properly excludes all `.env.*` except `.example` templates
- ✅ Comprehensive env-runbook documentation

### Documentation
- ✅ `docs/deployment.md` — API deployment runbook with release checklist
- ✅ `docs/deploy-staging.md` — Full staging deployment guide
- ✅ `docs/cicd.md` — CI/CD pipeline documentation
- ✅ `docs/ops-runbook.md` — Backup, restore, monitoring operations
- ✅ `docs/env-runbook.md` — Environment configuration and secret management

---

## B) Manual Steps Required (User Must Do)

### 1. Server Provisioning

You need **two Linux servers** (or one for staging-only to start):

**Minimum specs:**
- **Staging**: 2 vCPU, 4 GB RAM, 40 GB SSD
- **Production**: 4 vCPU, 8 GB RAM, 80 GB SSD (or more based on data volume)

**Providers to consider:** DigitalOcean Droplet, Hetzner Cloud, AWS EC2, Linode, Vultr

**On each server, install:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin (usually included with Docker now)
docker compose version  # verify

# Install git
sudo apt install -y git
```

### 2. Clone Repository on Each Server

```bash
# On staging server:
mkdir -p /opt/ifms && cd /opt/ifms
git clone https://github.com/JAPHARYROMAN/ITEMBA-ENERGIES-IFMS.git .
git checkout main

# On production server (same):
mkdir -p /opt/ifms && cd /opt/ifms
git clone https://github.com/JAPHARYROMAN/ITEMBA-ENERGIES-IFMS.git .
git checkout main
```

### 3. Domain & DNS Setup

You need **two domains/subdomains**:
- Staging: e.g. `staging.ifms.itembagroup.llc`
- Production: e.g. `app.ifms.itembagroup.llc`

**Create DNS A records pointing each to the respective server IP:**
```
staging.ifms.itembagroup.llc  →  <STAGING_SERVER_IP>
app.ifms.itembagroup.llc      →  <PRODUCTION_SERVER_IP>
```

### 4. SSL/TLS Certificates

The current setup is **HTTP-only**. You have two options:

**Option A: Certbot + Let's Encrypt (Recommended for VPS)**
```bash
# On each server:
sudo apt install -y certbot

# Stop any services using port 80 first, then:
sudo certbot certonly --standalone -d staging.ifms.itembagroup.llc

# Certs will be at:
# /etc/letsencrypt/live/staging.ifms.itembagroup.llc/fullchain.pem
# /etc/letsencrypt/live/staging.ifms.itembagroup.llc/privkey.pem

# Set up auto-renewal:
sudo systemctl enable certbot.timer
```

**Option B: Cloudflare proxy** — Point DNS through Cloudflare and use their free SSL. No cert management needed on your servers.

### 5. Create Environment Files on Servers

**On staging server** at `/opt/ifms`:

```bash
# Frontend env
cat > .env.staging <<'EOF'
VITE_API_URL=https://staging.ifms.itembagroup.llc/api
VITE_DEMO_MODE=false
EOF

# API env
cat > apps/api/.env.staging <<'EOF'
NODE_ENV=staging
PORT=3001
FRONTEND_ORIGIN=https://staging.ifms.itembagroup.llc
DATABASE_URL=postgresql://ifms:YOUR_STRONG_DB_PASSWORD_HERE@postgres:5432/ifms_staging
REQUEST_BODY_LIMIT=1mb
RUN_MIGRATIONS_ON_STARTUP=false
ALLOW_PROD_STARTUP_MIGRATIONS=false
ENABLE_SWAGGER=true
SWAGGER_BASIC_USER=admin
SWAGGER_BASIC_PASS=YOUR_SWAGGER_PASSWORD_HERE
JWT_ACCESS_SECRET=GENERATE_A_RANDOM_64_CHAR_STRING_HERE
JWT_REFRESH_SECRET=GENERATE_ANOTHER_RANDOM_64_CHAR_STRING
JWT_ACCESS_TTL=900
JWT_REFRESH_DAYS=7
REPORTS_CACHE_ENABLED=true
REPORTS_CACHE_MAX_ENTRIES=500
REPORTS_CACHE_TTL_SECONDS_DEFAULT=60
REPORTS_SLOW_QUERY_THRESHOLD_MS=2000
OPS_METRICS_ENABLED=true
GOVERNANCE_ENABLED=false
ALLOW_OVERLAPPING_SHIFTS=false
SHIFT_VARIANCE_REQUIRE_REASON_THRESHOLD=0
SALES_DISCOUNT_REQUIRE_MANAGER_THRESHOLD=10
SALES_ROUNDING_TOLERANCE=0.01
DELIVERY_VARIANCE_REQUIRE_REASON_THRESHOLD=0
EXPORT_STORAGE_DIR=storage/exports
EXPORT_EXPIRES_HOURS=72
EXPORT_OUTBOX_POLL_INTERVAL_SECONDS=10
EXPORT_VERIFY_BASE_URL=https://staging.ifms.itembagroup.llc/public/report/verify
EXPORT_DEFAULT_RETENTION_DAYS=2555
EXPORT_SIGN_REGULATORY_ONLY=true
EXPORT_STRICT_SIGNING_REQUIRED=false
EOF
```

**Generate strong secrets:**
```bash
# Generate random 64-char secrets:
openssl rand -base64 48  # run twice, one for each JWT secret
openssl rand -base64 24  # for DB password
openssl rand -base64 24  # for Swagger password
```

**On production server** — same structure but with:
- `NODE_ENV=production`
- `ENABLE_SWAGGER=false`
- `OPS_METRICS_ENABLED=false`
- `FRONTEND_ORIGIN=https://app.ifms.itembagroup.llc`
- Different, stronger secrets
- Production database name: `ifms` (not `ifms_staging`)

### 6. Update `nginx.conf` — Server Name

Before deploying, update `nginx.conf` on each server:
```bash
# On staging:
sed -i 's/staging.example.com/staging.ifms.itembagroup.llc/g' nginx.conf

# On production:
sed -i 's/staging.example.com/app.ifms.itembagroup.llc/g' nginx.conf
```

> **Note:** This is a per-server config change. See Section C for a code-level fix to make this configurable.

### 7. Set Postgres Password as Environment Variable

The compose files read `POSTGRES_PASSWORD` from the shell environment:

```bash
# On each server, add to ~/.bashrc or /etc/environment:
export POSTGRES_PASSWORD="YOUR_STRONG_DB_PASSWORD_HERE"  # same as in .env.staging/production DATABASE_URL
```

### 8. Configure GitHub Secrets

Go to **GitHub → Repository → Settings → Secrets and variables → Actions** and create:

**Staging environment secrets:**
| Secret | Value |
|--------|-------|
| `STAGING_SSH_HOST` | Your staging server IP or hostname |
| `STAGING_SSH_USER` | SSH user (e.g. `deploy`) |
| `STAGING_SSH_PRIVATE_KEY` | SSH private key (full PEM content) |
| `STAGING_APP_PATH` | `/opt/ifms` |
| `STAGING_BASE_URL` | `https://staging.ifms.itembagroup.llc` |
| `GHCR_USERNAME` | Your GitHub username |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` scope |

**Production environment secrets:**
| Secret | Value |
|--------|-------|
| `PROD_SSH_HOST` | Your production server IP or hostname |
| `PROD_SSH_USER` | SSH user (e.g. `deploy`) |
| `PROD_SSH_PRIVATE_KEY` | SSH private key |
| `PROD_APP_PATH` | `/opt/ifms` |
| `PROD_BASE_URL` | `https://app.ifms.itembagroup.llc` |
| `GHCR_USERNAME` | Your GitHub username |
| `GHCR_TOKEN` | GitHub PAT with `read:packages` scope |

**Create GitHub Environments:**
1. Go to Settings → Environments
2. Create `staging` environment
3. Create `production` environment (with required reviewers for manual approval)

**Generate SSH deploy key:**
```bash
# On your local machine:
ssh-keygen -t ed25519 -C "ifms-deploy" -f ~/.ssh/ifms_deploy -N ""

# Copy public key to each server:
ssh-copy-id -i ~/.ssh/ifms_deploy.pub deploy@<STAGING_IP>
ssh-copy-id -i ~/.ssh/ifms_deploy.pub deploy@<PRODUCTION_IP>

# The private key content (~/.ssh/ifms_deploy) goes into STAGING_SSH_PRIVATE_KEY / PROD_SSH_PRIVATE_KEY
```

### 9. Create Deploy User on Servers

```bash
# On each server:
sudo adduser --disabled-password deploy
sudo usermod -aG docker deploy

# Ensure the deploy user owns /opt/ifms:
sudo chown -R deploy:deploy /opt/ifms
```

### 10. GHCR Package Authentication on Servers

The servers need to pull Docker images from GHCR:
```bash
# On each server, as deploy user:
echo "YOUR_GHCR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### 11. First-Time Database Seed

After the first deployment (once Postgres is up and migrations have run):
```bash
# On staging server:
cd /opt/ifms
docker compose -f docker-compose.staging.yml exec api sh -c \
  "ADMIN_SEED_EMAIL=admin@yourcompany.com ADMIN_SEED_PASSWORD='YourStrongAdminPass!' npm run db:seed"
```

---

## C) Code Changes Still Needed

### Minor / Optional (Not Blocking)

1. **`nginx.conf` has hardcoded `server_name staging.example.com`**
   - The compose files mount this as read-only. On each server you'll manually edit it (see step 6 above).
   - A cleaner solution: use `envsubst` in a Docker entrypoint to template the server name from an env var. This is a nice-to-have, not a blocker.

2. **No SSL termination in `nginx.conf`**
   - The `docker-compose.production.yml` exposes port 443 but `nginx.conf` only has `listen 80`.
   - If using Certbot directly (not Cloudflare): you need to add a `listen 443 ssl` block and cert volume mounts. If using Cloudflare proxy: this is fine as-is.

3. **`.env.staging` / `.env.production` files are not committed (by design)**
   - This is correct for security. The `.gitignore` excludes them. They must be created manually on each server.

4. **Image tag placeholders** — `ghcr.io/example-org/ifms-api` in compose files
   - The GitHub Actions workflows override these via `API_IMAGE`/`WEB_IMAGE` env vars, so this works correctly. The defaults are just fallback placeholders.

5. **`docs/cicd.md` doesn't mention the production workflow** — minor documentation gap; it only covers CI and staging.

### Not Needed
- No code changes are required for the deployment pipeline to function.
- Health checks, migrations, backups, smoke tests — all implemented and wired.

---

## D) Prioritized Step-by-Step Deployment Checklist

### Phase 1: GitHub Setup (30 min)
- [ ] 1. Verify repo is pushed to GitHub and CI passes on `main`
- [ ] 2. Create `staging` and `production` environments in GitHub Settings
- [ ] 3. Generate SSH deploy key pair
- [ ] 4. Generate GitHub PAT with `read:packages` scope

### Phase 2: Staging Server (1-2 hours)
- [ ] 5. Provision staging server (2 vCPU, 4 GB RAM, Ubuntu 22.04+)
- [ ] 6. Install Docker + Git on staging server
- [ ] 7. Create `deploy` user, add to docker group
- [ ] 8. Add SSH deploy public key to `deploy` user's `~/.ssh/authorized_keys`
- [ ] 9. Clone repo to `/opt/ifms` on staging server
- [ ] 10. Create DNS A record: `staging.ifms.itembagroup.llc` → server IP
- [ ] 11. Set up SSL (Certbot or Cloudflare)
- [ ] 12. Create `.env.staging` and `apps/api/.env.staging` with real values
- [ ] 13. Update `nginx.conf` server_name on staging server
- [ ] 14. Export `POSTGRES_PASSWORD` in deploy user's environment
- [ ] 15. Log in to GHCR on staging server: `docker login ghcr.io`

### Phase 3: Staging Deploy & Validate (30 min)
- [ ] 16. Set all `STAGING_*` secrets in GitHub
- [ ] 17. Push a commit to `main` to trigger staging deployment
- [ ] 18. Monitor GitHub Actions for successful pipeline
- [ ] 19. Verify on staging:
  - `curl https://staging.ifms.itembagroup.llc/nginx-health`
  - `curl https://staging.ifms.itembagroup.llc/api/health/ready`
  - `curl https://staging.ifms.itembagroup.llc/`
  - `curl https://staging.ifms.itembagroup.llc/docs`
- [ ] 20. Run initial seed: `docker compose exec api sh -c "ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... npm run db:seed"`
- [ ] 21. Login to the app with seeded admin credentials
- [ ] 22. Run smoke tests: `bash scripts/smoke-test.sh "https://staging.ifms.itembagroup.llc" "true"`

### Phase 4: Production Server (1-2 hours)
- [ ] 23. Provision production server (4 vCPU, 8 GB RAM)
- [ ] 24. Repeat steps 6-9 and 11-15 for production (using production values)
- [ ] 25. Set all `PROD_*` secrets in GitHub
- [ ] 26. Add required reviewers to `production` environment in GitHub

### Phase 5: Production Deploy & Validate (30 min)
- [ ] 27. Go to Actions → "Deploy Production" → Run workflow → enter tag (e.g. `main` or a git tag)
- [ ] 28. Approve the deployment in GitHub (if reviewers are configured)
- [ ] 29. Monitor pipeline: backup → migrate → deploy → smoke tests
- [ ] 30. Verify production endpoints
- [ ] 31. Run initial seed on production
- [ ] 32. Login and verify end-to-end

### Phase 6: Post-Deploy Hardening
- [ ] 33. Verify backup service is running: `docker compose logs db-backup`
- [ ] 34. Test restore drill on staging (per ops-runbook)
- [ ] 35. Set up server firewall (only allow 80, 443, 22):
  ```bash
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw enable
  ```
- [ ] 36. Set up external monitoring (UptimeRobot, Better Uptime, etc.) on:
  - `https://app.ifms.itembagroup.llc/api/health/ready`
  - `https://app.ifms.itembagroup.llc/`
- [ ] 37. Set up log aggregation if needed (optional: Grafana Loki, Datadog, etc.)
- [ ] 38. Configure SSL cert auto-renewal verification
- [ ] 39. Document the admin credentials in a password manager

---

## E) Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Git remote | ✅ Ready | GitHub repo configured |
| CI pipeline | ✅ Ready | Lint, test, e2e, build |
| Staging CD | ✅ Ready | Auto-deploy on main push |
| Production CD | ✅ Ready | Manual dispatch with backup |
| Dockerfiles | ✅ Ready | Multi-stage, health checks, non-root |
| Docker Compose (staging) | ✅ Ready | Full stack with resource limits |
| Docker Compose (production) | ✅ Ready | Full stack with higher limits |
| Nginx reverse proxy | ✅ Ready | Security headers, routing |
| DB migrations | ✅ Ready | 12 migrations, gated startup |
| DB seed | ✅ Ready | Full seed script |
| Backup/restore | ✅ Ready | Auto daily + safety-gated restore |
| Health checks | ✅ Ready | Live, ready, nginx, web |
| Smoke tests | ✅ Ready | Bash + PowerShell |
| Env validation | ✅ Ready | Zod schemas, fail-fast |
| Security hardening | ✅ Ready | Helmet, CORS, throttling, JWT |
| Monitoring | ✅ Ready | Ops metrics, structured logs |
| Documentation | ✅ Ready | 5 runbooks covering all operations |
| SSL/TLS | ⚠️ Manual | Need certs + nginx config |
| Server provisioning | ❌ Manual | Need to provision + configure |
| GitHub secrets | ❌ Manual | Need to set ~12 secrets |
| DNS records | ❌ Manual | Need A records for domains |
| Env files on servers | ❌ Manual | Need to create with real values |

**Bottom line:** The codebase is deployment-ready. You need to provision infrastructure and configure secrets.
