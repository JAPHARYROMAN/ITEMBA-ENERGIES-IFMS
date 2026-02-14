# Staging Deployment Guide (Docker Compose)

This guide deploys IFMS staging with four containers:

- `postgres`
- `api`
- `web`
- `nginx` (reverse proxy)

Compose file: `docker-compose.staging.yml`

## 1) Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- DNS record for a staging domain (example: `staging.example.com`) pointing to your host

## 2) Configure placeholders before first deploy

### API env profile

Edit `apps/api/.env.staging` and replace placeholders:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `SWAGGER_BASIC_PASS`
- `FRONTEND_ORIGIN`

### Frontend env profile

Edit `.env.staging`:

- `VITE_API_URL` should be your public API URL, e.g. `https://staging.example.com/api`
- Keep `VITE_DEMO_MODE=false` for real backend use

### Nginx host placeholder

Edit `nginx.conf`:

- Replace `server_name staging.example.com;` with your real staging domain.

## 3) Build and run

From repository root:

```bash
docker compose -f docker-compose.staging.yml build
docker compose -f docker-compose.staging.yml up -d
```

Check service status:

```bash
docker compose -f docker-compose.staging.yml ps
```

Tail logs:

```bash
docker compose -f docker-compose.staging.yml logs -f nginx api web postgres
```

## 4) Health checks

Container health checks are wired for all services:

- `postgres`: `pg_isready`
- `api`: `GET /health/live`
- `web`: HTTP check on port `4173`
- `nginx`: `GET /nginx-health`

Manual probes (from your workstation):

```bash
curl -i http://<staging-host>/nginx-health
curl -i http://<staging-host>/api/health/live
curl -i http://<staging-host>/
curl -i http://<staging-host>/docs
```

## 5) Routing behavior

The staging proxy routes:

- `/` -> `web`
- `/api` -> `api`
- `/docs` -> API Swagger (staging only)

Config file: `nginx.conf`

## 6) Controlled migrations (recommended)

Do not enable startup migrations blindly. Keep:

- `RUN_MIGRATIONS_ON_STARTUP=false`
- `ALLOW_PROD_STARTUP_MIGRATIONS=false`

Run migrations explicitly as a release step:

```bash
docker compose -f docker-compose.staging.yml run --rm api npm run db:migrate:ci
```

Then restart API:

```bash
docker compose -f docker-compose.staging.yml up -d api
```

## 7) SSL-ready notes (without hardcoded certs)

This skeleton is HTTP-only by default. For TLS:

1. Terminate TLS at an external load balancer/reverse proxy **or** extend `nginx.conf` with a `listen 443 ssl` server.
2. Mount certificate files at runtime (for example via secrets/volumes), do not commit certs/keys.
3. Keep cert/key paths configurable by deployment tooling.
4. Redirect port 80 to 443 once TLS is active.

## 8) Update / rollback commands

Redeploy with rebuild:

```bash
docker compose -f docker-compose.staging.yml up -d --build
```

Stop all services:

```bash
docker compose -f docker-compose.staging.yml down
```

Stop and remove volumes (destructive for DB data):

```bash
docker compose -f docker-compose.staging.yml down -v
```
