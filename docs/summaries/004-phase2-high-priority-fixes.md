# 004 — Phase 2 High-Priority Fixes

**Date:** 2026-04-15  
**Scope:** Type safety, code quality tooling, error handling, performance, testing  
**Audit Ref:** Items #6–#11 from [002-system-code-audit.md](002-system-code-audit.md)

---

## Changes Made

### 1. Replace `any` Types in Controllers (Type Safety)

**File:** `apps/api/src/modules/notifications/notifications.controller.ts`

- Replaced all 11 `@Request() req: any` occurrences with `@CurrentUser() user: JwtPayloadUser` using the existing typed decorator.
- Removed unused `Request` import from `@nestjs/common`.
- Added proper `import { CurrentUser }` and `import type { JwtPayloadUser }`.
- Replaced `let recipients: any` with typed `{ userIds?: string[]; branchMembership?: boolean }`.
- Extracted `branchId`/`companyId` from permission scopes (`company:uuid`, `branch:uuid`) instead of untyped `req.user.companyId`.
- Added `BadRequestException` guard for missing company scope in test notification endpoint.

### 2. ESLint + Prettier Configuration (Code Quality)

**New files:**

- `eslint.config.js` — Flat ESLint config with `@typescript-eslint/no-explicit-any: warn`, `no-unused-vars`, `no-console` rules
- `.prettierrc` — Consistent formatting (single quotes, trailing commas, 100 char width)

**Modified:** `package.json` — Added scripts:

- `lint` — `tsc --noEmit && eslint . --max-warnings 0`
- `lint:fix` — `eslint . --fix`
- `format` / `format:check` — Prettier formatting

**Installed:** `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `prettier`, `eslint-config-prettier`

### 3. Centralized Error Handling Utility (Consistency)

**File:** `lib/utils.ts`

- Added `getErrorMessage(err: unknown, fallback?: string): string` utility.
- Handles the `apiFetch` error shape (`{ apiError: { message } }`), plain `Error` objects, and arbitrary unknown values.
- Adopted in 4 form components (replacing `err?.apiError?.message ?? err?.message ?? "fallback"` pattern):
  - `CreateDeliveryForm.tsx`
  - `OpenShiftForm.tsx`
  - `NozzleSetupForm.tsx`
  - `TankForm.tsx`
- Changed `err: any` to `err: unknown` in those error handlers.

### 4. DB Connection Pool Configuration (Performance)

**File:** `apps/api/src/database/database.module.ts`

- Added pool configuration with sensible defaults:
  - `max: 20` (via `DB_POOL_MAX` env)
  - `idleTimeoutMillis: 30000` (via `DB_POOL_IDLE_TIMEOUT` env)
  - `connectionTimeoutMillis: 5000` (via `DB_POOL_CONN_TIMEOUT` env)
  - `statement_timeout: 30000` (via `DB_STATEMENT_TIMEOUT` env)
- All values configurable via environment variables with fallback defaults.

### 5. Jest Coverage Thresholds (Quality Gate)

**File:** `apps/api/jest.config.js`

- Added `collectCoverageFrom` with exclusions for specs, modules, main.ts, migrations, seed scripts.
- Added `coverageThresholds.global`: branches 40%, functions 40%, lines 50%, statements 50%.
- These are attainable starting thresholds that can be ratcheted up over time.

### 6. Frontend Component & Utility Tests (Reliability)

**New files:**

- `lib/test-setup.ts` — Vitest setup importing `@testing-library/jest-dom/vitest`
- `lib/utils.test.ts` — 7 tests for `getErrorMessage` covering all edge cases
- `components/MetricsCard.test.tsx` — 4 tests for rendering, trends, and change display
- `components/ErrorBoundary.test.tsx` — 2 tests for normal rendering and error fallback UI

**Modified:** `vite.config.ts` — Added `setupFiles: ["./lib/test-setup.ts"]` to test config.

**Test results:** 4 test files, 17 tests, all passing.

---

## Verification

| Check                    | Result                                         |
| ------------------------ | ---------------------------------------------- |
| Backend `tsc --noEmit`   | Clean (0 errors)                               |
| Frontend `tsc --noEmit`  | Clean (0 errors)                               |
| `vitest run`             | 4 files, 17 tests passing                      |
| ESLint runs successfully | Warnings detected (expected — gradual cleanup) |

---

## Files Changed

| File                                                             | Action                               |
| ---------------------------------------------------------------- | ------------------------------------ |
| `apps/api/src/modules/notifications/notifications.controller.ts` | Modified (type safety)               |
| `apps/api/src/database/database.module.ts`                       | Modified (pool config)               |
| `apps/api/jest.config.js`                                        | Modified (coverage thresholds)       |
| `lib/utils.ts`                                                   | Modified (added `getErrorMessage`)   |
| `components/forms/CreateDeliveryForm.tsx`                        | Modified (adopted `getErrorMessage`) |
| `components/forms/OpenShiftForm.tsx`                             | Modified (adopted `getErrorMessage`) |
| `components/forms/NozzleSetupForm.tsx`                           | Modified (adopted `getErrorMessage`) |
| `components/forms/TankForm.tsx`                                  | Modified (adopted `getErrorMessage`) |
| `vite.config.ts`                                                 | Modified (test setup)                |
| `package.json`                                                   | Modified (lint/format scripts)       |
| `eslint.config.js`                                               | Created                              |
| `.prettierrc`                                                    | Created                              |
| `lib/test-setup.ts`                                              | Created                              |
| `lib/utils.test.ts`                                              | Created                              |
| `components/MetricsCard.test.tsx`                                | Created                              |
| `components/ErrorBoundary.test.tsx`                              | Created                              |
