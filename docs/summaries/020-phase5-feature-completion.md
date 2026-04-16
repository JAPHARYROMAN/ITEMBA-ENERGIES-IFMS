# 020 — Phase 5: Feature Completion & Backend Hardening

## Overview
Phase 5 closes out all remaining feature gaps identified in `unimplemented_features.md` and `code-gap-analysis.md`. Of 22 listed features, 16 were verified as already existing; this phase addressed the remaining 6 backend hardening items and built 12 frontend pages to replace ModulePlaceholder catch-all routes.

## Phase 5A — Backend Hardening

### 5A-1: User Phone + FCM Token Schema
- **Files**: `apps/api/src/database/schema/auth/users.ts`, `apps/api/drizzle/0010_user_phone_push_token.sql`
- Added `phone` (varchar 20) and `fcm_token` (varchar 512) columns to users table
- Created migration 0010

### 5A-2: SMS Delivery in Outbox Worker
- **File**: `apps/api/src/modules/notifications/outbox.worker.ts`
- `processSmsDelivery()` now queries `users.phone` from DB
- Calls `SmsTransport.send()` with user's phone number
- Marks delivery FAILED with clear message when no phone is on file

### 5A-3: Push Notification Transport (FCM HTTP v1)
- **New File**: `apps/api/src/modules/notifications/transports/push.transport.ts`
- Full FCM HTTP v1 implementation with OAuth2 JWT token exchange
- `PushMessage` interface: `{ to, title, body, data? }`
- Reads `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_KEY` from ConfigService
- Token caching with automatic refresh on expiry
- Dev fallback: logs to console when FCM not configured
- **File**: `apps/api/src/modules/notifications/notifications.module.ts` — registered PushTransport
- **File**: `apps/api/src/modules/notifications/outbox.worker.ts` — `processPushDelivery()` queries `users.fcmToken`, calls PushTransport

### 5A-4: Rate Limiting on Write Endpoints
Applied `@Throttle({ default: { limit: 10, ttl: 60_000 } })` across 6 controllers:

| Controller | Endpoints Throttled |
|---|---|
| `transfers.controller.ts` | POST tank-to-tank, POST station-to-station |
| `adjustments.controller.ts` | POST |
| `inventory.controller.ts` | POST dips, POST reconciliations |
| `sales.controller.ts` | POST pos (20/min), POST void (10/min) |
| `deliveries.controller.ts` | POST, POST :id/grn |
| `governance.controller.ts` | createPolicy, createApproval, approve, reject |

### 5A-5: NestJS Exception Classes (Already Complete)
Verified all 4 service files (sales, transfers, expenses, shifts) already use `BadRequestException`, `NotFoundException`, `InternalServerErrorException` — no raw `throw new Error()` found.

## Phase 5B — Frontend Repositories

**File**: `lib/repositories.ts` — Added 9 new repository objects:

| Repository | API Endpoint | Pattern |
|---|---|---|
| `dipRepo` | `inventory/dips` | `listAll<T>` |
| `reconciliationRepo` | `inventory/reconciliations` | `listAll<T>` |
| `varianceRepo` | `inventory/variances` | `listAll<T>` |
| `transferRepo` | `transfers` | `listAll<T>` |
| `adjustmentRepo` | `adjustments` | `listAll<T>` |
| `supplierInvoiceRepo` | `supplier-invoices` | `listAll<T>` |
| `payablesAgingRepo` | `payables/aging` | `apiFetch<T>` |
| `creditAgingRepo` | `credit/aging` | `apiFetch<T>` |
| `expenseCategoryRepo` | `expense-categories` | `listAll<T>` + `create` |

All repos convert API string amounts to `Number()` and dates to ISO format.

## Phase 5C — 12 Frontend Pages

