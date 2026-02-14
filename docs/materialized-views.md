# Report materialized views

This document describes the materialized views used to accelerate report endpoints, their schemas, refresh strategy, and operational notes.

## View schemas

All views are **day-level partitioned by date** (report_date or snapshot_date) and are incremental-friendly for future partial refresh by date range.

### mv_daily_sales_summary

Daily sales aggregates by company, station, branch, and product.

| Column       | Type         | Description                          |
| ------------ | ------------ | ------------------------------------ |
| report_date  | date         | Day (UTC)                             |
| company_id   | uuid         | Company                               |
| station_id   | uuid         | Station (via branch)                  |
| branch_id    | uuid         | Branch                                |
| product_id   | uuid         | Product                               |
| liters       | numeric(18,3)| Sum of quantity sold                 |
| revenue      | numeric(18,2)| Sum of total_amount                  |
| gross_margin | numeric(18,2)| revenue − (quantity × unit_price × 0.75) |

**Source:** `sales_transactions` (completed, not deleted) + `sale_items` + `branches`.

---

### mv_daily_stock_variance

Daily variance aggregates by company, station, branch, and tank. Book/physical columns are placeholders (0); variance is the stored measure.

| Column       | Type         | Description                |
| ------------ | ------------ | -------------------------- |
| report_date  | date         | Day (UTC)                   |
| company_id   | uuid         | Company                     |
| station_id   | uuid         | Station (via branch)        |
| branch_id    | uuid         | Branch                      |
| tank_id      | uuid         | Tank (nullable)             |
| book_qty     | numeric(18,3)| Placeholder 0               |
| physical_qty | numeric(18,3)| Placeholder 0              |
| variance_qty | numeric(18,3)| Sum of volume_variance     |
| variance_pct | numeric(10,4)| Placeholder 0              |

**Source:** `variances` + `branches`.

---

### mv_daily_payment_mix

Daily payment method totals by company, station, and branch.

| Column      | Type         | Description        |
| ----------- | ------------ | ------------------ |
| report_date | date         | Day (UTC)          |
| company_id  | uuid         | Company            |
| station_id  | uuid         | Station (via branch) |
| branch_id   | uuid         | Branch             |
| method      | varchar(32) | payment_method     |
| amount      | numeric(18,2)| Sum of amount      |

**Source:** `sales_transactions` (completed, not deleted) + `sale_payments` + `branches`.

---

### mv_ar_aging_snapshot (optional)

Point-in-time AR aging by company, branch, and bucket. Snapshot date is the date when the MV is refreshed.

| Column        | Type         | Description      |
| ------------- | ------------ | ---------------- |
| snapshot_date | date         | Refresh date     |
| company_id    | uuid         | Company          |
| branch_id     | uuid         | Branch           |
| bucket        | varchar      | 0-30 / 31-60 / 61-90 / 90+ Days |
| amount        | numeric(18,2)| Sum balance_remaining |

**Source:** `credit_invoices` (not deleted, balance_remaining &gt; 0), bucketed by due date vs snapshot date.

---

## Indexes

Each view has:

- A **unique** index on the natural key (for `REFRESH MATERIALIZED VIEW CONCURRENTLY`).
- An index on the date column (report_date or snapshot_date).
- A composite index on (company_id, station_id, branch_id) where applicable.

See migration `apps/api/drizzle/0005_materialized_views.sql` for exact names and definitions.

---

## Refresh strategy

- **Schedule:** Nightly at **02:10** local time. Timezone is taken from `REPORTS_REFRESH_TZ` or `TZ` (default `UTC`).
- **Manual:** `POST /api/admin/reports/refresh` (Manager only, permission `reports:refresh`). Optional body: `dateFrom`, `dateTo` (reserved for future incremental refresh; currently a full refresh is performed).
- **Concurrency:** A single advisory lock (PostgreSQL `pg_try_advisory_lock`) ensures only one refresh runs at a time. If the lock cannot be acquired, the manual endpoint returns `skipped: "Another refresh is in progress"`; the scheduled job logs and exits.

Refresh order: `mv_daily_sales_summary` → `mv_daily_stock_variance` → `mv_daily_payment_mix` → `mv_ar_aging_snapshot`. Each view is refreshed with `REFRESH MATERIALIZED VIEW CONCURRENTLY` when possible; on failure (e.g. missing unique index), the service falls back to `REFRESH MATERIALIZED VIEW` (blocking).

---

## Operational notes

- **Locks:** Advisory lock ID `8838383838` is used. No other component should use this lock for long-running work. Lock is released in a `finally` block (and on unlock failure we only log and release the client).
- **Runtime:** Full refresh of all four views typically takes on the order of tens of seconds to a few minutes depending on data volume. Run manual refresh during low traffic if possible.
- **Reports behavior:** Endpoints prefer materialized views when the request has a date range (`dateFrom` + `dateTo`) and the view returns data; otherwise they fall back to transactional (raw) aggregation. Response shape is unchanged. Whether each section used **views** or **raw** is logged in the `reports.timing` log under `dataSource`.
- **Transactional queries:** Existing transactional report queries are **not removed** until views are proven correct; the code path chooses views first and falls back to raw.

---

## Migration

- **File:** `apps/api/drizzle/0005_materialized_views.sql`
- **Apply:** With the rest of the Drizzle migrations (e.g. `RUN_MIGRATIONS_ON_STARTUP=true` or `npm run db:migrate` from `apps/api`). Ensure migrations have run before relying on report acceleration or the refresh job.
