# IFMS API

NestJS backend for the Integrated Financial Management System.

## Stack

- **Runtime:** Node.js 22
- **Framework:** NestJS 11
- **Database:** PostgreSQL 16 + Drizzle ORM
- **Validation:** class-validator / class-transformer (global ValidationPipe)
- **Docs:** OpenAPI/Swagger at `/docs` with Bearer auth support

## Endpoints

| Path | Description |
|------|-------------|
| `GET /health/live` | Liveness probe (no DB) |
| `GET /health/ready` | Readiness probe (checks DB; returns `503` when DB is down) |
| `GET /docs` | Swagger UI |
| `GET /docs-json` | OpenAPI JSON |

All other routes are prefixed with `/api`.

## Setup

1. **Install dependencies**
   ```bash
   cd apps/api && npm install
   ```

2. **Environment**
   ```bash
   cp .env.example .env
   # Set DATABASE_URL and ensure FRONTEND_ORIGIN includes http://localhost:3005 and http://localhost:5173
   ```

3. **Database**
   - Start Postgres (e.g. `docker compose up -d postgres` from repo root).
   - Run migrations: `npm run db:migrate` (or apply `drizzle/0000_init_health.sql` manually).

4. **Run**
   ```bash
   npm run start:dev
   ```
   API: http://localhost:3001  
   Swagger: http://localhost:3001/docs

## Local Compose

From repository root:

```bash
docker compose up -d postgres
```

- Postgres: `localhost:5433` (user `ifms`, password `ifms`, db `ifms`)
- API dev server: http://localhost:3001 (`npm run start:dev` from `apps/api`)

Run migrations after first start (e.g. locally with `DATABASE_URL=postgresql://ifms:ifms@localhost:5433/ifms`):

```bash
cd apps/api && npm run db:migrate
```

Seed/reset admin credentials are read from `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD`; the local example is `admin@ifms.local` / `1618`.

## Scripts

- `npm run build` – Build for production
- `npm run start:dev` – Watch mode
- `npm run start:prod` – Run production build
- `npm run db:generate` – Generate Drizzle migrations from schema
- `npm run db:migrate` – Run migrations
- `npm run db:push` – Push schema (dev)
- `npm run db:studio` – Drizzle Studio
