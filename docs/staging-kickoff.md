# Staging Kickoff Runbook

Step-by-step to stand up the **staging (pre-production)** environment and run the
first deploy. Everything in the codebase is ready; the items below are the
environment + secrets that only you can provide.

Deploy flow (already built): push to `main` → `.github/workflows/deploy-staging.yml`
runs **build images → push to GHCR → migrate DB → deploy via SSH → smoke test**,
using `docker-compose.staging.yml` on the host.

---

## 0. Prerequisites (one-time, on the staging host)

- A Linux host reachable by SSH (the deploy uses `appleboy/ssh-action`).
- Docker Engine + Docker Compose v2 installed.
- The repo checked out at a known path (becomes `STAGING_APP_PATH`), e.g. `/opt/ifms`.
- Outbound access to `ghcr.io` to pull images.
- A DNS record for the staging domain pointing at the host (e.g. `staging.yourco.com`).

```bash
# on the host, once
sudo mkdir -p /opt/ifms && sudo chown "$USER" /opt/ifms
git clone https://github.com/JAPHARYROMAN/ITEMBA-ENERGIES-IFMS.git /opt/ifms
cd /opt/ifms && git checkout main
mkdir -p certs certbot-www backups   # cert + acme + backup dirs (see TLS step)
```

---

## 1. GitHub Actions secrets (Settings → Secrets and variables → Actions)

The staging deploy workflow requires **exactly these** (verified from `deploy-staging.yml`):

| Secret | What it is | Example / format |
|---|---|---|
| `STAGING_SSH_HOST` | host/IP of the staging server | `203.0.113.10` |
| `STAGING_SSH_USER` | SSH user | `deploy` |
| `STAGING_SSH_PRIVATE_KEY` | private key (PEM) for that user | full `-----BEGIN OPENSSH PRIVATE KEY-----…` |
| `STAGING_APP_PATH` | repo path on host | `/opt/ifms` |
| `STAGING_BASE_URL` | public base URL for smoke tests | `https://staging.yourco.com` |
| `GHCR_USERNAME` | GitHub username/org for GHCR pull | `JAPHARYROMAN` |
| `GHCR_TOKEN` | PAT with `read:packages` (+`write:packages` if pushing) | `ghp_…` |

> `GITHUB_TOKEN` is provided automatically — do **not** create it.

Add the matching `staging` **environment** in GitHub (Settings → Environments) if
you want required reviewers/approval before deploys.

---

## 2. Host-side env files (NOT committed — create on the host)

Compose reads three things on the host:

**a) `POSTGRES_PASSWORD`** — used by compose substitution for the DB + `DATABASE_URL`.
Put it in a host `.env` next to the compose file (compose auto-loads `./.env`):
```bash
# /opt/ifms/.env   (host-level, for docker compose substitution)
POSTGRES_PASSWORD=<strong-random-password>
API_IMAGE=ghcr.io/japharyroman/ifms-api:staging
WEB_IMAGE=ghcr.io/japharyroman/ifms-web:staging
```

**b) `apps/api/.env.staging`** — the API container's env_file. Minimum required
(values validated at boot by `env.schema.ts`):
```bash
NODE_ENV=production            # staging runs prod-mode validation
# DATABASE_URL is injected by compose; DB_SSL below still applies
DB_SSL=require                 # REQUIRED in prod-mode (boot fails on 'false')
JWT_ACCESS_SECRET=<openssl rand -base64 48>   # must NOT contain "change-me"
JWT_REFRESH_SECRET=<openssl rand -base64 48>
ADMIN_SEED_EMAIL=admin@yourco.com
ADMIN_SEED_PASSWORD=<strong-password>          # used once by db:seed
# Swagger is ON in staging compose → these are REQUIRED or boot fails:
ENABLE_SWAGGER=true
SWAGGER_BASIC_USER=<user>
SWAGGER_BASIC_PASS=<strong-password>
# Email (password reset / notifications) — see docs/smtp-setup.md
SMTP_HOST=<smtp host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<user>
SMTP_PASS=<pass>
SMTP_FROM="IFMS <noreply@yourco.com>"
# AI features (ROTATED keys — see docs/key-rotation.md). Optional; omit to disable.
GEMINI_API_KEY=<rotated key>
GROQ_API_KEY=<rotated key>
```

