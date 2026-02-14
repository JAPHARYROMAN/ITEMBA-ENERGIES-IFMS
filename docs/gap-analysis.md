# IFMS Codebase Gap Analysis Report

> **Generated**: 2026-02-14  
> **Scope**: Full-stack audit of missing logic, backend gaps, and incomplete implementations  
> **Codebase**: ITEMBA-ENERGIES-IFMS (NestJS API + React/Vite frontend + PostgreSQL/Drizzle)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Backend API Gaps](#2-backend-api-gaps)
3. [Frontend Gaps](#3-frontend-gaps)
4. [Database & Data Integrity Gaps](#4-database--data-integrity-gaps)
5. [Testing Gaps](#5-testing-gaps)
6. [CI/CD & Infrastructure Gaps](#6-cicd--infrastructure-gaps)
7. [Security Gaps](#7-security-gaps)
8. [Cross-Cutting Concerns](#8-cross-cutting-concerns)
9. [Recommendations by Priority](#9-recommendations-by-priority)

---

## 1. Executive Summary

The IFMS codebase covers 16 business modules with ~65+ API endpoints, a React frontend with routing/state management, and a PostgreSQL database with 50+ tables. The architecture uses solid patterns (transactions, audit logging, JWT auth, soft deletes) but the audit reveals **significant gaps between what the UI presents and what the backend actually implements**. Key areas of concern include: forms that don't persist data, hardcoded station identifiers preventing multi-station operation, ~15 sidebar routes that resolve to placeholder pages, incomplete CRUD operations across several modules, missing unit test coverage for all 16 API modules, and no production deployment pipeline.

**Summary Statistics**:

| Category | Findings |
|----------|----------|
| Critical backend gaps | 8 |
| Frontend missing logic | 12 |
| Database integrity gaps | 7 |
| Testing gaps | 5 |
| CI/CD gaps | 4 |
| Security gaps | 6 |

---

## 2. Backend API Gaps

### 2.1 Incomplete CRUD Operations

Several modules implement only a subset of create/read/update/delete:

| Module | Create | Read/List | Update | Delete | Notes |
|--------|--------|-----------|--------|--------|-------|
| **Transfers** | ✅ | ❌ | ❌ | ❌ | Service has `tankToTank()` and `stationToStation()` but no list/update/delete endpoints |
| **Deliveries** | ✅ | ✅ | ❌ | ❌ | No PATCH endpoint; once created, a delivery cannot be corrected |
| **Supplier Invoices** | ✅ | ✅ | ❌ | ❌ | No update or void capability on invoices |
| **Credit Invoices** | ✅ | ✅ | ❌ | ❌ | Same gap as supplier invoices |
| **Inventory (Dips)** | ✅ | ✅ | ❌ | ❌ | Dip readings are immutable but no correction mechanism exists |
| **Inventory (Reconciliations)** | ✅ | ✅ | ❌ | ❌ | No adjustment or re-reconciliation path |

### 2.2 Missing Business Logic

| Area | File | Issue |
|------|------|-------|
| **Product existence not verified before sale** | `apps/api/src/modules/sales/sales.service.ts` | `productId` in sale items is not validated against the `products` table before insert; an invalid product ID would be stored |
| **Inventory not deducted on sale** | `apps/api/src/modules/sales/sales.service.ts` | POS sale creation does not create stock ledger entries or deduct tank levels—stock tracking is disconnected from sales |
| **Tank capacity not re-verified at GRN commit** | `apps/api/src/modules/deliveries/deliveries.service.ts` | GRN allocation checks capacity but does not use a SELECT FOR UPDATE or re-validate inside the transaction, opening a race condition window |
| **Transfer stock re-validation race** | `apps/api/src/modules/transfers/transfers.service.ts` | Stock levels are validated outside the write transaction; concurrent requests could overdraw a tank |
| **Governance null return unhandled** | `apps/api/src/modules/governance/governance.service.ts` | When governance is disabled, the service returns `null`; callers check `if (governanceRequest)` but not all calling paths handle the null case consistently |
| **Hardcoded approval timeout** | `apps/api/src/modules/governance/governance.service.ts` | `findDueApprovalRequest()` uses a hardcoded 24-hour window; this is not configurable per policy |

### 2.3 Missing Endpoints

| Expected Endpoint | Status | Impact |
|-------------------|--------|--------|
| `PATCH /api/deliveries/:id` | Missing | Cannot correct delivery before GRN |
| `GET /api/transfers` (list) | Missing | Cannot view transfer history |
| `DELETE /api/supplier-invoices/:id` | Missing | Cannot void incorrect invoices |
| `PATCH /api/credit-invoices/:id` | Missing | Cannot adjust credit invoices |
| `POST /api/auth/change-password` | Missing | Users cannot change their own password |
| User CRUD endpoints | Missing | No user management beyond the seed/reset scripts |
| Role CRUD endpoints | Missing | Roles can only be managed via direct DB |
| Batch/bulk operation endpoints | Missing | All writes are single-item only |
| Soft-delete recovery endpoints | Missing | Records are soft-deleted but cannot be restored |

### 2.4 Error Handling Inconsistencies

Multiple services throw generic `Error` instead of NestJS HTTP exceptions:

```
apps/api/src/modules/sales/sales.service.ts        → throw new Error('Failed to insert sale transaction')
apps/api/src/modules/transfers/transfers.service.ts → throw new Error('Failed to insert transfer')
apps/api/src/modules/expenses/expenses.service.ts   → throw new Error('Insert failed')
apps/api/src/modules/shifts/shifts.service.ts       → throw new Error('Failed to insert shift')
```

These result in HTTP 500 responses to the client with no actionable detail, whereas they should be `InternalServerErrorException` or `BadRequestException` with context.

### 2.5 Null-Coalescing Safety

In `apps/api/src/modules/transfers/transfers.service.ts`:
```typescript
const companyId = stationRow?.companyId ?? '';
```
An empty string is an unsafe fallback for a UUID foreign key—this could pass validation but create an orphaned record.

---

## 3. Frontend Gaps

### 3.1 Forms That Do Not Persist Data

| Form | File | Issue |
|------|------|-------|
| **GeneralSetupForm** | `components/forms/GeneralSetupForm.tsx` | `onSubmit` only logs to console and calls `onSuccess()` without any API call. All setup entity creation is non-functional. |
| **ExpenseEntryForm (edit mode)** | `components/forms/ExpenseEntryForm.tsx` | When editing an existing expense: `mutationFn: (data) => isExisting ? Promise.resolve(data) : expenseRepo.create(data)`. The edit path resolves immediately without calling any update API. |

### 3.2 Hardcoded Station Identifiers

Several components are hardcoded to station `'s1'`, breaking multi-station deployments:

| File | Code |
|------|------|
| `components/forms/CloseShiftForm.tsx` | `queryKey: ['active-shift', 's1'], queryFn: () => shiftRepo.getOpen('s1')` |
| `components/forms/ReceiveDeliveryForm.tsx` | `queryKey: ['tanks', 's1'], queryFn: () => tankRepo.list('s1')` |
| `components/pos/POSPage.tsx` | `queryFn: () => nozzleRepo.list('s1')` |
| `components/forms/OpenShiftForm.tsx` | Hardcoded default unit price: `pricePerUnit: 1.45` |

### 3.3 Sidebar Routes Without Pages (~15 Routes)

The following sidebar menu items resolve to `ModulePlaceholder` (a "coming soon" component) because no actual route or page component exists:

- `/app/inventory/dips`
- `/app/inventory/reconciliation`
- `/app/inventory/variance`
- `/app/transfers/tank-to-tank`
- `/app/transfers/station-to-station`
- `/app/payables/suppliers`
- `/app/payables/invoices`
- `/app/payables/payments`
- `/app/payables/aging`
- `/app/sales/transactions`
- `/app/expenses/categories`
- `/app/deliveries/grn/:id`

### 3.4 Inconsistent Error Handling in API Calls

| Pattern | Files | Issue |
|---------|-------|-------|
| Silent error swallowing | `lib/api/client.ts` | `.catch(() => ({}))` silently discards JSON parse errors, hiding malformed API responses |
| Generic error messages | `components/forms/OpenShiftForm.tsx` | `onError: () => addToast("Failed to open shift. Station lock active.", "error")` — ignores actual API error message |
| Logout failure silenced | `store.ts` | `apiAuth.logout(refresh).catch(() => {})` — logout failures are silently ignored |
| Vague validation errors | `components/forms/CustomerForm.tsx` | `onError: () => addToast("Validation failed or database rejected entry.", "error")` — no actual error details |

### 3.5 Missing Query Invalidation After Mutations

| File | Mutation | Missing Invalidation |
|------|----------|---------------------|
| `components/forms/RecordPaymentForm.tsx` | Payment creation | Does not invalidate `unpaid-invoices` query after successful payment |
| `components/pos/POSPage.tsx` | Sale creation | Does not clear form state automatically after sale |

### 3.6 Missing Loading/Error States

| Component | Gap |
|-----------|-----|
| `components/Dashboard.tsx` | No error handling for `salesQuery` or `expensesQuery` failures |
| `components/pages/ProfitabilityReport.tsx` | No error state if profitability report fails to load |
| `components/pages/ReportsOverview.tsx` | No error boundary for report data queries |
| `components/pages/GovernanceApprovalsPage.tsx` | Approve/reject buttons do not disable during mutation |
| `components/forms/PettyCashForm.tsx` | `loadingBalance` state is defined but unused in UI |

### 3.7 Hardcoded/Mock Data in Production Components

| File | Line | Issue |
|------|------|-------|
| `components/forms/CustomerManagement.tsx` | ~27 | Hardcoded customer note: `'Customer requested extension for Invoice INV-1002...'` instead of API data |
| `components/pages/ProfitabilityReport.tsx` | ~58–62 | Hardcoded insights array instead of dynamically generated insights |

### 3.8 Gemini AI Service Issues

| File | Issue |
|------|-------|
| `services/geminiService.ts` | References `process.env.API_KEY` which is inaccessible in the frontend Vite build |
| `services/geminiService.ts` | Uses `GoogleGenAI` from `@google/genai` — package may not be installed or correctly configured |
| `services/geminiService.ts` | Model name `'gemini-3-flash-preview'` may not exist |
| `components/GeminiInsights.tsx` | Likely fails silently when the Gemini service throws |

### 3.9 Console Logging Left in Production Code

| File | Code |
|------|------|
| `components/forms/GeneralSetupForm.tsx` | `console.log(\`Creating ${entityName}:\`, data)` |
| `components/GeminiInsights.tsx` | `console.error("Gemini Error:", err)` |

---

## 4. Database & Data Integrity Gaps

### 4.1 Missing Foreign Key Constraints

| Table | Column | Expected Reference | Issue |
|-------|--------|-------------------|-------|
| `expense_entries` | `categoryId` | `expense_categories.id` | Column exists but has **no** `.references()` — referential integrity is not enforced |
| `stock_ledger` | `referenceId` | Polymorphic (grn, transfer, sale, etc.) | A UUID column with no FK constraint — orphaned references are possible when source records are deleted |

### 4.2 Schema ↔ Frontend Model Mismatches

| Field | Backend Schema | Frontend Model | Impact |
|-------|---------------|----------------|--------|
| `tanks.stationId` | **Does not exist** in schema | `z.string()` (required) | Frontend expects `stationId` on tank but schema only has `branchId`; `data-source.ts` uses `data.stationId ?? ''` as workaround |
| `nozzles.pumpCode` | Schema has `pumpId` (UUID) | Model expects `pumpCode` (string) | `data-source.ts` maps `r.pumpCode` but API returns `pumpId`, causing mismatches |
| `suppliers.rating` | `varchar(32)` — no enum constraint | `z.enum(['Elite', 'Standard', 'At Risk'])` | DB accepts any string; frontend Zod validation rejects non-enum values |
| `credit_invoices.status` | Default `'unpaid'` (lowercase) | `z.enum(['Unpaid', 'Partial', 'Paid'])` (title case) | Case mismatch between DB defaults and frontend enum |

### 4.3 Cascade Delete Risks

**Sales Transaction Deletion**:
- Cascades: `saleItems`, `salePayments`, `receipts` ✅
- Does NOT cascade: `stock_ledger` entries referencing the sale ❌
- Does NOT cascade: `audit_log` entries referencing the sale ❌
- Does NOT cascade: `approval_requests` with `entityId` matching the sale ❌

**Shift Deletion**:
- Cascades: `shiftAssignments`, `meterReadings`, `shiftCollections` ✅
- Sets NULL on: `reconciliations.shiftId`, `salesTransactions.shiftId` ✅
- Does NOT cascade: `variances` referencing the shift ❌

**Company Deletion**:
- Restricts if stations exist ✅
- But ~15+ tables with `companyId` FK would become orphaned if the restriction were bypassed ❌

### 4.4 Missing Database Indexes

| Table | Recommended Index | Query Pattern |
|-------|------------------|---------------|
| `sales_transactions` | `(companyId, status)` or `(branchId, transactionDate, status)` | Filtering void/pending sales |
| `credit_invoices` | `(customerId, status)` | Customer aging and unpaid reports |
| `supplier_invoices` | `(supplierId, status)` | Supplier aging reports |
| `expense_entries` | `(category, createdAt)` or `(status, createdAt)` | Category rollups |
| `approval_requests` | `(requestedBy, status)` | User pending approval lists |
| `stock_ledger` | `(movementType, movementDate)` | Period-based stock queries |

### 4.5 Soft Delete Filtering Not Consistent

All tables have `deletedAt` columns but the `isNull(table.deletedAt)` filter is **not applied consistently** across all service queries. Some list operations may return soft-deleted records.

---

## 5. Testing Gaps

### 5.1 Backend Unit Tests

- Only **7 spec files** exist across `apps/api/src/modules/` for the 16 business modules:
  - `shifts/shifts.service.spec.ts`
  - `deliveries/deliveries.service.spec.ts`
  - `core/companies.service.spec.ts`
  - `governance/governance.service.spec.ts`
  - `governance/policy-evaluator.service.spec.ts`
  - `sales/sales.governance.spec.ts`
  - `expenses/expenses.governance.spec.ts`
- **9 modules have zero test coverage**: admin, audit, auth, credit, inventory, payables, reports, setup, transfers.
- Jest is configured (`apps/api/jest.config.js`) but overall coverage is minimal.

### 5.2 Backend E2E Tests

Only 3 E2E spec files exist under `apps/api/test/`:

| Test File | Coverage |
|-----------|----------|
| `auth-flow.e2e-spec.ts` | Login + token refresh (2 tests) |
| `reports-overview.e2e-spec.ts` | Reports overview endpoint (1 test) |
| `shifts-transaction.e2e-spec.ts` | Shift open flow (1 test) |

**Missing E2E tests for**: deliveries, expenses, inventory, payables, credit, audit, governance, sales, setup, core, admin, transfers, system modules.

### 5.3 Frontend Tests

- `lib/form-calcs.test.ts` uses a **hand-rolled test framework** (`describe`, `test`, `expect` defined manually with `console.log`) instead of Vitest/Jest.
- This test file is **not integrated** into any CI/CD pipeline.
- No component tests exist.

### 5.4 CI Pipeline Excludes E2E Tests

In `.github/workflows/ci.yml`, E2E tests are explicitly excluded:
```yaml
npm test -- --testPathIgnorePatterns=test/
```
The 3 E2E test files never run in CI.

---

## 6. CI/CD & Infrastructure Gaps

### 6.1 No Production Deployment Pipeline

- A staging deployment workflow exists (`.github/workflows/deploy-staging.yml`) but **no production deployment workflow** exists.
- No promotion path from staging → production is defined.

### 6.2 Migration Validation

- `deploy-staging.yml` runs migrations but does **not validate** success post-migration.
- No rollback strategy exists if a migration fails.
- No pre-migration database snapshot is taken.

### 6.3 Smoke Test Coverage

`scripts/smoke-test.sh` only checks 2–3 endpoints:
- Health check endpoint
- Web root
- Docs endpoint

**Missing**: Authentication flow, database operations, report generation, business logic verification.

### 6.4 Docker Configuration

| Service | Issue |
|---------|-------|
| Web (dev compose) | No healthcheck defined |
| Backup service (staging) | Healthcheck only verifies backup directory exists, not backup recency |
| Nginx | No HTTPS/SSL configured; only listens on port 80 |

### 6.5 Script Issues

| Script | Issue |
|--------|-------|
| `scripts/migrate.sh` | No logging of migration output; no timeout for hanging migrations |
| `scripts/backup-db.sh` | No validation of backup file integrity after pg_dump |
| `scripts/restore-db.sh` | No pre-restore backup of current database; no rollback on failure |
| `scripts/smoke-test.sh` | Temporary file `/tmp/ifms_smoke_body.txt` not cleaned up |

---

## 7. Security Gaps

### 7.1 Nginx Security Headers Missing

`nginx.conf` is missing all standard security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`
- `Strict-Transport-Security` (HSTS)
- No rate limiting on API proxy

### 7.2 Secrets in Version Control

- `apps/api/.env.staging` contains placeholder secrets (`SWAGGER_BASIC_PASS`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) committed to the repo.
- `docker-compose.staging.yml` references this file and contains a hardcoded database password (`change-me-staging-db-password`).
- `docker-compose.yml` uses a weak dev password: `POSTGRES_PASSWORD: ifms`.

### 7.3 Multi-Tenant Scope Enforcement

- Reports service (`apps/api/src/modules/reports/reports.controller.ts`) parses company/branch scope from JWT permissions via regex.
- However, scope enforcement is incomplete — a user could potentially pass a different `companyId` in query parameters and bypass scope restrictions if the regex parsing fails.
- No middleware-level multi-tenant isolation exists to ensure users only access their assigned company's data.

### 7.4 Token Revocation

`logout()` updates `revokedAt` in the database but the JWT remains valid until its natural expiration. No immediate cache invalidation or token blacklist mechanism exists.

### 7.5 Pagination Limits

No maximum `pageSize` is enforced. A client could request `pageSize=999999` and retrieve entire tables in a single request.

---

## 8. Cross-Cutting Concerns

### 8.1 Unused or Partially Used Services

| Service/Feature | Status |
|----------------|--------|
| `postReportAction()` in `lib/api/actions.ts` | Defined but never called from any component |
| `inventorySettings` table | Defined in schema but no service populates or reads it |
| `health_check` table | Schema exists but only updated via timestamps, never read |
| Gemini AI integration | Service exists but likely non-functional due to missing API key and incorrect package references |

### 8.2 N+1 Query Patterns

| Location | Issue |
|----------|-------|
| Sales detail view | Fetches transaction, items, and payments in 3 separate sequential queries |
| Transfer execution | Queries stations after branches sequentially instead of in parallel |

### 8.3 Missing Features

| Feature | Status |
|---------|--------|
| Password change | No endpoint; users cannot change their own password |
| User management | No CRUD; only seed scripts and admin reset |
| Role management | Governance references roles but no CRUD endpoints exist |
| Bulk operations | All create/update endpoints are single-item only |
| Soft-delete recovery | Records are soft-deleted but cannot be undeleted |
| Advanced search/filtering | Only basic `q` parameter for LIKE matching; no advanced filters |

---

## 9. Recommendations by Priority

### 🔴 Critical (Blocking or Data Integrity Risk)

1. **Fix GeneralSetupForm** — currently does not persist any data to the backend.
2. **Fix ExpenseEntryForm edit mode** — editing an expense doesn't call any update API.
3. **Remove hardcoded station `'s1'`** — use station from user context/session instead.
4. **Add missing FK on `expense_entries.categoryId`** → `expense_categories.id`.
5. **Validate product/tank existence** before creating sales and transfers.
6. **Connect sales to inventory** — create stock ledger entries when POS sales are processed.
7. **Add list/update/delete for Transfers module** — currently only create exists.
8. **Replace generic `throw new Error(...)` with typed NestJS exceptions** in all services.

### 🟠 High (Significant Feature Gaps)

9. Implement pages for the ~15 placeholder sidebar routes (inventory, transfers, payables).
10. Add composite database indexes for aging/status queries.
11. Add user management and password change endpoints.
12. Fix Gemini AI service configuration or disable the feature cleanly.
13. Implement proper error propagation in frontend forms (show actual API error messages).
14. Add HTTPS/TLS and security headers to nginx configuration.
15. Move secrets out of version control into CI/CD secrets management.

### 🟡 Medium (Operational & Quality)

16. Expand unit test coverage to the 9 untested API modules.
17. Enable E2E tests in the CI pipeline (remove `--testPathIgnorePatterns=test/`).
18. Replace hand-rolled test framework in `lib/form-calcs.test.ts` with Vitest.
19. Add production deployment workflow.
20. Add database migration validation and rollback strategy.
21. Enforce maximum pagination size on all list endpoints.
22. Standardize soft-delete filtering across all service queries.

### 🟢 Low (Polish & Maintenance)

23. Remove `console.log` statements from production components.
24. Fix query key consistency for React Query invalidation.
25. Add loading/disabled states during mutations on approval buttons.
26. Clean up unused `postReportAction()` function.
27. Add smoke tests for critical business paths.
28. Parallelize sequential database queries (N+1 patterns).

---

*End of Report*
