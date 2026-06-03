-- Compound indexes for common filter patterns (aging reports, approval queues, status filtering)
CREATE INDEX IF NOT EXISTS "sales_transactions_company_status_idx"
  ON "sales_transactions" ("company_id", "status");

CREATE INDEX IF NOT EXISTS "credit_invoices_customer_status_idx"
  ON "credit_invoices" ("customer_id", "status");

CREATE INDEX IF NOT EXISTS "supplier_invoices_supplier_status_idx"
  ON "supplier_invoices" ("supplier_id", "status");

CREATE INDEX IF NOT EXISTS "gov_approval_requests_requested_by_status_idx"
  ON "gov_approval_requests" ("requested_by", "status");

CREATE INDEX IF NOT EXISTS "stock_ledger_movement_date_idx"
  ON "stock_ledger" ("movement_type", "movement_date");

CREATE INDEX IF NOT EXISTS "expense_entries_category_created_idx"
  ON "expense_entries" ("category", "created_at");

-- Stock ledger orphan prevention: restrict reference_type to known movement sources
ALTER TABLE "stock_ledger"
  DROP CONSTRAINT IF EXISTS "stock_ledger_reference_type_check";

ALTER TABLE "stock_ledger"
  ADD CONSTRAINT "stock_ledger_reference_type_check"
  CHECK ("reference_type" IN ('grn', 'grn_void', 'transfer', 'transfer_void', 'adjustment', 'sale', 'void_reversal')) NOT VALID;
