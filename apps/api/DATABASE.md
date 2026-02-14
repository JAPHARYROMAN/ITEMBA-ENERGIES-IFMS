# IFMS Database (Drizzle + PostgreSQL)

## Setup

1. **Environment**  
   Copy `.env.example` to `.env` and set `DATABASE_URL` to your real PostgreSQL URL.  
   - **Docker:** from repo root run `docker-compose up -d postgres`, then use the URL from `docker-compose.yml` (e.g. `postgresql://ifms:ifms@localhost:5432/ifms`).  
   - **Local Postgres:** use a user that exists (e.g. `postgresql://postgres:YOUR_PASSWORD@localhost:5432/ifms`). Create the database if needed: `createdb ifms` or `CREATE DATABASE ifms;`.  
   Drizzle loads `.env` when running `db:migrate` / `db:push` / `db:studio`, so ensure `apps/api/.env` exists and has the correct `DATABASE_URL`.

2. **Migrations**  
   From `apps/api`:
   ```bash
   npm run db:migrate
   ```
   Applies all migrations in `drizzle/` (e.g. `0000_init_health.sql`, `0001_ifms_full_schema.sql`).

3. **Seed (sample data)**  
   Run after migrations. From `apps/api`:
   ```bash
   npm run db:seed
   ```
   Uses `ts-node` to run `src/database/seed.ts`. Requires `DATABASE_URL`.  
   Inserts: 2 companies, 2 stations, 2 branches, 3 roles, permissions, role-permission links, 1 user (manager), 2 products, 1 tank, 2 pumps, 2 nozzles.  
   **Note:** Re-running the seed will fail on unique constraints (e.g. company code); use a fresh DB or skip seed.

## Schema overview

- **Multi-company hierarchy:** `companies` → `stations` → `branches`. Operational tables reference `company_id` and/or `branch_id` for reporting and RBAC.
- **Audit:** Every table has `id` (uuid), `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at` (soft delete).  
  Universal `audit_log` table stores entity, entity_id, action, before/after JSON, actor_user_id, ip, user_agent, created_at.
- **Money:** `numeric(18,2)`; **quantities/liters:** `numeric(18,3)`.
- Schema and migrations live under `src/database/schema/` and `drizzle/`.
