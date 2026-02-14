-- Report query performance indexes (safe/non-breaking)
-- Focus: common report filters and joins.

-- Required composite patterns where missing:
-- (company_id, branch_id, date)
create index if not exists shifts_company_branch_start_time_idx
  on shifts (company_id, branch_id, start_time);

create index if not exists deliveries_company_branch_expected_date_idx
  on deliveries (company_id, branch_id, expected_date);

-- (company_id, branch_id, created_at)
create index if not exists shifts_company_branch_created_at_idx
  on shifts (company_id, branch_id, created_at);

create index if not exists reconciliations_company_branch_created_at_idx
  on reconciliations (company_id, branch_id, created_at);

create index if not exists variances_company_branch_created_at_idx
  on variances (company_id, branch_id, created_at);

create index if not exists credit_invoices_company_branch_created_at_idx
  on credit_invoices (company_id, branch_id, created_at);

create index if not exists supplier_invoices_company_branch_created_at_idx
  on supplier_invoices (company_id, branch_id, created_at);

create index if not exists payments_company_branch_created_at_idx
  on payments (company_id, branch_id, created_at);

create index if not exists customers_company_branch_created_at_idx
  on customers (company_id, branch_id, created_at);

-- (branch_id, status, created_at)
create index if not exists shifts_branch_status_created_at_idx
  on shifts (branch_id, status, created_at);

create index if not exists customers_branch_status_created_at_idx
  on customers (branch_id, status, created_at);

-- Join/foreign-key index coverage for report joins where single-column
-- branch lookups are common and left-most composite keys do not help.
create index if not exists sales_transactions_branch_id_idx
  on sales_transactions (branch_id);

create index if not exists deliveries_branch_id_idx
  on deliveries (branch_id);

create index if not exists reconciliations_branch_id_idx
  on reconciliations (branch_id);

create index if not exists variances_branch_id_idx
  on variances (branch_id);

create index if not exists credit_invoices_branch_id_idx
  on credit_invoices (branch_id);

create index if not exists supplier_invoices_branch_id_idx
  on supplier_invoices (branch_id);

-- Partial index for frequently queried operational state.
create index if not exists shifts_open_branch_start_time_partial_idx
  on shifts (branch_id, start_time desc)
  where status = 'open' and deleted_at is null;

