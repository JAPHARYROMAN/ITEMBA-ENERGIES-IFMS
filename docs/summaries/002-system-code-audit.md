# 002 - System-Wide Code Audit Report

**Project:** IFMS Enterprise Financial Suite  
**Audit Date:** April 15, 2026  
**Scope:** Current repository checkout (`frontend + API + CI/config`)  
**Auditor:** Codex automated audit

---

## Executive Summary

This checkout is **not release-ready**. The API is in materially better shape than the frontend: API typecheck passes and API tests pass, but the frontend currently fails both typecheck/lint and the Vitest suite. The previous audit summary in this file was stale; several earlier findings have been fixed, but new blocking regressions are present.

### Current Status

| Area | Status | Notes |
| --- | --- | --- |
| Frontend compile/lint | ❌ Failing | Syntax error in `CloseShiftForm.tsx` blocks `npm run lint` |
| Frontend tests | ❌ Failing | `1/17` tests failing |
| API compile/lint | ✅ Passing | `npm run lint` in `apps/api` passes |
| API tests | ✅ Passing with config warning | `53/53` passing, but Jest coverage gate is misconfigured |
| Frontend prod deps audit | ✅ Clean | `0` prod vulnerabilities |
| API prod deps audit | ⚠️ Failing | `16` prod vulnerabilities (`7 high`, `9 moderate`) |

### Commands Run

```powershell
npm run lint
npm test
cd apps/api; npm run lint
cd apps/api; npm test
npm audit --omit=dev --json
cd apps/api; npm audit --omit=dev --json
```

---

## Verified Findings

### 1. Frontend compile is currently broken

- **Severity:** Critical
- **Evidence:** `npm run lint` fails before ESLint runs.
- **Location:** `components/forms/CloseShiftForm.tsx:191-195`
- **Detail:** `hasDraft` is closed twice:

```tsx
const hasDraft = (() => {
  const d = getStorageItem<Record<string, unknown>>(CLOSE_SHIFT_DRAFT_KEY);
  return d?.id === activeShift?.id;
})();
})();
```

- **Impact:** Frontend typecheck, lint, and likely build pipelines are blocked.

### 2. Frontend test suite is failing and the failure is deterministic

- **Severity:** High
- **Evidence:** `npm test` fails in `components/ErrorBoundary.test.tsx`.
- **Locations:**
  - `components/ErrorBoundary.tsx:32-80`
  - `components/ErrorBoundary.test.tsx:28`
  - `lib/test-setup.ts:1`
- **Detail:** `ErrorBoundary` renders translated strings via `<Translation>`, but the test setup does not initialize i18n. The rendered output contains translation keys like `error.title`, while the test still expects `"System Anomaly Detected"`.
- **Impact:** CI test stage is red; the test suite is no longer a trustworthy gate for frontend regressions.

### 3. API coverage enforcement is configured incorrectly and is not active

- **Severity:** High
- **Evidence:** Jest prints a validation warning during `apps/api` tests.
- **Location:** `apps/api/jest.config.js:16`
- **Detail:** The config uses `coverageThresholds`, but Jest expects `coverageThreshold`.
- **Impact:** The repository claims to enforce coverage minimums, but the gate is silently disabled.

### 4. JWT auth guard is registered globally twice

- **Severity:** High
- **Locations:**
  - `apps/api/src/app.module.ts:95`
  - `apps/api/src/modules/auth/auth.module.ts:31`
  - `apps/api/src/modules/auth/strategies/jwt.strategy.ts:45-66`
  - `apps/api/src/modules/auth/auth.service.ts:349-377`
- **Detail:** `JwtAuthGuard` is provided as `APP_GUARD` in both `AppModule` and `AuthModule`.
- **Impact:** This likely causes redundant auth guard execution on protected routes. Because JWT validation still calls `getUserWithPermissions()` on cache miss, the duplication can add avoidable request overhead. This is an inference from the dual `APP_GUARD` registration and the current strategy flow.

### 5. API production dependencies still contain unresolved security advisories

