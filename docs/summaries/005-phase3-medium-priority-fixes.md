# 005 — Phase 3: Medium-Priority Backlog Fixes

**Phase:** 3 of 4 (Medium-Priority)  
**Audit Items:** #12 – #20  
**Status:** ✅ Complete (9/9 items)

---

## Summary

Phase 3 addresses all 9 medium-priority items identified in the system-wide code audit (`002-system-code-audit.md`). These changes improve maintainability, accessibility, infrastructure readiness, and developer experience.

---

## Items Implemented

### #12 — Centralized Constants File

**File created:** `lib/constants.ts`  
**Files updated:** `DataTable.tsx`, `ExportButton.tsx`, `FilterBar.tsx`, `Dashboard.tsx`, `POSPage.tsx`, `CloseShiftForm.tsx`

Extracted hardcoded magic numbers into named constants:
| Constant | Value | Usage |
|---|---|---|
| `DEFAULT_PAGE_SIZE` | `10` | DataTable initial page size |
| `PAGE_SIZE_OPTIONS` | `[10, 20, 50, 100]` | DataTable page size selector |
| `DASHBOARD_CHART_MONTHS` | `7` | Dashboard chart slice window |
| `MAX_DISCOUNT` | `50` | POS discount Zod ceiling |
| `QUICK_PAYMENT_PRESETS` | `[20, 50, 100]` | POS quick-pay buttons |
| `CLOSE_SHIFT_DRAFT_KEY` | `'ifms-close-shift-draft'` | CloseShift localStorage key |
| `EXPORT_POLL_INTERVAL_MS` | `1800` | Export status poll interval |
| `EXPORT_INITIAL_DELAY_MS` | `1000` | Export initial poll delay |
| `DATE_PRESETS` | `[7, 30, 90]` | FilterBar date range presets |

---

### #13 — localStorage Versioning & Error Handling

**File created:** `lib/storage.ts`  
**Files updated:** `CloseShiftForm.tsx`, `index.tsx`

- Created `getStorageItem<T>(key)`, `setStorageItem(key, value)`, `removeStorageItem(key)` with try/catch JSON handling
- `migrateStorageIfNeeded()` compares `CURRENT_STORAGE_VERSION` against stored version; clears all `ifms-` prefixed keys on mismatch
- Called at app startup in `index.tsx`
- Replaced all raw `localStorage` calls in `CloseShiftForm.tsx`

---

### #14 — Component Decomposition

**File created:** `components/pos/POSReceiptModal.tsx`  
**File updated:** `components/pos/POSPage.tsx`

- Extracted 60-line receipt modal into `POSReceiptModal` component
- Props: `{ receipt, totalDue, onClose }`
- POSPage reduced from ~465 to ~360 lines
- Cleaned up unused imports (`CheckCircle2`, `User`, `X`, `AlertCircle`)

---

### #15 — Accessibility: aria-labels on Interactive Elements

**Files updated:** `FilterBar.tsx`, `DataTable.tsx`, `Dashboard.tsx`, `POSReceiptModal.tsx`

Added `aria-label` attributes to:

- FilterBar: search input, date preset buttons, filters toggle, export button
- DataTable: CSV export button
- Dashboard: Export PDF button, Generate Report button
- POSReceiptModal: print button

---

### #16 — Report Services Facade

**File created:** `apps/api/src/modules/reports/reports-facade.service.ts`  
**File updated:** `apps/api/src/modules/reports/reports.module.ts`

- Unified `ReportsFacade` wrapping `ReportsService` and `ReportsRefreshService`
- Methods: `getOverview`, `getDailyOperations`, `getStockLoss`, `getProfitability`, `getCreditCashflow`, `getStationComparison`, `refreshMaterializedViews`
- Registered as provider and export in `reports.module.ts`

---

### #17 — WebSocket Upgrade Headers in nginx

**File updated:** `nginx.conf`

Added to both `/api/` and `/` location blocks:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

Enables WebSocket connections for real-time notification transport.

---

### #18 — Refresh Token Cleanup Cron Job

**File created:** `apps/api/src/modules/auth/token-cleanup.service.ts`  
**File updated:** `apps/api/src/modules/auth/auth.module.ts`

- `@Cron('0 3 * * *')` — runs nightly at 03:00 UTC
- Deletes refresh tokens where `expiresAt < now()` OR `revokedAt IS NOT NULL`
- Logs deleted count; registered as provider in `auth.module.ts`
- `ScheduleModule.forRoot()` already in `app.module.ts`

---

### #19 — useCurrency() Universal Adoption

**Files updated:** `POSPage.tsx`, `POSReceiptModal.tsx`, `CloseShiftForm.tsx`, `CreditInvoiceForm.tsx`

Replaced all hardcoded `$` currency formatting with the `useCurrency()` hook:

- POSPage: product labels, price display, discount, total
- POSReceiptModal: total due, payment amounts
- CloseShiftForm: expected revenue, collected, variance (ComputedFieldBlock + receipt)
- CreditInvoiceForm: customer limit dropdown, subtotal/tax/total, aging forecast

---

### #20 — Server-Side Pagination Support

**File updated:** `components/ifms/DataTable.tsx`

Added optional `serverPagination` prop to `IFMSDataTable`:

```typescript
export interface ServerPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}
```

Behavior when `serverPagination` is provided:

- Skips client-side sorting and slicing — data is used as-is from the API
- Uses `serverPagination.total` for entry count display
- Page navigation and page size changes emit callbacks instead of managing local state
- Fully backward-compatible — existing client-side usage unchanged
- Replaced hardcoded `[10, 20, 50, 100]` with `PAGE_SIZE_OPTIONS` constant

---

## Files Changed (Phase 3)

| File                                                     | Action   |
| -------------------------------------------------------- | -------- |
| `lib/constants.ts`                                       | Created  |
| `lib/storage.ts`                                         | Created  |
| `components/pos/POSReceiptModal.tsx`                     | Created  |
| `apps/api/src/modules/reports/reports-facade.service.ts` | Created  |
| `apps/api/src/modules/auth/token-cleanup.service.ts`     | Created  |
| `components/ifms/DataTable.tsx`                          | Modified |
| `components/ifms/ExportButton.tsx`                       | Modified |
| `components/ifms/FilterBar.tsx`                          | Modified |
| `components/Dashboard.tsx`                               | Modified |
| `components/pos/POSPage.tsx`                             | Modified |
| `components/forms/CloseShiftForm.tsx`                    | Modified |
| `components/forms/CreditInvoiceForm.tsx`                 | Modified |
| `apps/api/src/modules/reports/reports.module.ts`         | Modified |
| `apps/api/src/modules/auth/auth.module.ts`               | Modified |
| `nginx.conf`                                             | Modified |
| `index.tsx`                                              | Modified |

---

## Audit Score Impact

| Dimension       | Before | After | Notes                                               |
| --------------- | ------ | ----- | --------------------------------------------------- |
| Maintainability | 5/10   | 7/10  | Constants, storage utils, component decomposition   |
| Accessibility   | 4/10   | 6/10  | aria-labels on key interactive elements             |
| Infrastructure  | 6/10   | 8/10  | WebSocket headers, token cleanup, server pagination |
| Architecture    | 6/10   | 7/10  | Facade pattern, decomposed components               |

**Estimated composite score: 7.5/10** (up from 6.5/10 at audit baseline)
