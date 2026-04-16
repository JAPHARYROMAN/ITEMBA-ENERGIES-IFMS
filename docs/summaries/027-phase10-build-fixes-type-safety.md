# 027 — Phase 10: Build Error Fixes & Type Safety

**Date:** 2025-01-XX  
**Phase:** 10 — Build Error Fixes & Type Safety  
**Scope:** Fix confirmed TypeScript build errors and DTO validation bypass  
**Error reduction:** 27 → 15 (12 errors resolved)

---

## Summary

Phase 10 addressed 6 confirmed build/type-safety issues discovered during the Phase 10 gap audit (doc 026). Five were from the original audit findings, plus one bonus fix found during verification.

## Changes

### 10A — transfers.service.ts: Raw SQL type safety
**File:** `apps/api/src/modules/transfers/transfers.service.ts`

- Defined `RawTankRow` interface: `{ id, branchId, productId, capacity, currentLevel }`
- Replaced 4 × `Record<string, unknown>[]` casts with `unknown as RawTankRow[]` in `executeTransfer` and `deleteTransfer` methods
- Properties (`branchId`, `productId`, `currentLevel`) now have correct types instead of `unknown`
- Eliminates 4 TS2352 errors from direct cast mismatch

### 10B — inventory.service.ts: Missing import
**File:** `apps/api/src/modules/inventory/inventory.service.ts`

- Added `InternalServerErrorException` to `@nestjs/common` import (was used at 2 call sites without being imported)

### 10B+ — inventory.service.ts: Missing productId in shrinkage notification
**File:** `apps/api/src/modules/inventory/inventory.service.ts`

- Added missing `productId` field to `notifyShrinkageVariance()` call at line ~309
- `ShrinkageVarianceDetails` interface requires `productId`; station-level reconciliation passes empty string

### 10C — branches.service.ts: Missing companyId on insert
**File:** `apps/api/src/modules/core/branches.service.ts`

- Imported `stations` from `../../database/schema/core`
- Added station lookup before insert: `SELECT companyId FROM stations WHERE id = stationId`
- Added `NotFoundException` guard if station doesn't exist
- Included `companyId: station.companyId` in `insert(branches).values()`
- Fixes runtime error: `branches.companyId` is `NOT NULL` with no default

### 10D — seed.ts: Missing companyId on branch inserts
**File:** `apps/api/src/database/seed.ts`

- Added `companyId: company1.id` to both branch insert `.values()` objects
- Both branches belong to station1 → company1

### 10E — auth.controller.ts: DTO validation bypass
**Files:**
- `apps/api/src/modules/auth/dto/create-user.dto.ts` (NEW)
- `apps/api/src/modules/auth/auth.controller.ts`

- Created `CreateUserDto` extending `SignupDto` with `@IsOptional() @IsString() roleCode?: string`
- Replaced `SignupDto & { roleCode?: string }` intersection type with `CreateUserDto`
- TypeScript intersection types bypass NestJS `ValidationPipe` — class-validator decorators only run on class properties
- Security fix: prevents unvalidated `roleCode` from reaching the service layer

## Files Modified (7)

| File | Change |
|------|--------|
| `apps/api/src/modules/transfers/transfers.service.ts` | RawTankRow interface + 4 cast fixes |
| `apps/api/src/modules/inventory/inventory.service.ts` | Added missing import + productId field |
| `apps/api/src/modules/core/branches.service.ts` | Station lookup + companyId in insert |
| `apps/api/src/database/seed.ts` | companyId on both branch inserts |
| `apps/api/src/modules/auth/auth.controller.ts` | Use CreateUserDto |
| `apps/api/src/modules/auth/dto/create-user.dto.ts` | NEW — extends SignupDto with roleCode |

## Remaining Errors (15, pre-existing)

| File | Count | Issue |
|------|-------|-------|
| `seed.ts` | 6 | bcrypt hash return type, env var `undefined` |
| `reset-admin.ts` | 3 | Same bcrypt/env pattern |
| `notification-scheduler.service.ts` | 2 | Date vs string column assignment |
| `shifts.service.ts` | 1 | Date vs string column assignment |
| `governance.service.ts` | 1 | ApprovalPolicyStep[] index signature |
| `financial-insights.dto.ts` | 1 | Swagger @ApiProperty missing additionalProperties |
| `inventory.service.ts` | 1 | ShrinkageVarianceDetails type (resolved at runtime) |

These are candidates for Phase 11.
