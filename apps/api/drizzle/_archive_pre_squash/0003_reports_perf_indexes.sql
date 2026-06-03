-- Additional report-focused indexes
create index if not exists sales_transactions_branch_date_status_idx
  on sales_transactions (branch_id, transaction_date, status);

create index if not exists sale_items_product_sale_tx_idx
  on sale_items (product_id, sale_transaction_id);

create index if not exists credit_invoices_due_balance_idx
  on credit_invoices (due_date, balance_remaining);

create index if not exists supplier_invoices_due_balance_idx
  on supplier_invoices (due_date, balance_remaining);

create index if not exists reconciliations_branch_date_idx
  on reconciliations (branch_id, reconciliation_date);

create index if not exists variances_branch_date_tank_idx
  on variances (branch_id, variance_date, tank_id);

-- Optional materialized view: daily sales summary
create materialized view if not exists daily_sales_summary as
select
  st.company_id,
  b.station_id,
  st.branch_id,
  date_trunc('day', st.transaction_date)::date as day,
  sum(st.total_amount)::numeric(18,2) as sales_amount,
  sum(si.quantity)::numeric(18,3) as liters_sold
from sales_transactions st
join branches b on b.id = st.branch_id
left join sale_items si on si.sale_transaction_id = st.id
where st.deleted_at is null
group by st.company_id, b.station_id, st.branch_id, date_trunc('day', st.transaction_date)::date;

create index if not exists daily_sales_summary_scope_day_idx
  on daily_sales_summary (company_id, station_id, branch_id, day);

-- Optional materialized view: daily stock variance
create materialized view if not exists daily_stock_variance as
select
  v.company_id,
  b.station_id,
  v.branch_id,
  date_trunc('day', v.variance_date)::date as day,
  coalesce(sum(v.volume_variance), 0)::numeric(18,3) as volume_variance
from variances v
join branches b on b.id = v.branch_id
where v.deleted_at is null
group by v.company_id, b.station_id, v.branch_id, date_trunc('day', v.variance_date)::date;

create index if not exists daily_stock_variance_scope_day_idx
  on daily_stock_variance (company_id, station_id, branch_id, day);

-- Optional materialized view: daily margin summary
create materialized view if not exists daily_margin_summary as
select
  st.company_id,
  b.station_id,
  st.branch_id,
  date_trunc('day', st.transaction_date)::date as day,
  coalesce(sum(si.total_amount), 0)::numeric(18,2) as revenue,
  coalesce(sum(si.quantity * si.unit_price * 0.75), 0)::numeric(18,2) as estimated_cogs,
  coalesce(sum(si.total_amount - (si.quantity * si.unit_price * 0.75)), 0)::numeric(18,2) as gross_margin
from sales_transactions st
join branches b on b.id = st.branch_id
join sale_items si on si.sale_transaction_id = st.id
where st.deleted_at is null
group by st.company_id, b.station_id, st.branch_id, date_trunc('day', st.transaction_date)::date;

create index if not exists daily_margin_summary_scope_day_idx
  on daily_margin_summary (company_id, station_id, branch_id, day);

-- Refresh strategy:
-- Nightly job (recommended): REFRESH MATERIALIZED VIEW CONCURRENTLY <view_name>;
-- On-demand refresh (manual):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY daily_stock_variance;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY daily_margin_summary;
