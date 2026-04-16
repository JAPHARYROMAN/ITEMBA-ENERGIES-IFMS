# 026 — Phase 10 Gap Audit: NestJS API Comprehensive Findings

**Date:** 2025-04-16  
**Scope:** Full audit of `apps/api/` — build errors, DTO validation, type safety, error handling, module registration, security guards  
**Total Findings:** 27 build errors across 9 files + 10 code-quality issues  

---

## 1. BUILD ERRORS — 27 TypeScript errors (current `tsc --noEmit`)

### 1A. CRITICAL — `transfers.service.ts` (6 errors)

| Line | Error | Root Cause |
|------|-------|------------|
| 231 | `eq(branches.id, fromTankRow.branchId)` — no overload matches | `fromTankRow` is `Record<string, unknown>`, so `.branchId` is `unknown` |
| 236 | Same pattern with `toTankRow.branchId` | Same root cause |
| 244 | `{ stationId }` not assignable to validate callback param | Spread of `Record<string, unknown>` doesn't match the typed interface `{ branchId: string; stationId: string; ... }` |
| 271 | `insert(transfers).values(...)` overload mismatch | `fromTankRow.branchId` is `unknown`, not `string` |
| 321, 324 | `eq(branches.id, toTankRow.branchId)` + `insert(stockLedger).values(...)` | Same `unknown` propagation from raw SQL rows |
| 479 | `insert(stockLedger).values(...)` in `deleteTransfer` | Same pattern in the void/reversal flow |

**Root Cause:** `tx.execute(sql\`...\`)` returns rows typed as `Record<string, unknown>`. The destructured `fromTankRow` / `toTankRow` carry `unknown` for every property. These are then passed to Drizzle's typed `eq()` and `insert().values()` which expect concrete types.

**Fix:** Cast the raw row to a typed interface after destructuring:
```ts
interface RawTankRow {
  id: string;
  branchId: string;
  productId: string | null;
  capacity: string;
  currentLevel: string;
}
const [fromTankRow] = fromResult.rows as RawTankRow[];
```

---

### 1B. HIGH — `inventory.service.ts` (3 errors)

| Line | Error | Root Cause |
|------|-------|------------|
| 151 | `Cannot find name 'InternalServerErrorException'` | Missing import — only imports `BadRequestException, NotFoundException` from `@nestjs/common` |
| 268 | Same | Same missing import |
| 309 | `ShrinkageVarianceDetails` type mismatch in notification trigger | Object literal missing required fields or field type mismatch |

**Fix:**
- Add `InternalServerErrorException` to the `@nestjs/common` import at line 1
- Check the `ShrinkageVarianceDetails` interface and align the object at line 309

---

### 1C. HIGH — `seed.ts` (7 errors) + `reset-admin.ts` (3 errors)

| File | Lines | Error Pattern |
|------|-------|---------------|
| `seed.ts` | 314, 334 | `eq(users.email, process.env.ADMIN_EMAIL)` — `string \| undefined` not assignable to `string \| SQLWrapper` |
| `seed.ts` | 323, 330, 675 | `bcrypt.hash(env_var)` — `string \| undefined` not valid for `bcrypt` |
| `seed.ts` | 326 | `Promise<string> & void` return type conflict from async hash |
| `seed.ts` | 430, 442 | `insert(branches).values(...)` missing required `companyId` |
| `reset-admin.ts` | 37, 47, 48 | Same `eq()` and `bcrypt` patterns as seed.ts |

**Root Cause:** Environment variables are `string | undefined`, Drizzle `eq()` requires `string`. Branch inserts missing `companyId` (added to schema in a later phase but seed not updated).

**Fix:**
- Guard env vars: `const email = process.env.ADMIN_EMAIL!;` or `?? ''` with validation
- Add `companyId` to branch insert calls in seed

---

### 1D. MEDIUM — Other Service Errors (5 errors)

| File | Line | Error |
|------|------|-------|
| `branches.service.ts` | 108 | `insert(branches).values(...)` missing `companyId` | 
| `governance.service.ts` | 412 | `ApprovalPolicyStep[]` not assignable to `Record<string, unknown>[]` |
| `notification-scheduler.service.ts` | 76 | `Date` not assignable to `string` (notification trigger param) |
| `notification-scheduler.service.ts` | 121 | Same `Date` vs `string` mismatch |
| `shifts.service.ts` | 525 | `Date` not assignable to `string` in notification trigger |

---

### 1E. LOW — DTO/Swagger Error (1 error)

| File | Line | Error |
|------|------|-------|
| `ai/dto/financial-insights.dto.ts` | 5 | `ApiPropertyOptions` type mismatch — `type: 'object'` not accepted |

