-- Audit priority 3: repair stock constraints and enforce clear data invariants.

-- Ledger rows represent deltas; sales, transfer-outs, and voids are valid negative quantities.
ALTER TABLE "stock_ledger"
  DROP CONSTRAINT IF EXISTS "chk_stock_ledger_quantity";

ALTER TABLE "stock_ledger"
  ADD CONSTRAINT "chk_stock_ledger_quantity"
  CHECK ("quantity" <> 0) NOT VALID;

-- Sales may drive the recorded tank level negative because fuel has already been dispensed.
ALTER TABLE "tanks"
  DROP CONSTRAINT IF EXISTS "chk_tanks_current_level";

-- Match current stock ledger service reference values.
ALTER TABLE "stock_ledger"
  DROP CONSTRAINT IF EXISTS "stock_ledger_reference_type_check";

ALTER TABLE "stock_ledger"
  ADD CONSTRAINT "stock_ledger_reference_type_check"
  CHECK ("reference_type" IN ('grn', 'grn_void', 'transfer', 'transfer_void', 'adjustment', 'sale', 'void_reversal')) NOT VALID;

-- The delivery service reads a single GRN by delivery_id and rejects receiving completed deliveries.
CREATE UNIQUE INDEX IF NOT EXISTS "grns_delivery_id_unique"
  ON "grns" ("delivery_id");