### Table Pages (GenericTablePage pattern)
| Page | File | Form Component |
|---|---|---|
| `DipsPage` | `components/pages/DipsPage.tsx` | `DipForm.tsx` |
| `ReconciliationsPage` | `components/pages/ReconciliationsPage.tsx` | `ReconciliationForm.tsx` |
| `VariancesPage` | `components/pages/VariancesPage.tsx` | (read-only) |
| `TankToTankTransfersPage` | `components/pages/TankToTankTransfersPage.tsx` | `TankToTankTransferForm.tsx` |
| `StationToStationTransfersPage` | `components/pages/StationToStationTransfersPage.tsx` | `StationToStationTransferForm.tsx` |
| `AdjustmentsPage` | `components/pages/AdjustmentsPage.tsx` | `AdjustmentForm.tsx` |
| `SuppliersPage` | `components/pages/SuppliersPage.tsx` | (read-only) |
| `SupplierInvoicesPage` | `components/pages/SupplierInvoicesPage.tsx` | (read-only) |
| `SalesTransactionsPage` | `components/pages/SalesTransactionsPage.tsx` | (read-only) |
| `ExpenseCategoriesPage` | `components/pages/ExpenseCategoriesPage.tsx` | `ExpenseCategoryForm.tsx` |

### Custom Aging Pages (bar visualization + table)
| Page | File |
|---|---|
| `PayablesAgingPage` | `components/pages/PayablesAgingPage.tsx` |
| `CreditAgingPage` | `components/pages/CreditAgingPage.tsx` |

Both aging pages include:
- 4 summary metric cards (Total Outstanding, As Of, Buckets, Total Accounts/Invoices)
- Horizontal bar chart visualization of bucket proportions
- Full HTML table with bucket, days range, amount, count, % of total
- Loading skeleton + error boundary

### New Form Components (6 total)
- `components/forms/DipForm.tsx`
- `components/forms/ReconciliationForm.tsx`
- `components/forms/TankToTankTransferForm.tsx`
- `components/forms/StationToStationTransferForm.tsx`
- `components/forms/AdjustmentForm.tsx`
- `components/forms/ExpenseCategoryForm.tsx`

All forms use `react-hook-form`, `@tanstack/react-query` mutation, and the existing IFMS design system classes.

## Phase 5D — Route Registration

**File**: `App.tsx`
- Added 12 page imports
- Created `inventory/*` route group: dips, reconciliation, variance
- Created `transfers/*` route group: tank-to-tank, station-to-station, adjustments
- Created `payables/*` route group: suppliers, invoices, aging
- Added `transactions` route inside existing `sales/*` group
- Added `aging` route inside existing `credit/*` group
- Added `categories` route inside existing `expenses/*` group
- All routes wrapped in `PermissionProtectedRoute` with appropriate permission groups

## Files Changed (34 total)

### Backend (8 files)
- `apps/api/src/database/schema/auth/users.ts` — added phone + fcmToken columns
- `apps/api/drizzle/0010_user_phone_push_token.sql` — new migration
- `apps/api/src/modules/notifications/outbox.worker.ts` — SMS + push delivery logic
- `apps/api/src/modules/notifications/transports/push.transport.ts` — new FCM transport
- `apps/api/src/modules/notifications/notifications.module.ts` — registered PushTransport
- `apps/api/src/modules/transfers/transfers.controller.ts` — @Throttle on 2 endpoints
- `apps/api/src/modules/transfers/adjustments.controller.ts` — @Throttle on 1 endpoint
- `apps/api/src/modules/inventory/inventory.controller.ts` — @Throttle on 2 endpoints
- `apps/api/src/modules/sales/sales.controller.ts` — @Throttle on 2 endpoints
- `apps/api/src/modules/deliveries/deliveries.controller.ts` — @Throttle on 2 endpoints
- `apps/api/src/modules/governance/governance.controller.ts` — @Throttle on 4 endpoints

### Frontend (26 files)
- `lib/repositories.ts` — 9 new repos
- `App.tsx` — 12 new imports + 12 new routes + 3 new route groups
- 12 new page components in `components/pages/`
- 6 new form components in `components/forms/`

## Verification
- All TypeScript files compile with zero errors
- Column definitions use correct `accessorKey` + `cell` interface matching `DataTable.Column<T>`
- Permission groups reference `permissionGroups.X` from `lib/permissions.ts`
- All repos follow existing `listAll<T>` / `apiFetch<T>` patterns
