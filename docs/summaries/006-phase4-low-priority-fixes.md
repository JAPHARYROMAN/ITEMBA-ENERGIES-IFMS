# 006 — Phase 4: Low-Priority Fixes

**Date:** 2025-07-16
**Phase:** 4 of 4 — Low-Priority Enhancements
**Audit Items:** #21 – #25
**Status:** ✅ Complete

---

## Summary

Phase 4 closes out all 25 remediation items from the system-wide code audit
(`docs/summaries/002-system-code-audit.md`). These items focused on developer
experience, maintainability, performance polish, and long-term architecture.

---

## Item #21 — Complete i18n Adoption

**Goal:** Replace all hardcoded UI strings with translation keys via `react-i18next`.

### What changed

| Area               | Detail                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Locale file**    | `lib/locales/en.json` expanded from ~80 keys → 250+ keys across 22 namespaces (`common`, `auth`, `nav`, `header`, `dashboard`, `error`, `gemini`, `dataTable`, `filterBar`, `exportButton`, `commandMenu`, `pos`, `module`, `governance`, `notifications`, `forms`, `pages`, `expenseSummary`, `posPage`, `audit`, `users`, `customerMgmt`) |
| **Core shell**     | 11 components fully wired: `Dashboard`, `Header`, `ErrorBoundary`, `GeminiInsights`, `DataTable`, `FilterBar`, `ExportButton`, `CommandMenu`, `POSReceiptModal`, `ModulePlaceholder`, `Sidebar`                                                                                                                                             |
| **Pages**          | 7 page components with title/description/toast translations: `GenericTablePage`, `GovernanceApprovalsPage`, `NotificationsPage`, `ReportsOverview`, `ExportsPage`, `UsersRolesPage`, `AuditLogPage`                                                                                                                                         |
| **Forms**          | All 11 form components: success toast messages use `t('forms.saveSuccess', { entity })`                                                                                                                                                                                                                                                     |
| **POS & Expenses** | `POSPage`, `ExpenseSummaryDrawer`                                                                                                                                                                                                                                                                                                           |
| **Total**          | 35 / 35 component files with `useTranslation` or `Translation` render prop                                                                                                                                                                                                                                                                  |

### Notes

- `ErrorBoundary` is a class component → uses `<Translation>` render prop instead of the hook.
- Interpolation pattern `t('key', { entity })` used for dynamic toast messages.

---

## Item #22 — React.memo() Optimization

**Goal:** Wrap frequently re-rendered presentational components with `React.memo()`.

### Components wrapped

| File                                 | Component        |
| ------------------------------------ | ---------------- |
| `components/MetricsCard.tsx`         | `MetricsCard`    |
| `components/ifms/StatCard.tsx`       | `StatCard`       |
| `components/ifms/Breadcrumbs.tsx`    | `Breadcrumbs`    |
| `components/ifms/DataTableShell.tsx` | `DataTableShell` |
| `components/Sidebar.tsx`             | `Sidebar`        |
| `components/ifms/PageHeader.tsx`     | `PageHeader`     |

All are pure or nearly-pure presentational components receiving props from parent containers.

---

## Item #23 — Enable `no-raw-form-inputs` ESLint Rule

**Goal:** Wire the existing custom ESLint rule into the flat config.

### What changed

- **`eslint.config.js`:** Added `import noRawFormInputs from './eslint-rules/no-raw-form-inputs.js'`
- New config block scoped to `components/forms/**/*.{ts,tsx}` and `components/pos/**/*.{ts,tsx}`
- Rule registered as `ifms/no-raw-form-inputs` with severity `warn`

Developers will now see lint warnings when using raw `<input>` / `<select>` instead of the project's controlled form components.

---

## Item #24 — Swagger Response Decorators

**Goal:** Add `@ApiResponse` decorators to all NestJS controller endpoints.

### Controllers updated in this phase

| Controller              | Endpoints decorated                                                                |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `ai.controller.ts`      | `getInsights` — 200 / 429 / 401                                                    |
| `audit.controller.ts`   | `listLogs` — 200 / 401 / 403                                                       |
| `exports.controller.ts` | 7 `ExportsController` endpoints + 2 `PublicReportVerificationController` endpoints |

**Skipped:** `system.controller.ts` — uses `@ApiExcludeEndpoint()` intentionally (health/ops).

All 27 other controllers already had decorators from prior phases.

---

## Item #25 — Monorepo Shared Types

**Goal:** Extract framework-agnostic TypeScript interfaces into a shared package usable by both the frontend and the NestJS API.

### Structure created

```
shared/
  types/
    index.ts          # All shared interfaces & type aliases
    tsconfig.json      # Standalone TS config (declaration + declarationMap)
```

### Shared types catalogue

| Category      | Types                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| Auth & Users  | `Role`, `PermissionMatch`, `UserProfile`                                |
| Pagination    | `PaginatedResponse<T>`, `PaginationParams`                              |
| Financial     | `FinancialMetric`                                                       |
| Entities      | `BaseEntity`, `Product`, `Tank`, `Customer`, `Delivery`, `DeliveryItem` |
| Audit         | `AuditLogEntry`                                                         |
| Exports       | `ExportFormat`, `ExportStatus`, `ExportRecord`                          |
| Governance    | `ApprovalStatus`, `ApprovalRequest`, `ApprovalStep`                     |
| Notifications | `NotificationSeverity`, `NotificationType`, `Notification`              |

### Configuration changes

| File                     | Change                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.json` (root)   | Added `@shared/types` path alias → `./shared/types/index.ts`                                                                                               |
| `apps/api/tsconfig.json` | Added `@shared/types` path alias → `../../shared/types/index.ts`                                                                                           |
| `vite.config.ts`         | Added `@shared/types` resolve alias                                                                                                                        |
| `types.ts` (root)        | Re-exports all shared types; keeps React-dependent `SidebarItem`, `AppState`, `AuthState` local; aliases `UserProfile` → `User` for backward compatibility |

All existing `import { ... } from '@/types'` statements continue to work without changes.

---

## Audit Completion Status

| Phase                   | Items     | Status                    |
| ----------------------- | --------- | ------------------------- |
| **1 — Critical**        | #1 – #5   | ✅ Complete (summary 003) |
| **2 — High-Priority**   | #6 – #11  | ✅ Complete (summary 004) |
| **3 — Medium-Priority** | #12 – #20 | ✅ Complete (summary 005) |
| **4 — Low-Priority**    | #21 – #25 | ✅ Complete (this doc)    |

**All 25 audit remediation items are now complete.**

---

## Files touched (Phase 4)

<details>
<summary>Expand full list</summary>

- `lib/locales/en.json`
- `lib/i18n.ts`
- 35 component files (i18n wiring)
- 6 component files (React.memo wrapping)
- `eslint.config.js`
- `apps/api/src/modules/ai/ai.controller.ts`
- `apps/api/src/modules/audit/audit.controller.ts`
- `apps/api/src/modules/exports/exports.controller.ts`
- `shared/types/index.ts` (new)
- `shared/types/tsconfig.json` (new)
- `tsconfig.json`
- `apps/api/tsconfig.json`
- `vite.config.ts`
- `types.ts`

</details>