- **Severity:** High
- **Evidence:** `npm audit --omit=dev --json` in `apps/api`
- **Key packages affected:**
  - `drizzle-orm` `<0.45.2` - high severity SQL injection advisory
  - `bcrypt` `5.x` - high severity transitive `tar` / `node-pre-gyp` chain
  - `@nestjs/platform-express` / `multer` chain - high severity DoS advisories
  - `@nestjs/common`, `@nestjs/core`, `@nestjs/swagger`, `@nestjs/config` - moderate advisories
- **Impact:** The backend security job is correctly non-clean today. Some fixes are major-version upgrades, but the risk remains real until scheduled and completed.

### 6. Frontend storage hardening is inconsistent across forms

- **Severity:** Medium
- **Locations:**
  - `components/forms/CloseShiftForm.tsx:15-16,156-170`
  - `components/forms/OpenShiftForm.tsx:122-153`
  - `lib/storage.ts:1-66`
- **Detail:** `CloseShiftForm` uses the versioned storage helper and shared key constant. `OpenShiftForm` still uses raw `localStorage` with a hardcoded key (`ifms-open-shift-draft`) and manual JSON parsing.
- **Impact:** The storage migration/versioning work is only partially adopted, so draft behavior remains inconsistent and harder to maintain.

### 7. Documentation still points operators toward a client-side Gemini key flow

- **Severity:** Medium
- **Locations:**
  - `README.md:18`
  - `apps/api/src/modules/ai/ai.service.ts:11-25`
- **Detail:** The README still instructs users to set `GEMINI_API_KEY` in `.env.local`, while the implemented AI path uses the backend `AiService` and server-side config.
- **Impact:** This creates operator confusion and increases the chance of accidental client-side secret exposure.

---

## Checks That Now Pass

These older findings from the previous audit are no longer accurate for the current code:

- Frontend linting and formatting are configured in `package.json`, `eslint.config.js`, and `.prettierrc`.
- Reports cache keys include scope context in `apps/api/src/modules/reports/reports.service.ts`.
- DB pool sizing and timeouts are configured in `apps/api/src/database/database.module.ts`.
- AI endpoints now use `JwtAuthGuard`, `PermissionsGuard`, and `@Permissions('reports:read')`.
- Nginx includes WebSocket upgrade headers in `nginx.conf`.
- Frontend production dependency audit is clean.

---

## Risk Ranking

| Priority | Item | Why it matters |
| --- | --- | --- |
| P0 | Fix `CloseShiftForm.tsx` syntax error | Restores frontend lint/build pipeline |
| P0 | Fix `ErrorBoundary` test/i18n setup mismatch | Restores frontend CI signal |
| P1 | Correct Jest `coverageThreshold` key | Re-enables an advertised quality gate |
| P1 | Remove duplicate global `JwtAuthGuard` registration | Eliminates redundant auth work and ambiguity |
| P1 | Plan API dependency remediation | Current backend prod dependency graph is not security-clean |
| P2 | Migrate `OpenShiftForm` to shared storage helpers | Completes storage hardening rollout |
| P2 | Update README / runbooks for server-side AI key handling | Prevents operational misconfiguration |

---

## Recommended Next Actions

1. Remove the extra `})();` in `CloseShiftForm.tsx`, then rerun root `lint`, `test`, and `build`.
2. Decide whether frontend tests should load real i18n or stub translations, then update `lib/test-setup.ts` and `ErrorBoundary.test.tsx` consistently.
3. Change `coverageThresholds` to `coverageThreshold` in `apps/api/jest.config.js`.
4. Keep `JwtAuthGuard` global in one module only; `AppModule` is the clearer place.
5. Schedule backend dependency upgrades around Nest, Drizzle, and bcrypt compatibility testing.
6. Replace raw `localStorage` usage in `OpenShiftForm` with `lib/storage.ts` and a shared constant.
7. Remove the client-side Gemini key instruction from `README.md`.

---

## Bottom Line

The API is broadly healthy but carries dependency debt and a configuration blind spot. The frontend currently has two immediate release blockers: one compile-time syntax error and one failing test caused by mismatched i18n assumptions. Until those are fixed, this branch should be treated as unstable.
