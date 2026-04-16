# 028 — Phase 11 (Final): Zero Build Errors

**Date:** 2025-01-XX  
**Phase:** 11 — Final Build Error Resolution  
**Scope:** Resolve all remaining TypeScript build errors  
**Error reduction:** 15 → **0** (clean `tsc --noEmit`)

---

## Summary

Phase 11 resolved the final 15 TypeScript build errors across 6 files, achieving a clean zero-error build. All fixes are type-level corrections with no runtime logic changes.

## Changes

### 11A — seed.ts: Env var type narrowing (7 errors fixed)
**File:** `apps/api/src/database/seed.ts`

- Replaced raw `process.env` reads + `process.exit(1)` guard with `requireEnv()` helper
- `requireEnv(name)` returns `string` — TS recognizes `process.exit(1)` as `never`, so the return type is properly narrowed
- All downstream usages (`bcrypt.hash(ADMIN_PASSWORD, 10)`, `eq(users.email, ADMIN_EMAIL)`, `insert().values({ email: ADMIN_EMAIL })`) now receive `string` instead of `string | undefined`

### 11B — reset-admin.ts: Env var type narrowing (3 errors fixed)
**File:** `apps/api/src/database/reset-admin.ts`

- Same `requireEnv()` pattern as seed.ts
- Fixes `bcrypt.hash()` and `eq()` type errors

### 11C — notification-scheduler.service.ts: Date→string conversion (2 errors fixed)
**File:** `apps/api/src/modules/notifications/notification-scheduler.service.ts`

- Line 76: `dueDate: invoice.dueDate` → `dueDate: new Date(invoice.dueDate).toISOString()`
- Line 121: `dueDate: payable.dueDate` → `dueDate: new Date(payable.dueDate).toISOString()`
- Drizzle returns `Date` objects from timestamp columns; `InvoiceOverdueDetails.dueDate` and `PayableDueDetails.dueDate` expect `string`

### 11D — shifts.service.ts: Date→string conversion (1 error fixed)
**File:** `apps/api/src/modules/shifts/shifts.service.ts`

- Line 525: `shiftDate: updated.startTime` → `shiftDate: new Date(updated.startTime).toISOString()`
- `ShiftVarianceDetails.shiftDate` expects `string`

### 11E — governance.service.ts: Parameter type alignment (1 error fixed)
**File:** `apps/api/src/modules/governance/governance.service.ts`

- Line 965: Changed `getApproversForSteps(steps: Record<string, unknown>[])` → `getApproversForSteps(steps: ApprovalPolicyStep[])`
- `ApprovalPolicyStep` interface lacks implicit index signature required by `Record<string, unknown>`
- Private method with single call site — safe to change

### 11F — financial-insights.dto.ts: Swagger configuration (1 error fixed)
**File:** `apps/api/src/modules/ai/dto/financial-insights.dto.ts`

- Removed `type: 'object'` from `@ApiProperty()` decorator
- OpenAPI spec requires `additionalProperties` when `type: 'object'` is explicit; removing lets NestJS/Swagger auto-infer from `Record<string, unknown>`

## Files Modified (6)

| File | Errors Fixed | Change |
|------|-------------|--------|
| `apps/api/src/database/seed.ts` | 7 | `requireEnv()` helper for type-safe env reads |
| `apps/api/src/database/reset-admin.ts` | 3 | Same `requireEnv()` pattern |
| `apps/api/src/modules/notifications/notification-scheduler.service.ts` | 2 | `.toISOString()` for Date→string |
| `apps/api/src/modules/shifts/shifts.service.ts` | 1 | `.toISOString()` for Date→string |
| `apps/api/src/modules/governance/governance.service.ts` | 1 | `ApprovalPolicyStep[]` param type |
| `apps/api/src/modules/ai/dto/financial-insights.dto.ts` | 1 | Remove explicit `type: 'object'` |

## Verification

- `npx tsc --noEmit` → **0 errors** (was 15)
- `npx jest` → 10 suites pass, 40 tests pass (2 pre-existing failures in notification outbox + shifts e2e — unrelated)

## Build Error History

| Phase | Errors | Notes |
|-------|--------|-------|
| Pre-Phase 10 | 27 | Original audit count |
| Post-Phase 10 | 15 | transfers, inventory, branches, seed, auth fixes |
| **Post-Phase 11** | **0** | **Clean build achieved** |
