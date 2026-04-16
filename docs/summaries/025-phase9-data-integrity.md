# 025 — Phase 9: Data Integrity & Controller Correctness

## Overview

Phase 9 addresses critical data-integrity gaps, controller correctness issues, and missing endpoints discovered during a comprehensive gap audit.

## Changes

### 9A: Fix Notifications Controller Duplicate Decorators (CRITICAL)

**File:** `apps/api/src/modules/notifications/notifications.controller.ts`

- Removed duplicate `@ApiTags`, `@ApiBearerAuth`, and `@UseGuards` class decorators
- **Security fix:** The second `@UseGuards(JwtAuthGuard)` silently overrode the first `@UseGuards(JwtAuthGuard, PermissionsGuard)`, dropping `PermissionsGuard` from ALL notification endpoints
- Now a single `@UseGuards(JwtAuthGuard, PermissionsGuard)` correctly enforces permission checks

### 9B: Add ParseUUIDPipe to Notification deliveryId Params

**File:** `apps/api/src/modules/notifications/notifications.controller.ts`

- Added `ParseUUIDPipe` validation to 3 `deliveryId` params: `markSeen`, `markRead`, `archive`
- Prevents invalid UUIDs from reaching the database layer

### 9C: Nozzles FK Validation on Create

**File:** `apps/api/src/modules/setup/nozzles.service.ts`

- Added existence checks for `pumpId`, `tankId`, and `productId` before insert
- Returns clean 404 errors instead of raw database FK constraint violations (500)

### 9D: Dependency-Safe Deletes (6 Services)

Added child-record dependency checks before soft-delete to prevent orphaned references:

| Service | File | Child Check |
|---------|------|-------------|
| **Companies** | `modules/core/companies.service.ts` | Active `stations` → `BadRequestException` |
| **Branches** | `modules/core/branches.service.ts` | Active `tanks` or `customers` → `BadRequestException` |
| **Tanks** | `modules/setup/tanks.service.ts` | Active `nozzles` → `BadRequestException` |
| **Products** | `modules/setup/products.service.ts` | Active `tanks` (by `productId`) → `BadRequestException` |
| **Customers** | `modules/credit/customers.service.ts` | Active `creditInvoices` → `BadRequestException` |
| **Suppliers** | `modules/payables/suppliers.service.ts` | Active `supplierInvoices` → `BadRequestException` |

Pattern: `SELECT count(*) FROM child_table WHERE parent_id = :id AND deleted_at IS NULL` → if > 0, throw `BadRequestException` with count.

### 9E: DELETE Expense Entries Endpoint

**Files:** `modules/expenses/expenses.service.ts`, `modules/expenses/expenses.controller.ts`

- New service method `deleteExpenseEntry()` — only allows deletion of `draft` or `rejected` entries
- New controller endpoint `DELETE /expense-entries/:id` → 204 No Content
- Follows existing `deleteExpenseCategory` pattern with audit logging

### 9F: Expose Supplier Payment Void Endpoint

**File:** `modules/payables/supplier-payments.controller.ts`

- New endpoint `POST /supplier-payments/:id/void` → calls existing `voidPayment()` service method
- The service method was fully implemented but had no controller route (dead code)
- Reverses invoice allocations, restores `balanceRemaining`, and soft-deletes the payment

### 9G: Credit Payment Void Endpoint

**Files:** `modules/credit/payments.service.ts`, `modules/credit/payments.controller.ts`

- New service method `voidPayment()` — mirrors the supplier-payments pattern
  - Reverses each allocation (restores `balanceRemaining` on credit invoices)
  - Restores customer balance
  - Soft-deletes the payment
  - All within a single transaction with audit logging
- New controller endpoint `POST /payments/:id/void`

## Files Modified (14 total)

1. `apps/api/src/modules/notifications/notifications.controller.ts` — decorator fix + ParseUUIDPipe
2. `apps/api/src/modules/setup/nozzles.service.ts` — FK validation on create
3. `apps/api/src/modules/core/companies.service.ts` — dependency-safe delete
4. `apps/api/src/modules/core/branches.service.ts` — dependency-safe delete (tanks + customers)
5. `apps/api/src/modules/setup/tanks.service.ts` — dependency-safe delete
6. `apps/api/src/modules/setup/products.service.ts` — dependency-safe delete
7. `apps/api/src/modules/credit/customers.service.ts` — dependency-safe delete
8. `apps/api/src/modules/payables/suppliers.service.ts` — dependency-safe delete
9. `apps/api/src/modules/expenses/expenses.service.ts` — deleteExpenseEntry method
10. `apps/api/src/modules/expenses/expenses.controller.ts` — DELETE endpoint
11. `apps/api/src/modules/payables/supplier-payments.controller.ts` — void endpoint
12. `apps/api/src/modules/credit/payments.service.ts` — voidPayment method
13. `apps/api/src/modules/credit/payments.controller.ts` — void endpoint

## Compile Status

All 14 files: **0 errors**

## New Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `DELETE` | `/expense-entries/:id` | Soft-delete draft/rejected expense entry |
| `POST` | `/supplier-payments/:id/void` | Void supplier payment + reverse allocations |
| `POST` | `/payments/:id/void` | Void credit payment + reverse allocations + restore balance |