**c) `.env.staging`** (repo root) — the web container's env_file:
```bash
VITE_API_URL=https://staging.yourco.com
VITE_DEMO_MODE=false
```

> Generate strong secrets: `openssl rand -base64 48`. Never commit these files
> (`.env*` is gitignored).

---

## 3. Domain + TLS (see docs/tls-setup.md)

1. In `docker-compose.staging.yml`, change the hardcoded
   `FRONTEND_ORIGIN: https://staging.example.com` (api service) to your real
   staging origin. *(This is a tracked file — commit the change.)*
2. In `nginx.conf`, set `server_name` to your staging domain.
3. Obtain certs into the host `./certs` dir (Let's Encrypt via the
   `/.well-known/acme-challenge` path, or BYO): `fullchain.pem` + `privkey.pem`.

---

## 4. Pre-flight secrets/security checklist (do before first deploy)

- [ ] **Rotated** Gemini + Groq keys (the previously-exposed ones) — `docs/key-rotation.md`.
- [ ] `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are strong, ≥32 chars, no `change-me`.
- [ ] `ADMIN_SEED_PASSWORD` is strong (not `1618`/`change-me`).
- [ ] `DB_SSL=require` set (prod-mode boot enforces this).
- [ ] Swagger basic-auth creds set (since `ENABLE_SWAGGER=true` in staging).
- [ ] `FRONTEND_ORIGIN` = exact staging origin(s); no wildcards.
- [ ] TLS certs present on host; `nginx.conf` `server_name` set.
- [ ] No secrets committed: `git grep -nE "AIza|gsk_|BEGIN .*PRIVATE KEY"` returns nothing in tracked files.

## 5. First deploy

Option A — **automatic** (push to `main` triggers `deploy-staging.yml`):
the workflow builds+pushes images, runs `bash scripts/migrate.sh` (drizzle-kit
migrate against `docker-compose.staging.yml`), brings services up, and smoke-tests.

Option B — **manual on the host** (good for the very first bring-up):
```bash
cd /opt/ifms && git pull --ff-only
# build or pull images, then:
bash scripts/migrate.sh                         # applies migrations (61 tables + 4 matviews)
docker compose -f docker-compose.staging.yml up -d
# seed the first admin (one-time):
docker compose -f docker-compose.staging.yml exec api npm run db:seed
```

## 6. Post-deploy verification

```bash
# health + smoke (the workflow runs scripts/smoke-test.sh automatically)
curl -fsS https://staging.yourco.com/health/ready
curl -fsS https://staging.yourco.com/api/docs        # basic-auth prompt expected
bash scripts/smoke-test.sh https://staging.yourco.com true
```
- [ ] App loads over HTTPS; cert valid (`curl -I`).
- [ ] Login with the seeded admin works (≥8-char password enforced).
- [ ] A report page renders (materialized views populated/refreshed).
- [ ] Realtime/notifications connect (socket.io to `/realtime`).
- [ ] Trigger a password reset → email delivered (confirms SMTP).

## 7. Backup / restore drill (before promoting toward prod)

```bash
# a backup is produced by the db-backup sidecar; verify + test restore into a scratch DB
bash scripts/backup-db.sh
CONFIRM_DB_RESTORE=YES_RESTORE PGDATABASE=ifms_restore_test bash scripts/restore-db.sh <backup-file>
```
- [ ] Backup file created with retention working.
- [ ] Restore into a scratch DB succeeds and app boots against it.

---

## Known-good baseline (what CI already guarantees on every `main`)

- lint + typecheck, web tests (~91% cov), api tests (~88% cov, 1292 tests),
  e2e against a real migrated Postgres, build, and a blocking `npm audit`.
- Migration path verified to build a fresh DB cleanly (61 tables + 4 matviews).

## What pre-prod will validate that CI cannot

- The **deploy pipeline against a real host** (SSH, GHCR pull, compose up) — never
  run before; this is the main thing staging proves out.
- Real **TLS termination**, **SMTP delivery**, and **backup/restore** on infra.
- Behaviour under real multi-user traffic (a longer soak / multi-IP load test is
  recommended once staging is live — see docs/load-testing.md).