---

## 2. DTO VALIDATION GAPS

### 2A. `update-policy.dto.ts` — **ACCEPTABLE** (false positive)

```ts
export class UpdatePolicyDto extends PartialType(CreatePolicyDto) {}
```

`CreatePolicyDto` has full class-validator decorators (`@IsString`, `@IsArray`, `@ValidateNested`, etc.). `PartialType()` from `@nestjs/swagger` inherits all validators with `@IsOptional()` added. **No action needed.**

### 2B. MEDIUM — `auth.controller.ts:176` — Inline intersection type bypasses validation

```ts
@Body() dto: SignupDto & { roleCode?: string }
```

The `roleCode` property is added via TypeScript intersection but has **no class-validator decorators**. This means:
- No `@IsString()` / `@IsOptional()` validation on `roleCode`
- Any value passes through the `ValidationPipe`

**Fix:** Create a `CreateUserDto` that extends `SignupDto` with a validated `roleCode` field.

---

## 3. UPDATE DTOs — **ALL VERIFIED**

All 19 `@Patch` endpoints use properly typed DTOs:

| Controller | DTO Used |
|-----------|----------|
| `auth.controller.ts` | `UpdateUserStatusDto` |
| `governance.controller.ts` | `UpdatePolicyDto` |
| `branches.controller.ts` | typed update payload |
| `transfers.controller.ts` | `UpdateTransferDto` |
| `companies.controller.ts` | typed update payload |
| `expenses.controller.ts` | `UpdateExpenseEntryDto`, `UpdateExpenseCategoryDto` |
| `deliveries.controller.ts` | `UpdateDeliveryDto` (properly validated) |
| `stations.controller.ts` | typed update payload |
| `credit-invoices.controller.ts` | typed DTO |
| `customers.controller.ts` | typed DTO |
| `notifications.controller.ts` | `UpdatePreferencesDto` |
| `nozzles.controller.ts` | `UpdateNozzleDto` |
| `tanks.controller.ts` | `UpdateTankDto` |
| `pumps.controller.ts` | `UpdatePumpDto` |
| `products.controller.ts` | `UpdateProductDto` |
| `supplier-invoices.controller.ts` | `UpdateSupplierInvoiceDto` |
| `suppliers.controller.ts` | typed DTO |
| `exports.controller.ts` | typed DTO |

**No raw objects found.** ✓

---

## 4. SERVICE METHOD TYPE SAFETY — `as any` Audit

**8 occurrences** found across 4 files:

| Severity | File | Line | Usage | Risk |
|----------|------|------|-------|------|
| MEDIUM | `notifications.service.ts` | 168 | Default preference object `} as any` | Masks missing typed fields; could cause runtime errors if interface changes |
| MEDIUM | `notifications.service.ts` | 181 | `(userPref.channels as any).inapp` | JSONB column type not narrowed — accessing arbitrary property |
| LOW | `notifications.service.ts` | 308 | `and(...) as any` in Drizzle condition push | Works around `and()` returning `SQL \| undefined` vs `SQL` |
| LOW | `exports.service.ts` | 318, 321, 322 | `new Date(x as any)` in HTML template generation | Date coercion in template strings; low runtime risk |
| LOW | `ai-chat.service.ts` | 1522 | `reportType as any` in `.includes()` check | Array type mismatch; validated immediately after |
| LOW | `inventory.service.ts` | 235 | `dto.varianceClassification as any` in `.includes()` | Enum array check; validated before use |

**No `as unknown` type casts found.**

---

## 5. TRANSACTION ERROR HANDLING

**Zero try/catch blocks** wrap any of the 20+ `this.db.transaction()` calls across services.

**Assessment: ACCEPTABLE but improvable.** Drizzle ORM auto-rolls-back on any thrown exception inside the `async (tx) => { ... }` callback. NestJS exception filters catch `BadRequestException` / `NotFoundException` thrown inside transactions and return proper HTTP responses. The pattern is correct.

**Recommendation (LOW priority):** For operations with side effects outside the DB (e.g., sending notifications after a transaction commits), consider wrapping in try/catch to prevent transaction-adjacent failures from surfacing as 500s. Currently, notification sends already use local try/catch blocks — this is well-handled.

---

## 6. MODULE REGISTRATION

### 6A. `app.module.ts` — **ALL MODULES REGISTERED** ✓

