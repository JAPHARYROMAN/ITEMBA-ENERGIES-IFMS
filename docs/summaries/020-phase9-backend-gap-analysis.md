# 020 — Phase 9 Backend Gap Analysis

**Date:** 2025-04-16
**Scope:** `apps/api/src/` — NestJS backend only
**Method:** Systematic file-by-file audit of all controllers, services, DTOs, and tests

---

## Executive Summary

After Phases 1–8, the API is in strong shape. The remaining gaps fall into five categories:

| Priority | Count | Category |
|----------|-------|----------|
| HIGH     | 6     | Missing CRUD ops, FK validation, dependency-safe deletes |
| MEDIUM   | 8     | Missing void/delete endpoints, test coverage, minor validation |
| LOW      | 5     | Notification param validation, convenience endpoints |

---

## 1. Missing CRUD Operations

### HIGH — Expense entries have no DELETE endpoint
- **File:** `src/modules/expenses/expenses.controller.ts`
- **What's missing:** `expense-entries/:id` has GET, POST, PATCH, submit, approve, reject — but no DELETE or void. A draft/rejected entry cannot be deleted by the user.
- **Service:** `expenses.service.ts` has no `deleteExpenseEntry()` method.
- **Impact:** Users cannot discard unwanted draft expense entries.

### MEDIUM — Credit payments have no void/reverse endpoint
- **File:** `src/modules/credit/payments.controller.ts`
- **What's missing:** Only GET (list, getById) and POST (create). No PATCH or DELETE to void/reverse an incorrectly recorded payment.
- **Impact:** Payment errors require manual DB intervention.

### MEDIUM — Supplier payments have no void/reverse endpoint
- **File:** `src/modules/payables/supplier-payments.controller.ts`
- **What's missing:** Only GET (list, getById) and POST (create). No PATCH or DELETE to void/reverse an incorrectly recorded payment.
- **Impact:** Same as credit payments — no self-service correction.

### MEDIUM — Adjustments have no void/delete endpoint
- **File:** `src/modules/transfers/adjustments.controller.ts`
- **What's missing:** Only GET (list, getById) and POST (create). No way to void an erroneous stock adjustment.
- **Impact:** Incorrect adjustments permanently affect tank levels.

---

## 2. Missing Service-Layer Validation

### HIGH — NozzlesService.create() does not validate FK references
- **File:** `src/modules/setup/nozzles.service.ts` (lines 53–65)
- **What's missing:** `create()` accepts `stationId`, `pumpId`, `tankId`, `productId` but only checks code uniqueness. It does NOT verify that:
  - `stationId` references an existing, active station
  - `pumpId` references an existing, active pump belonging to that station
  - `tankId` references an existing, active tank
  - `productId` references an existing, active product
- **Impact:** Inserting with bogus UUIDs will either get an opaque FK constraint error (500) or silently succeed if FK constraints aren't in the schema.

### HIGH — PumpsService.create() does not validate stationId FK
- **File:** `src/modules/setup/pumps.service.ts` (lines 57–70)
- **What's missing:** `create()` accepts `stationId` but only checks code uniqueness within the station. Does not verify `stationId` exists.
- **Impact:** Same as nozzles — opaque 500 instead of 404.

### HIGH — BranchesService.create() does not validate stationId FK
- **File:** `src/modules/core/branches.service.ts` (lines 100–135)
- **What's missing:** `create()` accepts `stationId` but only checks code uniqueness. Does not verify the station exists.
- **Impact:** Same pattern — opaque DB error on invalid reference.

### HIGH — StationsService.create() does not validate companyId FK
- **File:** `src/modules/core/stations.service.ts` (lines 100–140)
- **What's missing:** `create()` accepts `companyId` but only checks code uniqueness. Does not verify the company exists.
- **Impact:** Same pattern.

### MEDIUM — NozzlesService.update() does not validate FK references when changing pumpId/tankId/productId
- **File:** `src/modules/setup/nozzles.service.ts` (lines 68–88)
- **What's missing:** `update()` allows changing `pumpId`, `tankId`, `productId` without verifying the new references exist.

---

## 3. Missing Dependency-Safe Deletes

### HIGH — All soft-delete services lack dependency checks
The following `remove()` methods perform a blind soft-delete without checking if child records depend on the entity:

| Service File | Entity | Missing Check |
|---|---|---|
| `core/companies.service.ts:193` | Company | Should check for active stations |
| `core/stations.service.ts:199` | Station | Should check for active branches |
| `core/branches.service.ts:188` | Branch | Should check for active shifts, tanks, deliveries |
| `setup/products.service.ts:240` | Product | Should check for nozzles, tank assignments, sale lines |
| `setup/tanks.service.ts:262` | Tank | Should check for active nozzles, pending dips, inventory |
| `setup/pumps.service.ts:94` | Pump | Should check for active nozzles |
| `payables/suppliers.service.ts:230` | Supplier | Should check for unpaid invoices |
| `credit/customers.service.ts:292` | Customer | Should check for unpaid invoices |

- **Impact:** Deleting a company with active stations silently orphans the stations. Deleting a tank with open inventory creates broken references.
- **Priority:** HIGH for companies/stations/branches (hierarchical), MEDIUM for leaf entities.

---

## 4. Missing DTO Validation

