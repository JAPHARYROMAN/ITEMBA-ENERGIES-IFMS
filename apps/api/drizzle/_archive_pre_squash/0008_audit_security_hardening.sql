-- 0008_audit_security_hardening.sql
-- Phase 1 critical fixes: CHECK constraints, companyId columns, audit_log immutability
-- Date: 2026-04-16

-- ============================================================================
-- 1. CHECK CONSTRAINTS ON FINANCIAL AMOUNTS (>= 0)
-- ============================================================================

-- Sales
ALTER TABLE sales_transactions ADD CONSTRAINT chk_sales_total_amount CHECK (total_amount >= 0);
ALTER TABLE sales_transactions ADD CONSTRAINT chk_sales_discount_amount CHECK (discount_amount >= 0);
ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_quantity CHECK (quantity > 0);
ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_unit_price CHECK (unit_price >= 0);
ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_tax_amount CHECK (tax_amount >= 0);
ALTER TABLE sale_items ADD CONSTRAINT chk_sale_items_total_amount CHECK (total_amount >= 0);
ALTER TABLE receipts ADD CONSTRAINT chk_receipts_total_amount CHECK (total_amount >= 0);

-- Credit
ALTER TABLE credit_invoices ADD CONSTRAINT chk_invoices_total_amount CHECK (total_amount >= 0);
ALTER TABLE credit_invoices ADD CONSTRAINT chk_invoices_balance_remaining CHECK (balance_remaining >= 0);
ALTER TABLE customers ADD CONSTRAINT chk_customers_credit_limit CHECK (credit_limit >= 0);
ALTER TABLE invoice_items ADD CONSTRAINT chk_invoice_items_quantity CHECK (quantity > 0);
ALTER TABLE invoice_items ADD CONSTRAINT chk_invoice_items_unit_price CHECK (unit_price >= 0);
ALTER TABLE invoice_items ADD CONSTRAINT chk_invoice_items_tax CHECK (tax >= 0);
ALTER TABLE invoice_items ADD CONSTRAINT chk_invoice_items_total CHECK (total >= 0);
ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount > 0);
ALTER TABLE payment_allocations ADD CONSTRAINT chk_payment_alloc_amount CHECK (amount > 0);

-- Expenses
ALTER TABLE expense_entries ADD CONSTRAINT chk_expense_amount CHECK (amount > 0);

-- Payables
ALTER TABLE supplier_invoices ADD CONSTRAINT chk_sup_inv_total_amount CHECK (total_amount >= 0);
ALTER TABLE supplier_invoices ADD CONSTRAINT chk_sup_inv_balance_remaining CHECK (balance_remaining >= 0);
ALTER TABLE supplier_payments ADD CONSTRAINT chk_sup_payments_amount CHECK (amount > 0);
ALTER TABLE supplier_payment_allocations ADD CONSTRAINT chk_sup_payment_alloc_amount CHECK (amount > 0);

-- Operations
ALTER TABLE shift_collections ADD CONSTRAINT chk_shift_collections_amount CHECK (amount >= 0);
ALTER TABLE meter_readings ADD CONSTRAINT chk_meter_value CHECK (value >= 0);
ALTER TABLE meter_readings ADD CONSTRAINT chk_meter_price_per_unit CHECK (price_per_unit >= 0);

-- Deliveries
ALTER TABLE deliveries ADD CONSTRAINT chk_deliveries_ordered_qty CHECK (ordered_qty > 0);
ALTER TABLE deliveries ADD CONSTRAINT chk_deliveries_received_qty CHECK (received_qty >= 0);
ALTER TABLE grns ADD CONSTRAINT chk_grns_received_qty CHECK (received_qty > 0);
ALTER TABLE grn_allocations ADD CONSTRAINT chk_grn_alloc_quantity CHECK (quantity > 0);

-- Setup
ALTER TABLE products ADD CONSTRAINT chk_products_price_per_unit CHECK (price_per_unit >= 0);
ALTER TABLE tanks ADD CONSTRAINT chk_tanks_capacity CHECK (capacity > 0);

-- Inventory
ALTER TABLE stock_ledger ADD CONSTRAINT chk_stock_ledger_quantity CHECK (quantity <> 0) NOT VALID;
ALTER TABLE tank_dips ADD CONSTRAINT chk_tank_dips_volume CHECK (volume >= 0);

-- Transfers
ALTER TABLE transfers ADD CONSTRAINT chk_transfers_quantity CHECK (quantity > 0);

-- ============================================================================
-- 2. ADD companyId TO branches (denormalized for direct tenant queries)
-- ============================================================================

ALTER TABLE branches ADD COLUMN company_id UUID;

-- Backfill from stations
UPDATE branches SET company_id = s.company_id
FROM stations s WHERE branches.station_id = s.id;

-- Now make it NOT NULL and add FK
ALTER TABLE branches ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE branches ADD CONSTRAINT branches_company_id_fk
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
CREATE INDEX branches_company_id_idx ON branches (company_id);

-- ============================================================================
-- 3. ADD companyId TO audit_log (for per-tenant audit queries)
-- ============================================================================

ALTER TABLE audit_log ADD COLUMN company_id UUID;
CREATE INDEX audit_log_company_id_idx ON audit_log (company_id);

-- ============================================================================
-- 4. MAKE audit_log IMMUTABLE (INSERT-only)
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable — UPDATE and DELETE are not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable_trigger
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ============================================================================
-- 5. PROTECT actorUserId — change from SET NULL to RESTRICT
-- ============================================================================

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_users_id_fk;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_user_id_fk
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT;