All 19 feature modules are properly imported:
`DatabaseModule`, `AuditModule`, `SystemModule`, `AuthModule`, `CoreModule`, `SetupModule`, `ShiftsModule`, `SalesModule`, `InventoryModule`, `DeliveriesModule`, `TransfersModule`, `CreditModule`, `PayablesModule`, `ExpensesModule`, `GovernanceModule`, `NotificationsModule`, `ExportsModule`, `ReportsModule`, `AdminModule`, `AiModule`

### 6B. Global Guards — properly configured:
- `ThrottlerGuard` (rate limiting)
- `JwtAuthGuard` (authentication) 
- `BranchScopeGuard` (tenant isolation)

### 6C. LOW — `EmailTransport` Dual Registration

`EmailTransport` is provided in both `AuthModule` and `NotificationsModule`. Not broken (NestJS creates separate instances per module), but could share via a common `MailModule` with `exports`.

---

## 7. GUARDS AND INTERCEPTORS

### All controllers verified:

| Controller | Guard Status | Notes |
|-----------|-------------|-------|
| `AdminController` | ✓ `@UseGuards(JwtAuthGuard, PermissionsGuard)` | Class-level |
| `AuditController` | ✓ Class-level guards | |
| `AiController` | ✓ Class-level guards | |
| `AuthController` | ✓ Uses `@Public()` + method-level `@UseGuards` | Global `JwtAuthGuard` APP_GUARD exempts `@Public()` routes |
| `GovernanceController` | ✓ Class-level guards | |
| `CreditInvoicesController` | ✓ Class-level guards | |
| `PaymentsController` | ✓ Class-level guards | |
| `ExportsController` | ✓ Class-level guards | |
| `CompaniesController` | ✓ Class-level guards | |
| `BranchesController` | ✓ Class-level guards | |
| `StationsController` | ✓ Class-level guards | |
| `CustomersController` | ✓ Class-level guards | |
| `CreditController` | ✓ Class-level guards | |
| `ExpensesController` | ✓ Class-level guards | |
| `ReportsController` | ✓ Class-level guards | |
| `TransfersController` | ✓ Class-level guards | |
| `AdjustmentsController` | ✓ Class-level guards | |
| `DeliveriesController` | ✓ Class-level guards | |
| `ShiftsController` | ✓ Class-level guards | |
| `SalesController` | ✓ Class-level guards | |
| `InventoryController` | ✓ Class-level guards | |
| `NozzlesController` | ✓ Class-level guards | |
| `TanksController` | ✓ Class-level guards | |
| `PumpsController` | ✓ Class-level guards | |
| `ProductsController` | ✓ Class-level guards | |
| `SupplierInvoicesController` | ✓ Class-level guards | |
| `SuppliersController` | ✓ Class-level guards | |
| `SupplierPaymentsController` | ✓ Class-level guards | |
| `NotificationsController` | ✓ Class-level guards | |
| **`SystemController`** | ⚠ No guards | **INTENTIONAL** — health/liveness/metrics endpoints |
| **`PublicReportVerificationController`** | ⚠ No guards | **INTENTIONAL** — public report verification |

**No security gaps found.** The global APP_GUARD `JwtAuthGuard` protects all routes by default. The two unguarded controllers serve public endpoints.

---

## PRIORITIZED ACTION PLAN FOR PHASE 10

### CRITICAL (blocks build)
1. **Fix `transfers.service.ts`** — Define typed interfaces for raw SQL results (6 errors)
2. **Fix `inventory.service.ts`** — Add missing `InternalServerErrorException` import + fix type mismatch (3 errors)
3. **Fix `seed.ts`** — Guard env vars, add `companyId` to branch inserts (7 errors)
4. **Fix `reset-admin.ts`** — Guard env vars, fix bcrypt typing (3 errors)

### HIGH (type safety / correctness)
5. **Fix `branches.service.ts:108`** — Add `companyId` to branch insert
6. **Fix `governance.service.ts:412`** — Cast `ApprovalPolicyStep[]` properly
7. **Fix `notification-scheduler.service.ts`** — Convert `Date` to ISO string for notification triggers (2 errors)
8. **Fix `shifts.service.ts:525`** — Same Date vs string fix

### MEDIUM (validation / code quality)
9. **Create `CreateUserDto`** extending `SignupDto` with validated `roleCode` field
10. **Clean up `notifications.service.ts`** `as any` casts — define proper JSONB channel type

### LOW (polish)
11. Fix `financial-insights.dto.ts` Swagger type annotation
12. Extract `EmailTransport` into shared `MailModule`
13. Consider typed wrappers for notification trigger params to prevent Date/string mismatches

---

**Build Error Count:** 27  
**Files Affected:** 9  
**Security Issues:** 0  
**Missing Guards:** 0  
**Unvalidated DTOs:** 1 (inline intersection in `createUser`)
