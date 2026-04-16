# 021 — Phase 6: Production Hardening

**Date:** 2026-02-15  
**Scope:** Backend endpoint gaps, database indexing, data integrity, cache invalidation

---

## Overview

Phase 6 addressed remaining production-readiness gaps identified after the comprehensive gap recalibration audit. Several items originally flagged as "open" in `unimplemented_features.md` were already implemented during Phases 1–5; Phase 6 focused on the **true** remaining gaps.

---

## Changes

### 6A — Change-Password Endpoint (Auth)
- **Files:** `auth/dto/change-password.dto.ts`, `auth.service.ts`, `auth.controller.ts`
- `POST /auth/change-password` — authenticated users can update their own password
- Validates current password via `bcrypt.compare`, enforces strong password rules (min 8, upper/lower/digit/special)
- Protected by `JwtAuthGuard` + `@Throttle(5/min)`

### 6B — Deliveries PATCH Endpoint
- **Files:** `deliveries/dto/update-delivery.dto.ts`, `deliveries.service.ts`, `deliveries.controller.ts`
- `PATCH /deliveries/:id` — update a pending delivery before GRN receipt
- Guards against updating completed deliveries (`BadRequestException`)
- All fields optional: `deliveryNote`, `supplierId`, `vehicleNo`, `driverName`, `productId`, `orderedQty`, `expectedDate`
- Full audit log on update

### 6C — Compound Database Indexes (Migration 0011)
- **File:** `drizzle/0011_compound_indexes.sql`
- Added 6 `CREATE INDEX CONCURRENTLY` statements for common filter patterns:
  - `sales_transactions(company_id, status)`
  - `credit_invoices(customer_id, status)`
  - `supplier_invoices(supplier_id, status)`
  - `gov_approval_requests(requested_by, status)`
  - `stock_ledger(movement_type, movement_date)`
  - `expense_entries(category, created_at)`
- Added `CHECK` constraint on `stock_ledger.reference_type` limiting to known values: `delivery`, `transfer`, `adjustment`, `sale`, `void_reversal`

### 6D — Stock Ledger Orphan Prevention & Void Reversal
- **Files:** `schema/inventory/stock-ledger.ts`, `sales/sales.service.ts`
- Added `STOCK_LEDGER_MOVEMENT_VOID_REVERSAL` constant to schema
- When a sale is voided, the system now:
  1. Looks up original stock ledger entries for that sale
  2. Inserts reversal entries with positive quantity (re-stocking)
  3. Restores tank `currentLevel` via SQL atomic update
- Previously, voiding a sale only changed the transaction status without correcting inventory — this was a silent data integrity bug

### 6E — RecordPaymentForm Cache Invalidation Fix
- **File:** `components/forms/RecordPaymentForm.tsx`
- Added `queryClient.invalidateQueries({ queryKey: ['unpaid-invoices'] })` to the `onSuccess` handler
- Previously, recording a payment would not refresh the unpaid invoices list, causing stale data

### 6F — Notification Digest Scheduler (Already Implemented)
- Verified that `notification-digest.service.ts` already has full daily/weekly digest logic with cron jobs, user preference lookup, and email transport — registered in `notifications.module.ts`

---

## Files Modified/Created

| File | Action |
|------|--------|
| `apps/api/src/modules/auth/dto/change-password.dto.ts` | Created |
| `apps/api/src/modules/auth/auth.service.ts` | Modified |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified |
| `apps/api/src/modules/deliveries/dto/update-delivery.dto.ts` | Created |
| `apps/api/src/modules/deliveries/deliveries.service.ts` | Modified |
| `apps/api/src/modules/deliveries/deliveries.controller.ts` | Modified |
| `apps/api/drizzle/0011_compound_indexes.sql` | Created |
| `apps/api/src/database/schema/inventory/stock-ledger.ts` | Modified |
| `apps/api/src/modules/sales/sales.service.ts` | Modified |
| `components/forms/RecordPaymentForm.tsx` | Modified |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Void reversal stock entries | Medium — existing voided sales won't have retroactive reversals | Only applies to new voids; backfill script can be written if needed |
| `CONCURRENTLY` indexes | Low — non-blocking DDL | Standard PG practice for production migrations |
| `CHECK` constraint on `reference_type` | Low — only new inserts validated | Existing data must already have valid values |

---

## Remaining Gaps (for Phase 7+)

- PDF report templates with company branding
- Multi-language invoice PDF generation
- Advanced RBAC UI (drag-and-drop role builder)
- Mobile-responsive POS layout optimizations
- E2E Playwright test suite expansion
