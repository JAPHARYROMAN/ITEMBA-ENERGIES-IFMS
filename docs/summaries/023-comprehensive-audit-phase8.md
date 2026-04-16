# 023 – Phase 8: Comprehensive Cross-Dimensional Audit

**Date:** 2026-04-16  
**Scope:** Full-stack audit: unimplemented features verification, API completeness, security, tests, schema, frontend, documentation

---

## Methodology

Systematically read every controller (31 files), cross-referenced `unimplemented_features.md` (22 items) and `code-gap-analysis.md` (75+ findings) against the actual source code to determine current state.

---

## HIGH Priority (Security, Data Integrity, Broken Functionality)

### H-1. Real API Keys Committed in `.env` (SECURITY — CRITICAL)
- **File:** [apps/api/.env](apps/api/.env#L16-L17)
- `GEMINI_API_KEY=<REDACTED>` (line 16)
- `GROQ_API_KEY=<REDACTED>` (line 17)
- The `.env` file is gitignored BUT these keys may exist in git history. The `.env.production` **IS tracked** (`git ls-files` confirms `apps/api/.env.production` is committed).
- **Action:** Rotate both API keys immediately. Remove `.env.production` from git tracking; use CI/CD secrets instead.

### H-2. `.env.production` File Tracked in Git (SECURITY)
- **File:** `apps/api/.env.production` (committed per `git ls-files`)
- Contains placeholder secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SWAGGER_BASIC_PASS`, `DATABASE_URL`). Even placeholders in tracked files establish a pattern where real values could accidentally be committed.
- **Action:** `git rm --cached apps/api/.env.production`, add to `.gitignore`, use environment variable injection in deployment.

### H-3. System/Health Endpoints Unprotected (SECURITY)
- **File:** [apps/api/src/modules/system/system.controller.ts](apps/api/src/modules/system/system.controller.ts#L1-L20)
- `GET /health/live`, `GET /health/ready`, `GET /ops/metrics` — no `@UseGuards`, no `@Permissions`, no `@Throttle`.
- The `/ops/metrics` endpoint exposes internal application metrics (Prometheus-style) to unauthenticated users.
- **Action:** Health endpoints can stay public, but `/ops/metrics` needs `@UseGuards(JwtAuthGuard)` + `@Permissions('setup:write')` or be restricted to internal traffic only.

### H-4. JWT Company/Tenant Scopes Still Inert (DATA INTEGRITY)
- **File:** [apps/api/src/modules/auth/auth.service.ts](apps/api/src/modules/auth/auth.service.ts) (login method)
- Per `unimplemented_features.md` item #3: JWT payload has `{ sub, email, type }` only. The `TenantInterceptor` expects `company:<uuid>` entries in permissions array. Multi-tenant data isolation is **still not enforced** — a user with correct JWT can access data across companies by passing arbitrary `companyId` query params.
- **Status:** STILL UNIMPLEMENTED. Verified no company scope entries appear in JWT construction.

### H-5. Notification Transports Gracefully Degrade but Are Unconfigured
- **File:** [apps/api/src/modules/notifications/transports/email.transport.ts](apps/api/src/modules/notifications/transports/email.transport.ts#L20-L34)
- Email, SMS, and Push transports were implemented (nodemailer, HTTP provider, FCM) — this was fixed since the original gap report. However, all three fall back to **console.log** when env vars (`SMTP_HOST`, `SMS_PROVIDER_URL`, `FCM_PROJECT_ID`) are not configured.
- In production without these env vars, notifications are silently logged but never delivered.
- **Action:** Either configure the transport env vars or add explicit validation at startup that warns/fails if notification channels are enabled but transports are unconfigured.

---

## MEDIUM Priority (Missing Features, Inconsistencies)

### M-1. Missing CRUD: Sales Has No PATCH/Update Endpoint
- **File:** [apps/api/src/modules/sales/sales.controller.ts](apps/api/src/modules/sales/sales.controller.ts#L1-L100)
- Endpoints: `POST /sales/pos`, `GET /sales/transactions`, `GET /sales/transactions/:id`, `POST /sales/transactions/:id/void`
- Missing: No `PATCH /sales/transactions/:id` — once a sale is created, it cannot be corrected (only voided). This may be intentional for audit integrity, but it means price/quantity errors require void + re-entry.

### M-2. Missing CRUD: Payments Has No GET by ID / PATCH / DELETE
- **File:** [apps/api/src/modules/credit/payments.controller.ts](apps/api/src/modules/credit/payments.controller.ts#L1-L62)
- Only `POST /payments` and `GET /payments` exist. No way to view payment details by ID, update a payment, or void/reverse a payment.

### M-3. Missing CRUD: Supplier Payments Has No GET by ID / PATCH / DELETE
- **File:** [apps/api/src/modules/payables/supplier-payments.controller.ts](apps/api/src/modules/payables/supplier-payments.controller.ts#L1-L62)
- Same pattern as credit payments — create and list only. No void/reversal path.

### M-4. Missing CRUD: Adjustments Has No GET by ID
- **File:** [apps/api/src/modules/transfers/adjustments.controller.ts](apps/api/src/modules/transfers/adjustments.controller.ts#L1-L69)
- `POST /adjustments` and `GET /adjustments` exist, but no `GET /adjustments/:id` for detail view.

### M-5. Missing CRUD: Inventory Has No GET by ID for Dips/Reconciliations/Variances
- **File:** [apps/api/src/modules/inventory/inventory.controller.ts](apps/api/src/modules/inventory/inventory.controller.ts#L1-L120)
- List endpoints exist for dips, reconciliations, and variances. No individual GET-by-ID endpoints for any of them.

### M-6. Missing CRUD: Credit Invoices Has No GET by ID
- **File:** [apps/api/src/modules/credit/credit-invoices.controller.ts](apps/api/src/modules/credit/credit-invoices.controller.ts#L1-L100)
- `POST`, `GET` (list), `PATCH`, `DELETE` exist — but no `GET /credit-invoices/:id`.

### M-7. Missing CRUD: Supplier Invoices Has No GET by ID
- **File:** [apps/api/src/modules/payables/supplier-invoices.controller.ts](apps/api/src/modules/payables/supplier-invoices.controller.ts#L1-L100)
- Same as credit invoices — full CRUD minus individual GET by ID.

### M-8. Missing @Throttle on Write Endpoints in Multiple Controllers
Controllers with POST/PATCH/DELETE that lack `@Throttle`:
- [customers.controller.ts](apps/api/src/modules/credit/customers.controller.ts) — `@Post`, `@Patch`, `@Delete` have no `@Throttle`
- [products.controller.ts](apps/api/src/modules/setup/products.controller.ts) — same
- [tanks.controller.ts](apps/api/src/modules/setup/tanks.controller.ts) — same
- [pumps.controller.ts](apps/api/src/modules/setup/pumps.controller.ts) — same
- [nozzles.controller.ts](apps/api/src/modules/setup/nozzles.controller.ts) — same
- [companies.controller.ts](apps/api/src/modules/core/companies.controller.ts) — same
- [branches.controller.ts](apps/api/src/modules/core/branches.controller.ts) — same
- [stations.controller.ts](apps/api/src/modules/core/stations.controller.ts) — same
- [suppliers.controller.ts](apps/api/src/modules/payables/suppliers.controller.ts) — same
- [supplier-invoices.controller.ts](apps/api/src/modules/payables/supplier-invoices.controller.ts) — same
- [credit-invoices.controller.ts](apps/api/src/modules/credit/credit-invoices.controller.ts) — same
- [admin.controller.ts](apps/api/src/modules/admin/admin.controller.ts) — `POST /admin/reports/refresh` has no `@Throttle`
- Note: Global throttler exists but explicit per-endpoint throttling is missing for consistency with the pattern established in `sales`, `deliveries`, `shifts`, `ai`, etc.

### M-9. Bulk Endpoints Not Implemented
- Per doc 022 remaining items: no `POST /products/bulk` or `POST /customers/bulk` endpoints exist anywhere.
- All write operations are single-item only.

### M-10. Soft-Delete Recovery Endpoints Not Implemented
- Per doc 022 remaining items: no `POST /:id/restore` or equivalent endpoint exists on any controller.
- Soft-deleted records cannot be recovered via API.

### M-11. Test Coverage Well Below 60% Target

**Backend unit test specs (9 files):**
| Module | Spec File | Exists |
|--------|-----------|--------|
| sales | `sales.service.spec.ts` | ✅ |
| sales | `sales.governance.spec.ts` | ✅ |
| expenses | `expenses.governance.spec.ts` | ✅ |
| shifts | `shifts.service.spec.ts` | ✅ |
| notifications | `notifications.service.spec.ts` | ✅ |
| governance | `governance.service.spec.ts` | ✅ |
| governance | `policy-evaluator.service.spec.ts` | ✅ |
| core | `companies.service.spec.ts` | ✅ |
| deliveries | `deliveries.service.spec.ts` | ✅ |

**Backend modules with NO unit tests (10 modules):**
- `auth` — no service spec (critical module)
- `admin` — no spec
- `ai` — no spec (complex service)
- `audit` — no spec
- `credit` (credit-invoices, payments, credit-aging, credit-statement) — no specs
- `exports` — no spec
- `inventory` — no spec
- `payables` (suppliers, supplier-invoices, supplier-payments, payables-aging, supplier-statement) — no specs
- `setup` (products, tanks, pumps, nozzles) — no specs
- `transfers` (adjustments) — no spec for adjustments service
- `system` — no spec

**Backend E2E tests (3 files):**
- `auth-flow.e2e-spec.ts` — 2 tests
- `reports-overview.e2e-spec.ts` — 1 test
- `shifts-transaction.e2e-spec.ts` — 1 test

**Frontend tests (2 files only):**
- [components/ErrorBoundary.test.tsx](components/ErrorBoundary.test.tsx)
- [components/MetricsCard.test.tsx](components/MetricsCard.test.tsx)

**Not tested at all:** ~26 page components, ~20 form components, all hooks, all lib utilities (form-calcs.test.ts uses hand-rolled framework, not integrated into CI).

### M-12. Notifications Controller Has Duplicate Decorators
- **File:** [apps/api/src/modules/notifications/notifications.controller.ts](apps/api/src/modules/notifications/notifications.controller.ts#L28-L33)
- Lines 28-33: `@ApiTags('notifications')`, `@ApiBearerAuth()`, `@UseGuards(JwtAuthGuard, PermissionsGuard)` appear, then lines 34-35 repeat: `@ApiTags('notifications')`, `@ApiBearerAuth()`, `@UseGuards(JwtAuthGuard)`.
- The second `@UseGuards(JwtAuthGuard)` on line 35 may **override** the first class-level `@UseGuards(JwtAuthGuard, PermissionsGuard)`, potentially disabling `PermissionsGuard` for all notification endpoints.
- **Action:** Remove the duplicate decorators on lines 34-35.

---

## LOW Priority (Cleanup, Polish, Nice-to-Haves)

### L-1. Dead `inventorySettings` Table
- **File:** [apps/api/src/database/schema/inventory/inventory-settings.ts](apps/api/src/database/schema/inventory/inventory-settings.ts#L6-L19)
- Table is defined in schema and exported from `schema/inventory/index.ts` (line 4).
- **Zero references** anywhere in any service, controller, or module — no reads, no writes, no imports outside of the schema barrel export.
- **Action:** Remove the table definition and the schema export. Create a migration to drop the table if it exists in the database.

### L-2. `ModulePlaceholder` Catch-All Route
- **File:** [App.tsx](App.tsx#L1320)
- Line 1320: `<Route path="*" element={<ModulePlaceholder />} />` — any unmatched route renders a placeholder page.
- All previously-placeholder routes now have dedicated page components (26 page files exist in `components/pages/`).
- The import is only used for the wildcard catch-all, which is fine. However, `ModulePlaceholder` is no longer used for any named route — it's purely a 404 fallback now.
- **Action:** Consider replacing with a proper 404 page.

### L-3. `GeneralSetupForm` Was Fixed
- **Original finding:** `unimplemented_features.md` and `code-gap-analysis.md` said form only logged to console.
- **Current state:** [components/forms/GeneralSetupForm.tsx](components/forms/GeneralSetupForm.tsx#L73-L95) now calls `setupDataSource.stations.create()`, `stations.update()`, `branchesRepo.create()`, etc. via proper `useMutation` with API calls.
- **Status:** ✅ FIXED.

### L-4. `ExpenseEntryForm` Edit Mode Was Fixed
- **Original finding:** Edit mode resolved immediately without API call.
- **Current state:** [components/forms/ExpenseEntryForm.tsx](components/forms/ExpenseEntryForm.tsx#L52-L56) now calls `expenseRepo.update(initialData.id, data)` when `isExisting` is true.
- **Status:** ✅ FIXED.

### L-5. Nginx Security Headers Were Added
- **Original finding:** Missing all security headers.
- **Current state:** [nginx.conf](nginx.conf#L16-L20) has `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, and `Content-Security-Policy`.
- **Status:** ✅ FIXED.

### L-6. Auth Module Was Significantly Expanded
- **Original findings:** Missing signup, forgot-password, reset-password, change-password, user CRUD.
- **Current state:** [auth.controller.ts](apps/api/src/modules/auth/auth.controller.ts) now has:
  - `POST /auth/signup` (line 68)
  - `POST /auth/forgot-password` (line 78)
  - `POST /auth/reset-password` (line 92)
  - `POST /auth/change-password` (line 140)
  - `GET /auth/users` (admin, line 156)
  - `POST /auth/users` (admin create, line 164)
  - `PATCH /auth/users/:id/status` (admin, line 175)
  - `POST /auth/users/:id/roles` (admin, line 187)
- **Status:** ✅ FIXED. (Signup, forgot password, change password, user CRUD all implemented.)

### L-7. Transfer CRUD Was Completed
- **Original finding:** Only create, no list/update/delete.
- **Current state:** [transfers.controller.ts](apps/api/src/modules/transfers/transfers.controller.ts) has `POST tank-to-tank`, `POST station-to-station`, `GET`, `PATCH :id`, `DELETE :id`.
- **Status:** ✅ FIXED.

### L-8. Delivery CRUD Was Completed
- **Original finding:** No PATCH endpoint.
- **Current state:** [deliveries.controller.ts](apps/api/src/modules/deliveries/deliveries.controller.ts) has `POST`, `POST :id/grn`, `PATCH :id`, `GET`, `GET :id`, `DELETE :id`.
- **Status:** ✅ FIXED.

### L-9. Credit Invoices CRUD Was Expanded
- **Original finding:** No update or void.
- **Current state:** `PATCH :id` and `DELETE :id` now exist.
- **Status:** ✅ FIXED (missing only GET by ID per M-6).

### L-10. Supplier Invoices CRUD Was Expanded
- **Original finding:** No update or void.
- **Current state:** `PATCH :id` and `DELETE :id` now exist.
- **Status:** ✅ FIXED (missing only GET by ID per M-7).

### L-11. GeminiService Client-Side File Was Deleted
- Per [016 summary](docs/summaries/016-phase1-critical-security-hardening.md#L124): `geminiService.ts` and `GeminiInsights.tsx` were deleted. AI now goes through the backend `/api/ai/*` endpoints.
- **Status:** ✅ FIXED.

### L-12. Frontend Error Boundary Was Implemented
- [components/ErrorBoundary.tsx](components/ErrorBoundary.tsx) exists with corresponding test file.
- **Status:** ✅ FIXED.

### L-13. Notification Digest Service Exists
- [apps/api/src/modules/notifications/notification-digest.service.ts](apps/api/src/modules/notifications/notification-digest.service.ts) is implemented with `EmailTransport` integration.
- **Status:** ✅ FIXED (original unimplemented item #7).

### L-14. SQL Usage Is Safe (Parameterized via Drizzle)
- All `sql\`...\`` usages found use Drizzle's tagged template syntax which automatically parameterizes values. No raw string interpolation detected.
- **Status:** ✅ No SQL injection risk found.

### L-15. All `:id` Params Have `ParseUUIDPipe`
- Grep found zero instances of `@Param('id') id: string` without `ParseUUIDPipe` across all 31 controllers.
- **Status:** ✅ Consistent.

### L-16. `pageSize` Has Max 100 Limit
- [apps/api/src/common/dto/list-query.dto.ts](apps/api/src/common/dto/list-query.dto.ts#L7) defines `MAX_PAGE_SIZE = 100` with `@Max(MAX_PAGE_SIZE)` validation.
- **Status:** ✅ FIXED (original finding about no max pagination limit).

---

## Summary: Unimplemented Features Status

| # | Feature | Original Severity | Current Status |
|---|---------|-------------------|----------------|
| 1 | Self-Service Signup | 🔴 Critical | ✅ Implemented |
| 2 | Forgot Password / Reset | 🔴 Critical | ✅ Implemented |
| 3 | JWT Company Scopes / Tenant Isolation | 🔴 Critical | ❌ STILL UNIMPLEMENTED (H-4) |
| 4 | Email Notification Delivery | 🟠 High | ✅ Transport implemented (needs config) |
| 5 | SMS Notification Delivery | 🟠 High | ✅ Transport implemented (needs config) |
| 6 | Push Notification Delivery | 🟠 High | ✅ Transport implemented (needs config) |
| 7 | Notification Digest Mode | 🟠 High | ✅ Implemented |
| 8 | Audit Log UI | 🟠 High | ✅ AuditLogPage.tsx exists |
| 9 | GeminiService Backend Proxy | 🟠 High | ✅ Replaced with /api/ai/* |
| 10 | Governance Approval Queue UI | 🟡 Medium | ✅ GovernanceApprovalsPage.tsx exists |
| 11 | User Management CRUD | 🟡 Medium | ✅ Auth controller has user endpoints |
| 12 | Role & Permission Management UI | 🟡 Medium | ✅ UsersRolesPage.tsx exists |
| 13 | TSA Fiscal Integration Testing | 🟡 Medium | ⚠️ Structural only (no real TSA) |
| 14 | WebSocket Consumer (Frontend) | 🟡 Medium | ❓ Not verified |
| 15 | Stock Adjustment Approval Flow | 🟡 Medium | ✅ Governance integration exists |
| 16 | i18n | 🔵 Low | ❌ Not implemented |
| 17 | React Error Boundaries | 🔵 Low | ✅ Implemented |
| 18 | Migration CI Validation | 🔵 Low | ✅ E2E job uses drizzle-kit push |
| 19 | Endpoint Rate Limiting | 🔵 Low | ⚠️ Partial (M-8) |
| 20 | Monitoring & Observability | 🔵 Low | ⚠️ /ops/metrics exists but unprotected |
| 21 | Data Export/Import (CSV/PDF) | 🔵 Low | ✅ Exports module exists |
| 22 | Multi-Branch/Station Switcher | 🔵 Low | ❓ Not verified |

---

## Prioritized Action Items

### Immediate (H-priority)
1. **Rotate API keys** exposed in `.env` (H-1)
2. **Remove `.env.production` from git** (H-2)
3. **Protect `/ops/metrics`** endpoint (H-3)
4. **Implement JWT tenant scoping** for multi-tenant isolation (H-4)
5. **Fix notification controller duplicate decorators** (M-12 — may disable PermissionsGuard)

### Next Sprint (M-priority)
6. Add `GET :id` endpoints: credit-invoices, supplier-invoices, adjustments, inventory dips/recons/variances (M-4 through M-7)
7. Add `GET :id` / `DELETE` (void/reverse) for credit payments and supplier payments (M-2, M-3)
8. Add `@Throttle` to all write endpoints missing it (M-8)
9. Write unit tests for untested modules: auth, credit, payables, setup, inventory, exports, ai (M-11)
10. Implement bulk endpoints for products/customers (M-9)
11. Implement soft-delete recovery endpoints (M-10)

### Backlog (L-priority)
12. Drop dead `inventorySettings` table (L-1)
13. Replace ModulePlaceholder catch-all with proper 404 page (L-2)
14. Add frontend component tests (currently 2 files)
15. Integrate `lib/form-calcs.test.ts` into Vitest runner
