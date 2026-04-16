# 018 — Phase 3: MEDIUM Priority Audit Fixes

**Date:** 2026-04-16  
**Scope:** MEDIUM-priority findings from enterprise audit (Phase 3)  
**Impact:** Input validation, query parameter safety, observability  

---

## Problem

17 controller endpoints used TypeScript intersection types (`ListQueryDto & { ... }`) for `@Query()` parameters. NestJS's `ValidationPipe` resolves the runtime metatype of intersection types as `Object`, which means:
- **No validation** was applied to the extra filter fields (status, customerId, etc.)
- **`whitelist: true`** could not strip unknown properties since no class metadata existed
- Arbitrary query parameters could pass through unvalidated

Additionally, the exports worker had a silent `.catch(() => {})` that swallowed errors without logging.

## Solution

### 1. Extended `ListQueryDto` with Common Filter Fields

**File:** `apps/api/src/common/dto/list-query.dto.ts`

Added 4 new optional fields with proper validators:

| Field | Validator | Used By |
|-------|-----------|---------|
| `status` | `@MaxLength(50)` | shifts, sales, expenses, deliveries, customers, suppliers, credit-invoices, supplier-invoices, reconciliations |
| `customerId` | `@IsUUID()` | payments, credit-invoices |
| `supplierId` | `@IsUUID()` | supplier-invoices, supplier-payments |
| `tankId` | `@IsUUID()` | dips, adjustments, variances |

All fields are `@IsOptional()` with `@ApiPropertyOptional()` for Swagger documentation.

### 2. Created Module-Specific DTOs (3 new files)

For fields unique to specific modules, created proper DTO classes extending `ListQueryDto`:

| DTO | File | Extra Fields |
|-----|------|-------------|
| `AuditListQueryDto` | `modules/audit/dto/audit-list-query.dto.ts` | `entity`, `action` (@MaxLength(100)), `actorUserId` (@IsUUID) |
| `TransfersListQueryDto` | `modules/transfers/dto/transfers-list-query.dto.ts` | `transferType` (@MaxLength(50)) |
| `InventoryMovementsListQueryDto` | `modules/inventory/dto/inventory-movements-list-query.dto.ts` | `classification` (@MaxLength(50)) |

### 3. Updated 13 Controllers (17 endpoints)

Replaced all intersection types with proper DTO classes:

| Controller | Endpoints | New Type |
|-----------|-----------|----------|
| `payments.controller.ts` | 1 | `ListQueryDto` |
| `credit-invoices.controller.ts` | 1 | `ListQueryDto` |
| `supplier-invoices.controller.ts` | 1 | `ListQueryDto` |
| `supplier-payments.controller.ts` | 1 | `ListQueryDto` |
| `shifts.controller.ts` | 1 | `ListQueryDto` |
| `sales.controller.ts` | 1 | `ListQueryDto` |
| `expenses.controller.ts` | 2 | `ListQueryDto` |
| `deliveries.controller.ts` | 1 | `ListQueryDto` |
| `customers.controller.ts` | 1 | `ListQueryDto` |
| `adjustments.controller.ts` | 1 | `ListQueryDto` |
| `suppliers.controller.ts` | 1 | `ListQueryDto` |
| `transfers.controller.ts` | 1 | `TransfersListQueryDto` |
| `inventory.controller.ts` | 3 | `ListQueryDto` (2), `InventoryMovementsListQueryDto` (1) |
| `audit.controller.ts` | 1 | `AuditListQueryDto` |

Also removed 4 unused interface imports (`DeliveriesListParams`, `CustomersListParams`, `AdjustmentsListParams`, `SuppliersListParams`, `TransfersListParams`).

### 4. Fixed Silent Error Catch in Exports Worker

**File:** `apps/api/src/modules/exports/exports.worker.ts`
- Added `Logger` instance
- Replaced `catch(() => {})` with `catch((err) => this.logger.warn(...))`
- Errors in the polling loop are now visible in application logs

---

## Files Changed (17 files)

| Category | Files |
|----------|-------|
| **Shared DTO** | `common/dto/list-query.dto.ts` |
| **New DTOs** | `audit/dto/audit-list-query.dto.ts`, `transfers/dto/transfers-list-query.dto.ts`, `inventory/dto/inventory-movements-list-query.dto.ts` |
| **Controllers** | payments, credit-invoices, supplier-invoices, supplier-payments, shifts, sales, expenses, deliveries, customers, adjustments, suppliers, transfers, inventory, audit (13 files) |
| **Worker** | `exports/exports.worker.ts` |

---

## Validation Behavior (Before → After)

| Query Parameter | Before | After |
|----------------|--------|-------|
| `?status=active` | Passed through unvalidated | Validated: `@MaxLength(50)` |
| `?customerId=not-a-uuid` | Passed through | Rejected: 400 Bad Request |
| `?tankId=<script>` | Passed through | Rejected: 400 Bad Request |
| `?unknownField=x` | Passed through | Stripped by `whitelist: true` |
| `?classification=abc` (on variances) | Passed through unvalidated | Validated: `@MaxLength(50)` |

---

## Remaining (Phase 4 — LOW)

- Per-user rate limiting (currently per-IP only)
- Integration test coverage expansion
- Swagger response schema annotations
