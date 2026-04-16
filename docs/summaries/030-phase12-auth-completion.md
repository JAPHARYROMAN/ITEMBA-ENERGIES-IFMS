# 030 — Phase 12: Auth Completion & Multi-Tenant Isolation

## Objective

Close the 5 remaining auth gaps identified during deep research. The backend was already ~95% complete; this phase wires up the missing frontend flow and database foundations.

## Changes

### 1. Database Migration — `password_reset_tokens` + `user_branches`

- **File**: `apps/api/drizzle/0009_nervous_queen_noir.sql` (auto-generated)
- Generated Drizzle migration that creates both `password_reset_tokens` and `user_branches` tables with all FKs, indexes, and constraints.
- Also catches up schema drift (new columns, re-created FK constraints, new indexes) accumulated across prior phases.

### 2. Frontend `resetPassword()` API Function

- **File**: `lib/api/auth.ts`
- Added `resetPassword(token, newPassword)` calling `POST /auth/reset-password` with `skipAuth: true`.
- Matches the existing `forgotPassword()` pattern.

### 3. `useResetPassword` Hook

- **File**: `hooks/auth/useResetPassword.ts` (new)
- React Query mutation hook following the `useForgotPassword` pattern.
- Handles success (toast message), 400 (expired/invalid token), 429 (rate limit), and generic errors via `normalizeAuthError()`.

### 4. `ResetPasswordPage` Component + Route

- **File**: `App.tsx`
- Added inline `ResetPasswordPage` component following the established auth page pattern (`AuthShell` + `AuthCard` + `PasswordField`).
- Zod schema validates: min 8 chars, max 128, must include uppercase + lowercase + digit + special character, confirm-password must match.
- Reads `?token=` from URL search params; shows error state if token missing.
- On success: shows green success banner with "Go to sign in" button.
- Route: `/reset-password` wrapped in `<PublicAuthRoute>`, placed between `/forgot-password` and `/signup`.

### 5. Seed `user_branches` — Admin Branch Assignments

- **File**: `apps/api/src/database/seed.ts`
- **Fresh seed path**: After creating admin user, inserts `user_branches` rows for both `branch1` (Main Forecourt) and `branch2` (Lubricant Bay) with `onConflictDoNothing`.
- **Upsert path**: When admin already exists, ensures at least the first branch is assigned.
- Imported `userBranches` from schema barrel.
- This enables the `TenantInterceptor` to resolve `company:<uuid>` scopes for the admin user, making multi-tenant scoping functional.

## Verification

| Check | Result |
|-------|--------|
| Backend `tsc --noEmit` | 0 errors |
| Frontend `tsc --noEmit` | 0 new errors (12 pre-existing in form files) |
| Backend Jest | 53/53 passed (12 suites) |
| Frontend Vitest | 17/17 passed (4 suites) |

## Files Changed

| File | Action |
|------|--------|
| `apps/api/drizzle/0009_nervous_queen_noir.sql` | Added (auto-generated migration) |
| `apps/api/drizzle/meta/0009_snapshot.json` | Added (auto-generated snapshot) |
| `lib/api/auth.ts` | Modified — added `resetPassword()` |
| `hooks/auth/useResetPassword.ts` | Added — new hook |
| `App.tsx` | Modified — added schema, component, import, route |
| `apps/api/src/database/seed.ts` | Modified — added `userBranches` import + seeding |
