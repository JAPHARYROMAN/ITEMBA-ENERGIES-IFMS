-- Materialized views for report acceleration (day-level partitioning by date).
-- Refresh via ReportsRefreshService (cron 02:10 or POST /admin/reports/refresh).

-- 1) Daily sales summary: date, company_id, station_id, branch_id, product_id, liters, revenue, gross_margin
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_sales_summary AS
SELECT
  (date_trunc('day', st.transaction_date) AT TIME ZONE 'UTC')::date AS report_date,
  st.company_id,
  b.station_id,
  st.branch_id,
  si.product_id,
  coalesce(sum(si.quantity), 0)::numeric(18,3) AS liters,
  coalesce(sum(si.total_amount), 0)::numeric(18,2) AS revenue,
  coalesce(sum(si.total_amount - si.quantity * si.unit_price * 0.75), 0)::numeric(18,2) AS gross_margin
FROM sales_transactions st
JOIN branches b ON b.id = st.branch_id
JOIN sale_items si ON si.sale_transaction_id = st.id
WHERE st.deleted_at IS NULL
  AND st.status = 'completed'
  AND si.deleted_at IS NULL
GROUP BY (date_trunc('day', st.transaction_date) AT TIME ZONE 'UTC')::date, st.company_id, b.station_id, st.branch_id, si.product_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_sales_summary_pkey
  ON mv_daily_sales_summary (report_date, company_id, station_id, branch_id, product_id);
CREATE INDEX IF NOT EXISTS mv_daily_sales_summary_date_idx ON mv_daily_sales_summary (report_date);
CREATE INDEX IF NOT EXISTS mv_daily_sales_summary_company_station_branch_idx
  ON mv_daily_sales_summary (company_id, station_id, branch_id);

-- 2) Daily stock variance: date, company_id, station_id, branch_id, tank_id, book_qty, physical_qty, variance_qty, variance_pct
-- book_qty/physical_qty not in source; we store variance only (incremental-friendly).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_stock_variance AS
SELECT
  (date_trunc('day', v.variance_date) AT TIME ZONE 'UTC')::date AS report_date,
  v.company_id,
  b.station_id,
  v.branch_id,
  v.tank_id,
  0::numeric(18,3) AS book_qty,
  0::numeric(18,3) AS physical_qty,
  coalesce(sum(v.volume_variance), 0)::numeric(18,3) AS variance_qty,
  CASE WHEN coalesce(sum(abs(v.volume_variance)), 0) = 0 THEN 0 ELSE 0 END::numeric(10,4) AS variance_pct
FROM variances v
JOIN branches b ON b.id = v.branch_id
WHERE v.deleted_at IS NULL
GROUP BY (date_trunc('day', v.variance_date) AT TIME ZONE 'UTC')::date, v.company_id, b.station_id, v.branch_id, v.tank_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_stock_variance_pkey
  ON mv_daily_stock_variance (report_date, company_id, station_id, branch_id, tank_id);
CREATE INDEX IF NOT EXISTS mv_daily_stock_variance_date_idx ON mv_daily_stock_variance (report_date);
CREATE INDEX IF NOT EXISTS mv_daily_stock_variance_company_station_branch_idx
  ON mv_daily_stock_variance (company_id, station_id, branch_id);

-- 3) Daily payment mix: date, company_id, station_id, branch_id, method, amount
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_payment_mix AS
SELECT
  (date_trunc('day', st.transaction_date) AT TIME ZONE 'UTC')::date AS report_date,
  st.company_id,
  b.station_id,
  st.branch_id,
  sp.payment_method AS method,
  coalesce(sum(sp.amount), 0)::numeric(18,2) AS amount
FROM sales_transactions st
JOIN branches b ON b.id = st.branch_id
JOIN sale_payments sp ON sp.sale_transaction_id = st.id
WHERE st.deleted_at IS NULL
  AND st.status = 'completed'
GROUP BY (date_trunc('day', st.transaction_date) AT TIME ZONE 'UTC')::date, st.company_id, b.station_id, st.branch_id, sp.payment_method;

CREATE UNIQUE INDEX IF NOT EXISTS mv_daily_payment_mix_pkey
  ON mv_daily_payment_mix (report_date, company_id, station_id, branch_id, method);
CREATE INDEX IF NOT EXISTS mv_daily_payment_mix_date_idx ON mv_daily_payment_mix (report_date);
CREATE INDEX IF NOT EXISTS mv_daily_payment_mix_company_station_branch_idx
  ON mv_daily_payment_mix (company_id, station_id, branch_id);

-- 4) AR aging snapshot (optional): snapshot_date, company_id, branch_id, bucket, amount
-- Snapshot reflects AR as of the day the MV is refreshed (application passes snapshot_date when querying).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_ar_aging_snapshot AS
SELECT
  (date_trunc('day', now()) AT TIME ZONE 'UTC')::date AS snapshot_date,
  ci.company_id,
  ci.branch_id,
  CASE
    WHEN ((date_trunc('day', now()) AT TIME ZONE 'UTC')::date - (ci.due_date AT TIME ZONE 'UTC')::date) <= 30 THEN '0-30 Days'
    WHEN ((date_trunc('day', now()) AT TIME ZONE 'UTC')::date - (ci.due_date AT TIME ZONE 'UTC')::date) <= 60 THEN '31-60 Days'
    WHEN ((date_trunc('day', now()) AT TIME ZONE 'UTC')::date - (ci.due_date AT TIME ZONE 'UTC')::date) <= 90 THEN '61-90 Days'
    ELSE '90+ Days'
  END AS bucket,
  coalesce(sum(ci.balance_remaining), 0)::numeric(18,2) AS amount
FROM credit_invoices ci
WHERE ci.deleted_at IS NULL
  AND ci.balance_remaining > 0
GROUP BY ci.company_id, ci.branch_id,
  CASE
    WHEN ((date_trunc('day', now()) AT TIME ZONE 'UTC')::date - (ci.due_date AT TIME ZONE 'UTC')::date) <= 30 THEN '0-30 Days'
    WHEN ((date_trunc('day', now()) AT TIME ZONE 'UTC')::date - (ci.due_date AT TIME ZONE 'UTC')::date) <= 60 THEN '31-60 Days'
    WHEN ((date_trunc('day', now()) AT TIME ZONE 'UTC')::date - (ci.due_date AT TIME ZONE 'UTC')::date) <= 90 THEN '61-90 Days'
    ELSE '90+ Days'
  END;

CREATE UNIQUE INDEX IF NOT EXISTS mv_ar_aging_snapshot_pkey
  ON mv_ar_aging_snapshot (snapshot_date, company_id, branch_id, bucket);
CREATE INDEX IF NOT EXISTS mv_ar_aging_snapshot_date_idx ON mv_ar_aging_snapshot (snapshot_date);
CREATE INDEX IF NOT EXISTS mv_ar_aging_snapshot_company_branch_idx
  ON mv_ar_aging_snapshot (company_id, branch_id);
