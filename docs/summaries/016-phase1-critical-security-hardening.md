# 016 — Phase 1: Critical Security Hardening

**Date:** 2025-01-16  
**Scope:** 12 CRITICAL audit findings from the enterprise audit (scored 58/100)  
**Impact:** Security, data integrity, tenant isolation, AI safety  

---

## Changes Summary

### 1. JWT Secret Defaults Removed (CRITICAL — Auth Bypass Risk)
**File:** `apps/api/src/common/env/env.schema.ts`  
- Removed `.default()` values from `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`  
- App now **fails to start** if these env vars are not explicitly set  
- Both secrets require minimum 32 characters

### 2. Hardcoded Admin Credentials Removed (CRITICAL — Credential Leak)
**Files:** `apps/api/src/database/reset-admin.ts`, `apps/api/src/database/seed.ts`  
- Removed hardcoded `romancodeafrica@gmail.com` / `geniouscode22`  
- Now reads from `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` env vars  
- Scripts exit early with clear error if env vars are missing  
- Updated both `.env.example` files with new variable placeholders

### 3. Financial CHECK Constraints (CRITICAL — Data Integrity)
**File:** `apps/api/drizzle/0008_audit_security_hardening.sql`  
Added 38 CHECK constraints across all financial tables:
- **Amounts:** `>= 0` for totals, balances, prices; `> 0` for payments, quantities  
- **Tables covered:** sales_transactions, sale_items, receipts, credit_invoices, customers, invoice_items, payments, payment_allocations, expense_entries, supplier_invoices, supplier_payments, supplier_payment_allocations, shift_collections, meter_readings, deliveries, grns, grn_allocations, products, tanks, stock_ledger, tank_dips, transfers

### 4. Cross-Tenant IDOR Fixed (CRITICAL — Data Leakage)
**8 services + 7 controllers updated:**

| Service | Method | File |
|---------|--------|------|
| SalesService | `findById(id, companyId?)` | `sales/sales.service.ts` |
| ShiftsService | `findById(id, companyId?)` | `shifts/shifts.service.ts` |
| DeliveriesService | `findById(id, companyId?)` | `deliveries/deliveries.service.ts` |
| CustomersService | `findById(id, companyId?)` | `credit/customers.service.ts` |
| CreditInvoicesService | `getById(id, companyId?)` | `credit/credit-invoices.service.ts` |
| SuppliersService | `findById(id, companyId?)` | `payables/suppliers.service.ts` |
| ProductsService | `findById(id, companyId?)` | `setup/products.service.ts` |
| TanksService | `findById(id, companyId?)` | `setup/tanks.service.ts` |

All corresponding controllers now pass `@Query('companyId')` to the service. TenantInterceptor auto-fills `companyId` for single-tenant users on GET requests.

### 5. AI /confirm Permission Enforcement (CRITICAL — Privilege Escalation)
**File:** `apps/api/src/modules/ai/ai-chat.service.ts`  
- Added `ACTION_PERMISSION_MAP` mapping each action to required permission:
  - `create_delivery` → `deliveries:write`
  - `create_expense` → `expenses:write`  
  - `record_payment` → `credit:write`
  - `void_sale` → `sales:void`
- `confirmWrite()` now checks `context.permissions` before executing any write

### 6. LLM Tool Argument Validation (CRITICAL — Injection Risk)
**File:** `apps/api/src/modules/ai/ai-chat.service.ts`  
Added validation helpers:
- `validateUuid()` — regex-enforced UUID format
- `validateDate()` — YYYY-MM-DD format + valid date check
- `validatePositiveNumber()` — finite, > 0
- `validateString()` — required, max-length truncation
- `validateOptionalUuid()`, `validateOptionalDate()` — nullable variants

Applied to all 4 `confirmWrite` actions (create_delivery, create_expense, record_payment, void_sale). All payload fields are now validated before reaching the database.

### 7. Export Signing Fail-Loud (CRITICAL — Compliance)
**File:** `apps/api/src/modules/exports/exports.compliance.service.ts`  
- Removed `buildFallbackCert()` which generated fake `IFMS-FALLBACK-CERT:...` strings
- When `SIGNING_CERT_PEM` is missing:
  - **Strict mode (default):** Throws `BadRequestException` — no unsigned exports
  - **Non-strict (`EXPORT_STRICT_SIGNING=false`):** Returns `UNSIGNED` profile with warning log

### 8. Audit Log Immutability (CRITICAL — Tamper-Proofing)
**File:** `apps/api/drizzle/0008_audit_security_hardening.sql`  
- Created `prevent_audit_log_mutation()` trigger function
- Trigger fires BEFORE UPDATE OR DELETE on `audit_log` → raises exception
- Changed `actorUserId` FK from `ON DELETE SET NULL` to `ON DELETE RESTRICT`

**Schema file:** `apps/api/src/database/schema/audit-log.ts`  
- Updated to reflect `onDelete: 'restrict'` for `actorUserId`

### 9. TypeScript Build Errors Fixed
**File:** `apps/api/src/modules/transfers/transfers.service.ts`  
- Fixed 4 `as unknown as any[]` casts on `tx.execute()` results
- Now properly accesses `.rows` property from Drizzle's QueryResult

**File:** `apps/api/tsconfig.json`  
- Added `esModuleInterop: true` for correct CJS module interop (fixes nodemailer import)

### 10. WebSocket CORS Hardened
**File:** `apps/api/src/modules/notifications/realtime.gateway.ts`  
- Replaced `origin: '*'` with dynamic origin checker
- Uses `FRONTEND_ORIGIN` env var (comma-separated allowlist)
- Rejects connections from unlisted origins with clear error

### 11. Schema: companyId Added to branches & audit_log
**Migration:** `apps/api/drizzle/0008_audit_security_hardening.sql`  
- `branches.company_id` — backfilled from stations, set NOT NULL + FK + index
- `audit_log.company_id` — nullable UUID + FK + index

**Schema files updated:**
- `apps/api/src/database/schema/core/branches.ts` — added `companyId` column, FK to companies, index
- `apps/api/src/database/schema/audit-log.ts` — added `companyId` column, FK to companies, index

### 12. Legacy Gemini Dead Code Removed
**Deleted files:**
- `components/GeminiInsights.tsx` — zero imports, non-functional (used `process.env` in browser)
- `services/geminiService.ts` — zero imports, broken (references unavailable Gemini model)

---

## Files Changed (30 files)

| Category | Files |
|----------|-------|
| **Security** | env.schema.ts, reset-admin.ts, seed.ts, .env.example (×2) |
| **Migration** | 0008_audit_security_hardening.sql, _journal.json |
| **Schema** | audit-log.ts, branches.ts |
| **Tenant isolation** | 8 service files, 7 controller files |
| **AI safety** | ai-chat.service.ts |
| **Compliance** | exports.compliance.service.ts |
| **WebSocket** | realtime.gateway.ts |
| **Build** | transfers.service.ts, tsconfig.json |
| **Cleanup** | GeminiInsights.tsx (deleted), geminiService.ts (deleted) |

---

## Remaining Work (Phase 2+)
- Supplier payments/invoices inline lookups need tenant filtering
- Expense entries inline lookups need tenant filtering  
- Products/Tanks `findByIdOrNull` methods need tenant filtering
- Nozzles/Pumps need station-scoped filtering (no companyId column)
- 4 orphan migration files not in Drizzle journal (0003–0006)
- Rate limiting tuning per endpoint
- Frontend error boundary improvements
