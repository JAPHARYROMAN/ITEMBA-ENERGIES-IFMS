# 019 — Phase 4: LOW-Priority Audit Fixes

**Date:** 2025-01-20
**Phase:** 4 of 4 (LOW priority)
**Files Modified:** 8
**Scope:** Type safety improvements, structured logging, DTO hardening

---

## Changes

### 1. Replace `console.error` → NestJS `Logger` (4 occurrences)

| File | Line(s) | Change |
|------|---------|--------|
| `governance.service.ts` | 424, 556 | `console.error` → `this.logger.error` (Logger already existed) |
| `inventory.service.ts` | 299 | Added `Logger` import + instance; `console.error` → `this.logger.error` |
| `shifts.service.ts` | 529 | Added `Logger` import + instance; `console.error` → `this.logger.error` |

**Why:** `console.error` bypasses NestJS structured logging, making production log aggregation, filtering, and correlation impossible. NestJS `Logger` integrates with the framework's log pipeline and adds class context automatically.

Also removed unused `InternalServerErrorException` import from `inventory.service.ts`.

---

### 2. Type `ListResponse<unknown>` → Proper Entity Types (3 controllers)

| Controller | Old | New |
|-----------|-----|-----|
| `credit-invoices.controller.ts` | `ListResponse<unknown>` | `ListResponse<CreditInvoiceListItem>` |
| `supplier-invoices.controller.ts` | `ListResponse<unknown>` | `ListResponse<SupplierInvoiceItem>` |
| `supplier-payments.controller.ts` | `ListResponse<unknown>` | `ListResponse<SupplierPaymentItem>` |

**Why:** `unknown` return types defeat the purpose of TypeScript's type system and make Swagger docs useless for consumers.

---

### 3. Type 9 `any` Params in `notification-triggers.service.ts`

Created **9 exported interfaces** to replace all `any` method parameters:

| Interface | Used By |
|-----------|---------|
| `ApprovalRequestDetails` | `notifyApprovalRequestCreated()` |
| `ApprovalDecisionDetails` | `notifyApprovalApproved()`, `notifyApprovalRejected()` |
| `ShrinkageVarianceDetails` | `notifyShrinkageVariance()` |
| `SuddenLevelDropDetails` | `notifySuddenLevelDrop()` |
| `LowStockDetails` | `notifyLowStock()` |
| `InvoiceOverdueDetails` | `notifyInvoiceOverdue()` |
| `PayableDueDetails` | `notifyPayableDue()` |
| `ShiftVarianceDetails` | `notifyShiftVariance()` |

**Why:** `any` params disable all compile-time checks. Callers could pass arbitrary objects without error. Now callers must provide the exact shape each notification method needs.

---

### 4. Type `recipients!: any` in `CreateNotificationDto`

- Created `NotificationRecipientsDto` class with `@ValidateNested()` + `@Type()` decorators
- Fields: `userIds?: string[]` (`@IsUUID` each), `roles?: ('Manager'|'Cashier'|'Auditor')[]` (`@IsEnum` each), `branchMembership?: boolean`
- DTO now validates the nested recipients object at runtime via class-validator

**Why:** `any` on a DTO field means the validation pipeline accepts literally anything for `recipients`, including injection payloads. Now it's structurally validated.

---

### 5. Type `getApproversForSteps(steps: any[])` in `governance.service.ts`

Changed parameter type from `any[]` → `Record<string, unknown>[]` to match the JSONB column source.

---

## Files Modified

1. `apps/api/src/modules/governance/governance.service.ts` — Logger usage + typed method
2. `apps/api/src/modules/inventory/inventory.service.ts` — Added Logger, removed unused import
3. `apps/api/src/modules/shifts/shifts.service.ts` — Added Logger
4. `apps/api/src/modules/notifications/notification-triggers.service.ts` — 9 interfaces, 9 typed params
5. `apps/api/src/modules/notifications/dto/notifications.dto.ts` — `NotificationRecipientsDto` class
6. `apps/api/src/modules/credit/credit-invoices.controller.ts` — Typed return
7. `apps/api/src/modules/payables/supplier-invoices.controller.ts` — Typed return
8. `apps/api/src/modules/payables/supplier-payments.controller.ts` — Typed return

## Verification

All 8 files + 3 caller files pass `get_errors` with zero diagnostics.

## Audit Phase Summary

| Phase | Priority | Fixes | Doc |
|-------|----------|-------|-----|
| 1 | CRITICAL | 13 | 016 |
| 2 | HIGH | 7 | 017 |
| 3 | MEDIUM | 17 endpoints + 1 worker | 018 |
| **4** | **LOW** | **4 logger + 3 typed returns + 9 typed params + 1 DTO + 1 method** | **019** |

**All 4 audit phases are now complete.**
