# 017 — Phase 2: HIGH Priority Audit Fixes

**Date:** 2026-04-16  
**Scope:** HIGH-priority findings from enterprise audit (Phase 2)  
**Impact:** Authentication hardening, input validation, database security, code quality  

---

## Changes Summary

### 1. Password Complexity Enforcement (HIGH — Weak Policy)
**Files:** `apps/api/src/modules/auth/dto/signup.dto.ts`, `apps/api/src/modules/auth/dto/reset-password.dto.ts`  
- Added `@Matches()` regex requiring: uppercase, lowercase, digit, and special character  
- Applies to both signup and password reset flows  
- Existing `@MinLength(8)` and `@MaxLength(128)` retained  
- Passwords like "12345678" or "aaaaaaaa" now rejected

### 2. Database SSL Enforcement in Production (HIGH — Plaintext Credentials)
**Files:** `apps/api/src/common/env/env.schema.ts`, `apps/api/src/database/database.module.ts`  
- Added `DB_SSL` env var with options: `true`, `false`, `require`, `no-verify`  
- `database.module.ts` now configures `ssl` on the pg Pool based on `DB_SSL` value  
- `env.schema.ts` superRefine check: production mode rejects `DB_SSL=false`  
- `require`/`true` = `rejectUnauthorized: true` (validates server certificate)  
- `no-verify` = `rejectUnauthorized: false` (encrypted but no cert validation)  
- Also added typed env vars for `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT`, `DB_POOL_CONN_TIMEOUT`, `DB_STATEMENT_TIMEOUT`

### 3. ParseUUIDPipe on All Route Parameters (HIGH — Input Validation)
**Files:** `apps/api/src/modules/auth/auth.controller.ts` (3 instances)  
- All `@Param('id')` across all controllers now validated with `ParseUUIDPipe`  
- Most controllers (18) were already updated between sessions; auth controller had 3 remaining instances with double-quote patterns  
- Invalid UUIDs now return 400 Bad Request instead of hitting the database

### 4. Account Lockout After Failed Logins (HIGH — Brute Force Protection)
**New migration:** `apps/api/drizzle/0009_account_lockout.sql`  
- Added `failed_login_attempts INTEGER DEFAULT 0` and `locked_until TIMESTAMPTZ` to `users` table  
- Partial index on `locked_until WHERE locked_until IS NOT NULL`  

**Schema:** `apps/api/src/database/schema/auth/users.ts`  
- Added `failedLoginAttempts` and `lockedUntil` columns  

**Service:** `apps/api/src/modules/auth/auth.service.ts`  
- `validateUser()` now checks if account is locked before proceeding  
- Failed attempts increment counter; after 5 failures → 15-minute lockout  
- Successful login resets counter and clears lock  
- Lockout duration communicated in error message (minutes remaining)  
- Constants: `MAX_FAILED_ATTEMPTS = 5`, `LOCKOUT_DURATION_MINUTES = 15`

### 5. Inline Types Replaced with Proper DTOs (MEDIUM — Validation Bypass)
**New files:**  
- `apps/api/src/modules/ai/dto/financial-insights.dto.ts` — `FinancialInsightsDto` with `@IsObject()` + `@IsNotEmptyObject()`  
- `apps/api/src/modules/auth/dto/admin.dto.ts` — `UpdateUserStatusDto` with `@IsIn(['active','inactive'])`, `AssignRoleDto` with `@IsString()` + `@MinLength(1)` + `@MaxLength(100)`  

**Updated controllers:**  
- `ai.controller.ts` — `getInsights()` now uses `FinancialInsightsDto`  
- `auth.controller.ts` — `updateUserStatus()` uses `UpdateUserStatusDto`, `assignRole()` uses `AssignRoleDto`  

### 6. SQL Template Literal Safety (HIGH — Injection Pattern)
**File:** `apps/api/src/modules/reports/reports-refresh.service.ts`  
- Added explicit allowlist check before executing materialized view refresh  
- Added `safeName = name.replace(/[^a-z0-9_]/gi, '')` sanitization  
- Fixed silent error swallowing on advisory lock release (now logs warning)  
- All SQL queries in the refresh loop now use the sanitized name

### 7. Response Serialization (Assessed — No Change Needed)
- Verified all Drizzle ORM queries use explicit `.select({ ... })` with safe columns  
- No service returns `passwordHash`, `failedLoginAttempts`, or `lockedUntil` to clients  
- `listUsers()` selects only `id, email, name, status`  
- Defense-in-depth: Drizzle's explicit select pattern prevents accidental field leakage

---

## Files Changed (12 files)

| Category | Files |
|----------|-------|
| **Auth DTOs** | signup.dto.ts, reset-password.dto.ts, admin.dto.ts (new) |
| **Auth Logic** | auth.service.ts, auth.controller.ts |
| **AI DTO** | financial-insights.dto.ts (new) |
| **AI Controller** | ai.controller.ts |
| **Database** | database.module.ts, env.schema.ts |
| **Schema** | users.ts |
| **Migration** | 0009_account_lockout.sql (new), _journal.json |
| **Reports** | reports-refresh.service.ts |

---

## Audit Areas Verified (No Action Needed)

| Area | Status | Notes |
|------|--------|-------|
| Rate limiting | ✅ Good | Per-IP + per-endpoint overrides on sensitive endpoints |
| Pagination | ✅ Good | MAX_PAGE_SIZE=100, default 25, decorator-enforced |
| Error leakage | ✅ Good | PG error codes mapped to user-friendly messages, no stack traces in responses |
| CORS | ✅ Good | Whitelist-based, no wildcards |
| Helmet/CSP | ✅ Good | Enabled with CSP in production |
| Request size | ✅ Good | 1MB default, configurable |
| Token management | ✅ Good | Rotation, revocation, cleanup cron |
| Log safety | ✅ Good | No passwords/tokens logged |
| Authorization | ✅ Good | All endpoints have @Permissions or @Public |
| Delete safety | ✅ Good | All DELETEs are soft-delete + permission-gated |
| Response safety | ✅ Good | Explicit select patterns, no raw entity returns |

---

## Remaining (Phase 3 — MEDIUM)

- Per-user rate limiting (currently per-IP only)
- CSRF tokens for cookie-based flows (not currently applicable — JWT in headers)
- HTTP-only cookies for refresh tokens (architecture change, requires frontend coordination)
- Query parameter DTOs for complex list endpoints (11 controllers use inline types on @Query)
