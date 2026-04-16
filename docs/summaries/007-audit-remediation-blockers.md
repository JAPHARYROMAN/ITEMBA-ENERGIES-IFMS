# 007 — Audit Remediation: Release Blockers & Remaining Findings

**Date:** 2026-04-15
**Scope:** All 7 findings from the re-audit (`docs/summaries/002-system-code-audit.md`)
**Status:** ✅ All actionable items resolved

---

## Summary

The re-audit identified 7 findings: 2 P0 release blockers, 3 P1 high-priority issues,
and 2 P2 medium-priority items. All have been fixed. The frontend now compiles, lints,
and passes all 17 tests. The API passes all 53 tests with no configuration warnings.

---

## P0 — Release Blockers

### 1. CloseShiftForm syntax error (FIXED)

**File:** `components/forms/CloseShiftForm.tsx`
**Problem:** Duplicate `})();` closing the `hasDraft` IIFE caused a syntax error that blocked frontend compilation.
**Fix:** Removed the extra `})();` at line 196.

### 2. ErrorBoundary test / i18n mismatch (FIXED)

**Files:** `lib/test-setup.ts`, `components/ErrorBoundary.test.tsx`
**Problem:** `ErrorBoundary` renders translated strings via `<Translation>`, but the test setup never initialized i18n. Tests expected the raw English string `"System Anomaly Detected"` but received the translation key `"error.title"`.
**Fix:** Added `import './i18n'` to `lib/test-setup.ts` so all Vitest tests load the i18n configuration. The test now resolves translation keys to English strings correctly.

---

## P1 — High Priority

### 3. Jest coverageThreshold key misspelling (FIXED)

**File:** `apps/api/jest.config.js`
**Problem:** The config used `coverageThresholds` (plural), but Jest expects `coverageThreshold` (singular). The coverage gate was silently disabled.
**Fix:** Renamed the key to `coverageThreshold`.

### 4. Duplicate global JwtAuthGuard registration (FIXED)

**Files:** `apps/api/src/app.module.ts`, `apps/api/src/modules/auth/auth.module.ts`
**Problem:** `JwtAuthGuard` was provided as `APP_GUARD` in both `AppModule` and `AuthModule`, causing redundant auth guard execution per request.
**Fix:** Removed the `{ provide: APP_GUARD, useClass: JwtAuthGuard }` provider and the `JwtAuthGuard` / `APP_GUARD` imports from `AuthModule`. The guard remains registered globally in `AppModule`.

### 5. API dependency remediation (PARTIALLY FIXED)

**Changes:**
| Package | Before | After | Vulnerability Fixed |
|---|---|---|---|
| `bcrypt` | 5.x | 6.0.0 | tar / node-pre-gyp chain (3 high advisories) |
| `drizzle-orm` | 0.36.4 | 0.45.2 | SQL injection via unescaped identifiers (1 high) |

**Result:** Production vulnerabilities reduced from **16** (7 high, 9 moderate) → **12** (3 high, 9 moderate).

**Remaining 12 (all NestJS 10 ecosystem):**

- `multer` ≤2.1.0 — 3 DoS advisories (high). Requires `@nestjs/platform-express@11`.
- `lodash` 4.17.21 — Prototype pollution. No 4.x fix exists; requires lodash@5 or NestJS 11.
- `js-yaml` 4.0.0–4.1.0 — Prototype pollution. Requires `@nestjs/swagger@11`.
- `file-type` — Infinite loop / DoS. Requires `@nestjs/common` update.
- `@nestjs/core` — Injection advisory. Requires NestJS 11.
- Transitive: `@nestjs/config`, `@nestjs/schedule`, `@nestjs/websockets`, `@nestjs/platform-socket.io`.

**Recommendation:** Schedule a NestJS 10 → 11 major version migration to clear the remaining 12 advisories.

---

## P2 — Medium Priority

### 6. OpenShiftForm migrated to versioned storage helpers (FIXED)

**Files:** `components/forms/OpenShiftForm.tsx`, `lib/constants.ts`
**Problem:** `OpenShiftForm` used raw `localStorage.getItem/setItem/removeItem` with a hardcoded key `'ifms-open-shift-draft'`.
**Fix:**

- Added `OPEN_SHIFT_DRAFT_KEY` constant to `lib/constants.ts`.
- Replaced all 5 raw `localStorage` calls with `getStorageItem()`, `setStorageItem()`, `removeStorageItem()` from `lib/storage.ts`.
- Draft persistence now participates in the versioned storage migration system.

### 7. README corrected for server-side Gemini key (FIXED)

**File:** `README.md`
**Problem:** README instructed operators to set `GEMINI_API_KEY` in `.env.local`, implying client-side usage.
**Fix:** Updated step 2 to clarify the key is configured **server-side only** in `apps/api/.env` and is never exposed to the browser.

---

## Bonus Fix

### POSReceiptModal type error (FIXED)

**File:** `components/pos/POSReceiptModal.tsx`
**Problem:** `Object.entries(receipt.payment)` returned `[string, unknown][]` in strict mode, causing TS2365/TS2345 errors.
**Fix:** Added explicit type assertion `as [string, number][]` matching the declared `Record<string, number>` type.

---

## Verification

| Check                      | Result                                    |
| -------------------------- | ----------------------------------------- |
| Frontend `tsc --noEmit`    | ✅ Clean                                  |
| Frontend `vitest run`      | ✅ 17/17 passed                           |
| API `tsc --noEmit` (lint)  | ✅ Clean                                  |
| API `jest`                 | ✅ 53/53 passed, no config warnings       |
| API `npm audit --omit=dev` | ⚠️ 12 remaining (all NestJS 10 ecosystem) |

---

## Files Changed

- `components/forms/CloseShiftForm.tsx` — Removed duplicate `})();`
- `components/forms/OpenShiftForm.tsx` — Migrated to versioned storage helpers
- `components/pos/POSReceiptModal.tsx` — Fixed type assertion
- `components/ErrorBoundary.test.tsx` — (no change needed; test-setup fix resolves it)
- `lib/test-setup.ts` — Added i18n initialization
- `lib/constants.ts` — Added `OPEN_SHIFT_DRAFT_KEY`
- `apps/api/jest.config.js` — Fixed `coverageThreshold` key name
- `apps/api/src/modules/auth/auth.module.ts` — Removed duplicate `APP_GUARD` registration
- `apps/api/package.json` — `bcrypt` 5→6, `drizzle-orm` 0.36→0.45
- `README.md` — Corrected Gemini API key documentation
