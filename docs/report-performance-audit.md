# IFMS Reports Performance Audit

Date: 2026-02-14

## Scope
Audited and optimized these endpoints:
- `GET /reports/overview`
- `GET /reports/daily-operations`
- `GET /reports/stock-loss`
- `GET /reports/profitability`
- `GET /reports/credit-cashflow`
- `GET /reports/station-comparison`

Response shapes and business logic were kept unchanged.

## 1) Query Inventory By Endpoint

### `GET /reports/overview`
Drizzle query groups:
- KPI aggregates over `sales_transactions` (+ `branches`)
- liters/COGS aggregates over `sale_items` + `sales_transactions` (+ `branches`)
- variance aggregate over `variances` (+ `branches`, `tanks`)
- overdue AR aggregate over `credit_invoices` (+ `branches`)
- overdue AP aggregate over `supplier_invoices` (+ `branches`)
- sales trend timeseries over `sales_transactions` (+ `branches`)
- payment mix aggregate over `sale_payments` + `sales_transactions` (+ `branches`)
- station variance aggregate over `reconciliations` (+ `branches`, `stations`)
- top debtors base query over `customers` (+ `branches`)
- debtor payment history over `payments`
- debtor invoice history over `credit_invoices`

### `GET /reports/daily-operations`
Drizzle query groups:
- shift performance over `shifts` (+ `users`)
- pump performance over `meter_readings` + `shifts` + `nozzles` + `products`
- payment mix over `sale_payments` + `sales_transactions` (+ `branches`)

### `GET /reports/stock-loss`
Drizzle query groups:
- tank loss aggregates over `tanks` (+ `branches`, `stations`, `products`, `variances`)
- shrinkage trend over `variances` (+ `branches`, `tanks`)
- delivery reconciliation over `deliveries` (+ `branches`)

### `GET /reports/profitability`
Drizzle query groups:
- profitability metric aggregate over `sales_transactions` + `sale_items` (+ `branches`)
- margin by product over `sale_items` + `sales_transactions` + `products` (+ `branches`)
- station contribution over `stations` + `branches` + `sales_transactions` + `sale_items`

### `GET /reports/credit-cashflow`
Drizzle query groups:
- AR aging over `credit_invoices` (+ `branches`)
- AP aging over `supplier_invoices` (+ `branches`)
- top debtors (same 3-query pattern as overview): `customers`, `payments`, `credit_invoices`

### `GET /reports/station-comparison`
Drizzle query groups:
- station contribution query (same as profitability)
- trend aggregate over `sales_transactions` (+ `branches`, `stations`)

## 2) Current Hotspots

Most expensive patterns (high row volume + wide joins + group-by):
- Timeseries/grouping on `sales_transactions.transaction_date`
- Large aggregate joins on:
  - `sale_items -> sales_transactions`
  - `meter_readings -> shifts -> nozzles -> products`
  - `tanks -> variances -> branches/stations`
- Aging and debtor calculations scanning:
  - `credit_invoices`
  - `supplier_invoices`
  - `payments`
- Status/date filtered shift queries (`open`/`closed`) without a targeted partial index path.

## 3) Safe Improvements Implemented

### A) Report query timing instrumentation (measurable)

Added endpoint-level and subquery-level timing logs in `ReportsService`:
- Logs include:
  - `correlationId`
  - endpoint name
  - filters
  - total endpoint query time (`totalMs`)
  - per-subquery timings (`subqueries`)
  - cache-hit marker
- Log event: `reports.timing` (context: `ReportsPerf`)

Also added query-wrapper timing points around report DB queries to support explain logging.

### B) Dev-only EXPLAIN support

Environment flag:
- `REPORTS_EXPLAIN=true`

Behavior:
- active only when `NODE_ENV=development`
- logs `EXPLAIN (ANALYZE, BUFFERS)` output for wrapped report queries
- log event: `reports.explain` (context: `ReportsExplain`)

### C) Index migration

Added migration: `apps/api/drizzle/0004_report_query_indexes.sql`

Indexes added:
- Composite date-path indexes:
  - `shifts(company_id, branch_id, start_time)`
  - `deliveries(company_id, branch_id, expected_date)`
- Composite created-at path indexes:
  - `shifts(company_id, branch_id, created_at)`
  - `reconciliations(company_id, branch_id, created_at)`
  - `variances(company_id, branch_id, created_at)`
  - `credit_invoices(company_id, branch_id, created_at)`
  - `supplier_invoices(company_id, branch_id, created_at)`
  - `payments(company_id, branch_id, created_at)`
  - `customers(company_id, branch_id, created_at)`
- Branch/status/created-at indexes:
  - `shifts(branch_id, status, created_at)`
  - `customers(branch_id, status, created_at)`
- Join/foreign-key helper indexes for report joins:
  - `sales_transactions(branch_id)`
  - `deliveries(branch_id)`
  - `reconciliations(branch_id)`
  - `variances(branch_id)`
  - `credit_invoices(branch_id)`
  - `supplier_invoices(branch_id)`
- Partial index for open-shift operational queries:
  - `shifts(branch_id, start_time desc) WHERE status='open' AND deleted_at IS NULL`

## 4) Expected Improvements

- Reduced planner cost for branch/date/status report scans.
- Faster join fan-out from branch-centric reports into sales/invoice/variance tables.
- Better selectivity for open shift lookups with partial index.
- Clear observability of query latency regressions via endpoint/subquery timing logs.
- Safer local diagnosis of slow plans via opt-in EXPLAIN.

## 5) Files Changed

- `apps/api/src/modules/reports/reports.controller.ts`
- `apps/api/src/modules/reports/reports.service.ts`
- `apps/api/src/modules/reports/reports.module.ts`
- `apps/api/src/common/env/env.schema.ts`
- `apps/api/.env.example`
- `apps/api/.env`
- `apps/api/drizzle/0004_report_query_indexes.sql`
- `docs/report-performance-audit.md`

