# 022 – Phase 7: CRUD Completeness, N+1 Fix & CI/CD Hardening

**Date:** 2025-01-20
**Scope:** API PATCH endpoints for 3 modules, sales query optimization, production deploy workflow, E2E CI integration

---

## Changes

### 7A – Transfers PATCH Endpoint
- **Created** `apps/api/src/modules/transfers/dto/update-transfer.dto.ts` – optional `reference` field (max 128 chars)
- **Modified** `transfers.service.ts` – added `updateTransfer()` method; validates transfer exists and is not voided, updates reference note, audit logs
- **Modified** `transfers.controller.ts` – added `@Patch(':id')` with `ParseUUIDPipe`, `@Permissions('transfers:write')`

### 7B – Supplier Invoices PATCH Endpoint
- **Created** `apps/api/src/modules/payables/dto/update-supplier-invoice.dto.ts` – optional `invoiceNumber`, `dueDate`, `totalAmount`
- **Modified** `supplier-invoices.service.ts` – added `update()` method; validates invoice is unpaid, recalculates `balanceRemaining` when `totalAmount` changes (rejects if new balance would go negative), audit logs with before/after snapshot
- **Modified** `supplier-invoices.controller.ts` – added `@Patch(':id')` with `@Permissions('payables:write')`

### 7C – Credit Invoices PATCH Endpoint
- **Created** `apps/api/src/modules/credit/dto/update-credit-invoice.dto.ts` – optional `dueDate`, `totalAmount`, `items[]`
- **Modified** `credit-invoices.controller.ts` – added `@Patch(':id')` with `@Permissions('credit:write')` (service `update()` method already existed)

### 7D – Sales `findById` N+1 Fix
- **Modified** `sales.service.ts` – replaced 3 sequential queries (salesTransaction → saleItems → salePayments) with a single `Promise.all()` executing all 3 in parallel; same result shape, ~3× faster

### 7E – Production Deploy Workflow
- **Created** `.github/workflows/deploy-production.yml`
  - Triggered via `workflow_dispatch` with a required `tag` input (git tag or SHA)
  - Pipeline: validate → build-and-push (GHCR, `production` environment gate) → backup-database → migrate → deploy → smoke-tests
  - Pre-deploy database backup via `pg_dump` + gzip
  - Optional `skip_smoke` flag for emergency hotfixes
  - Concurrency lock prevents parallel production deploys

### 7F – E2E Tests Re-enabled in CI
- **Modified** `.github/workflows/ci.yml` – added `e2e` job with PostgreSQL 16 service container
  - Runs `drizzle-kit push` for schema setup
  - Executes `test/` directory tests with `--forceExit --detectOpenHandles`
  - Unit tests remain in separate `test` job (unchanged)

---

## Files Created (4)
| File | Purpose |
|------|---------|
| `apps/api/src/modules/transfers/dto/update-transfer.dto.ts` | Transfer PATCH DTO |
| `apps/api/src/modules/payables/dto/update-supplier-invoice.dto.ts` | Supplier Invoice PATCH DTO |
| `apps/api/src/modules/credit/dto/update-credit-invoice.dto.ts` | Credit Invoice PATCH DTO |
| `.github/workflows/deploy-production.yml` | Production deploy pipeline |

## Files Modified (6)
| File | Change |
|------|--------|
| `transfers.service.ts` | `updateTransfer()` method |
| `transfers.controller.ts` | `@Patch(':id')` endpoint |
| `supplier-invoices.service.ts` | `update()` method with balance recalculation |
| `supplier-invoices.controller.ts` | `@Patch(':id')` endpoint |
| `credit-invoices.controller.ts` | `@Patch(':id')` endpoint |
| `sales.service.ts` | `findById()` parallelized with `Promise.all` |
| `.github/workflows/ci.yml` | Added `e2e` job with Postgres service |

---

## Remaining Gap Items
| Priority | Item | Status |
|----------|------|--------|
| Low | Bulk endpoints (products, customers) | Not started |
| Low | Soft-delete recovery endpoints | Not started |
| Low | Dead `inventorySettings` table cleanup | Not started |
| Medium | Test coverage target (>60%) | In progress via E2E re-enablement |