### LOW — UpdatePolicyDto has no class-validator decorators
- **File:** `src/modules/governance/dto/update-policy.dto.ts`
- **What's missing:** Uses `PartialType(CreatePolicyDto)` from `@nestjs/swagger`. Since `CreatePolicyDto` has validators and `PartialType` from Swagger copies them, this technically works at runtime if the `ValidationPipe` is configured with `transform: true`. However, best practice is to use `PartialType` from `@nestjs/mapped-types` to ensure validators carry over properly.
- **Impact:** Low — likely works, but a subtle correctness issue.

---

## 5. Test Coverage Gaps

### MEDIUM — 10 modules have zero unit test files

| Module | Service Files | Test Files |
|---|---|---|
| `auth/` | auth.service.ts, token-cleanup.service.ts | 0 |
| `credit/` | credit-invoices.service.ts, customers.service.ts, payments.service.ts, credit-aging.service.ts, credit-statement.service.ts | 0 |
| `payables/` | supplier-invoices.service.ts, supplier-payments.service.ts, suppliers.service.ts, payables-aging.service.ts, supplier-statement.service.ts | 0 |
| `transfers/` | transfers.service.ts, adjustments.service.ts | 0 |
| `inventory/` | inventory.service.ts | 0 |
| `setup/` | products.service.ts, tanks.service.ts, pumps.service.ts, nozzles.service.ts | 0 |
| `core/` | branches.service.ts, stations.service.ts | 0 (only companies.service.spec.ts exists) |
| `exports/` | exports.service.ts, exports.renderer.service.ts, exports.compliance.service.ts | 0 |
| `reports/` | reports.service.ts, reports-facade.service.ts, reports-mv.service.ts, reports-refresh.service.ts | 0 |
| `ai/` | ai.service.ts, ai-chat.service.ts | 0 |

**Existing test files (9 total):**
- `companies.service.spec.ts`, `deliveries.service.spec.ts`, `expenses.governance.spec.ts`, `governance.service.spec.ts`, `policy-evaluator.service.spec.ts`, `notifications.service.spec.ts`, `sales.governance.spec.ts`, `sales.service.spec.ts`, `shifts.service.spec.ts`

**E2E tests (3):** `auth-flow.e2e-spec.ts`, `reports-overview.e2e-spec.ts`, `shifts-transaction.e2e-spec.ts`

- **Impact:** High-value business logic in credit, payables, transfers, and inventory has no automated test coverage.
- **Priority:** MEDIUM overall, but HIGH for credit-invoices (payment allocation logic) and transfers (stock movement reversals).

---

## 6. Notification Controller — Missing ParseUUIDPipe

### LOW — `deliveryId` params not validated as UUID
- **File:** `src/modules/notifications/notifications.controller.ts`
- **What's missing:** The `markSeen`, `markRead`, and `archive` endpoints use `@Param('deliveryId') deliveryId: string` without `ParseUUIDPipe`. This allows non-UUID strings to reach the service layer.
- **Impact:** Low — will likely fail at DB query but with less clear error messages.

---

## 7. Controller Duplicate Decorator

### LOW — Duplicate `@ApiTags` and `@ApiBearerAuth` on NotificationsController
- **File:** `src/modules/notifications/notifications.controller.ts` (lines 29–33)
- **What's missing:** The controller has both class-level and duplicate decorators:
  ```ts
  @ApiTags('notifications')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Controller('notifications')
  @ApiTags('notifications')       // duplicate
  @ApiBearerAuth()                 // duplicate
  @UseGuards(JwtAuthGuard)         // duplicate (weaker — missing PermissionsGuard)
  ```
- **Impact:** Cosmetic, but the second `@UseGuards(JwtAuthGuard)` is a weaker guard set that could cause confusion.

---

## Prioritized Action Plan

### Phase 9A — HIGH Priority (6 items)
1. Add FK validation to `nozzles.service.ts create()` — validate stationId, pumpId, tankId, productId
2. Add FK validation to `pumps.service.ts create()` — validate stationId
3. Add FK validation to `branches.service.ts create()` — validate stationId
4. Add FK validation to `stations.service.ts create()` — validate companyId
5. Add dependency checks to `companies/stations/branches remove()` methods
6. Add DELETE endpoint for expense entries (draft/rejected only)

### Phase 9B — MEDIUM Priority (8 items)
7. Add void/reverse for credit payments (controller + service)
8. Add void/reverse for supplier payments (controller + service)
9. Add void/delete for adjustments (controller + service)
10. Add FK validation to `nozzles.service.ts update()` when changing references
11. Add dependency checks to leaf-entity `remove()` methods (pumps, tanks, products, suppliers, customers)
12. Add unit tests for credit-invoices.service.ts (payment allocation logic)
13. Add unit tests for transfers.service.ts (stock movement + reversal)
14. Add unit tests for inventory.service.ts (dip + reconciliation)

### Phase 9C — LOW Priority (5 items)
15. Add `ParseUUIDPipe` to notification controller `deliveryId` params
16. Remove duplicate decorators from `NotificationsController`
17. Switch `UpdatePolicyDto` to use `PartialType` from `@nestjs/mapped-types`
18. Add unit tests for auth, payables, and remaining modules
19. Add unit tests for setup services (products, tanks, pumps, nozzles)
