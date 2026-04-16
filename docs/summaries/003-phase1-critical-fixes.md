# 003 — Phase 1 Critical Fixes

**Date:** 2025-01-XX  
**Scope:** Security, performance, and UX fixes from code audit (002)

---

## Changes Made

### 1. JWT Permission Caching (Performance)

**File:** `apps/api/src/modules/auth/strategies/jwt.strategy.ts`

- Added an in-memory TTL cache (30s, max 500 entries) for user permissions resolved during JWT validation.
- Previously, every authenticated request triggered 3+ DB queries (`getUserWithPermissions` → `getRoleAssignmentsForUser` + `getPermissionCodesForRoleIds` + `getCompanyScopesForUser`).
- Now, subsequent requests within the 30s window return cached permissions.
- Exported `invalidatePermissionCache(userId?)` helper for cache busting after role/permission changes.

### 2. PG Error Detail Sanitization (Security)

**File:** `apps/api/src/common/filters/http-exception.filter.ts`

- Removed `pgError.detail`, `pgError.message`, and `pgError.column` leaking into API error responses for PG error codes 23505, 23503, 23514, 23502, 23506.
- Replaced with generic, user-friendly messages (e.g., "A record with these details already exists.").
- Internal PG details are still logged server-side for debugging.

### 3. PermissionsGuard on AI Controller (Security)

**File:** `apps/api/src/modules/ai/ai.controller.ts`

- Added `PermissionsGuard` alongside existing `JwtAuthGuard`.
- Added `@Permissions("reports:read")` to the `POST /ai/insights` endpoint.
- Previously, any authenticated user could hit the AI endpoint regardless of role.

### 4. npm Audit Fix (Security)

- **Frontend (root):** Fixed 3 vulnerabilities (Vite path traversal + WebSocket issues) → **0 vulnerabilities**.
- **Backend (apps/api):** Fixed 4 vulnerabilities including 1 critical → **33 remaining** (all webpack-related, require `@nestjs/cli` major version bump — deferred to Phase 2).

### 5. Silent Failure Feedback (UX)

**Files:** `components/Header.tsx`, `components/pages/NotificationSettingsPage.tsx`

- `Header.tsx` — `handleMarkSeen` catch block now shows error toast via `addToast()`.
- `NotificationSettingsPage.tsx` — Added `useAppStore` import and:
  - Success toast after saving preferences.
  - Error toast on save failure (replacing `// Error message could be shown here` comment).
- `GeminiInsights.tsx` — Already had inline fallback text; no toast needed (self-contained UI).

---

## Remaining from Audit (Phase 2+)

| Item                                        | Priority | Notes                                          |
| ------------------------------------------- | -------- | ---------------------------------------------- |
| `@nestjs/cli` major upgrade (webpack vulns) | Medium   | Breaking change — requires NestJS 11 migration |
| E2E / integration test coverage             | Medium   | Currently 0 test files                         |
| Rate limiting on auth endpoints             | Low      | Login/signup should have stricter throttle     |
| OpenAPI response schema annotations         | Low      | Swagger docs incomplete                        |

---

## Verification

- All modified files pass TypeScript compilation with zero errors.
- `npm audit` (root): 0 vulnerabilities.
- `npm audit` (api): 33 remaining (non-breaking fixes applied).
