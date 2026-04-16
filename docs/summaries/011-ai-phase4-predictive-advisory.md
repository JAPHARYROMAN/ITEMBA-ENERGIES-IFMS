# 011 — AI Intelligence Layer Phase 4: Predictive & Advisory

**Date:** 2026-04-15
**Phase:** 4 of 4 — Predictive & Advisory
**Status:** ✅ Complete

---

## Overview

Implemented the Predictive & Advisory layer for the IFMS AI Intelligence system. This phase adds 5 forecasting/analytical tools that compute projections from historical database data and present results through a new `forecast` card type with clear "ESTIMATE" labeling and confidence indicators.

---

## New Tools (5 total → 17 cumulative)

| #   | Tool                 | Description                                                                     | Permission       |
| --- | -------------------- | ------------------------------------------------------------------------------- | ---------------- |
| 13  | `forecast_demand`    | Predict product reorder timing based on consumption rates from delivery history | `inventory:read` |
| 14  | `project_cashflow`   | Project daily cash inflows/outflows for 7–30 days based on recent averages      | `sales:read`     |
| 15  | `analyze_pricing`    | Revenue breakdown by product and payment type with pricing advisory             | `sales:read`     |
| 16  | `recommend_staffing` | Shift staffing recommendations based on revenue by shift type and day of week   | `shifts:read`    |
| 17  | `analyze_trends`     | Period-over-period trend analysis (sales, expenses, deliveries, credit)         | `sales:read`     |

---

## Backend Changes

### `apps/api/src/modules/ai/ai-chat.service.ts`

- Added 5 tool definitions to `TOOL_DEFINITIONS` array with Gemini function calling schemas
- Added `FORECAST_TOOLS` static array for card type routing
- Implemented 5 private methods:
  - `forecastDemand()` — Queries tanks + delivery history, calculates avg daily consumption, estimates days-until-reorder per tank/product, includes confidence level
  - `projectCashflow()` — Aggregates historical sales, expenses, and credit payments by active days, projects forward with daily granularity, calculates cumulative net position
  - `analyzePricing()` — Queries product catalog + sales aggregation by payment type, computes revenue share percentages
  - `recommendStaffing()` — Analyzes closed shifts by type and day-of-week, identifies peak/low revenue days, generates staffing recommendations
  - `analyzeTrends()` — Compares current vs previous period for any metric (sales/expenses/deliveries/credit), computes % change and trend direction
- Wired all 5 tools in `executeTool()` switch
- Updated card routing: forecast tools → `'forecast'` card type
- Updated system prompt with predictive capabilities section and ESTIMATE labeling instructions

### `apps/api/src/modules/ai/dto/chat.dto.ts`

- Added `'forecast'` to `ResponseCardDto.type` union

### Data Pattern

- All predictive methods return `{ _isEstimate: true, disclaimer: string, ... }`
- No external ML models — pure SQL aggregation + arithmetic projections
- Confidence levels: `'medium'` (≥30 days data), `'low'` (<30 days), `'insufficient-data'`
- Schema references: `Schema.payments` (credit), `Schema.expenseEntries`, `Schema.salesTransactions`, `Schema.shifts`, `Schema.deliveries`, `Schema.tanks`, `Schema.products`, `Schema.creditInvoices`

---

## Frontend Changes

### `components/AiCommandPanel.tsx`

- Added `ForecastCard` component with:
  - Indigo-themed border and background for visual distinction
  - "ESTIMATE" badge (amber) in header
  - Analysis window display
  - Trend change indicator with `TrendingUp`/`TrendingDown`/`Minus` icons
  - Auto-layout for scalar fields, nested objects (summary/recommendations), and array data (mini-tables)
  - Amber disclaimer footer with `Info` icon
- Wired `'forecast'` case in `ResponseCards` switch
- Added 4 new icon imports: `TrendingUp`, `TrendingDown`, `Minus`, `Info`
- Updated `CHIPS_BY_PAGE`:
  - Dashboard: +3 predictive chips (demand forecast, cashflow projection, sales trend)
  - Sales: +2 (pricing analysis, sales trend)
  - Inventory: +2 (reorder timing, demand forecast)
  - Expenses: +1 (expense trend)
  - Shifts: +2 (staffing recommendations, peak days)
  - Deliveries: +1 (delivery trend)
  - Credit: +1 (credit trend)

### `lib/hooks/useAiChat.ts`

- Added `'forecast'` to `ResponseCard.type` union

### `lib/locales/en.json`

- Added 5 new i18n keys: `estimate`, `analysisWindow`, `forecastDisclaimer`, `confidence`, `daysUntilReorder`, `projectedNet`
- Updated `emptyDescription` to include forecasts and trend analysis

---

## Risk Mitigation

Per the blueprint's "Medium" risk rating for predictions:

1. **All results labeled as estimates** — `_isEstimate: true` flag + disclaimer text
2. **Visual distinction** — ForecastCard uses indigo theme + amber ESTIMATE badge
3. **System prompt enforced** — Gemini instructed to use hedging language ("estimated", "projected", "based on last X days")
4. **Confidence indicators** — Each result includes confidence level based on data availability
5. **No automated actions** — Predictions are advisory only, no writes triggered

---

## Test Results

| Suite             | Passed | Total |
| ----------------- | ------ | ----- |
| Backend (Jest)    | 53     | 53    |
| Frontend (Vitest) | 17     | 17    |
| TypeScript errors | 0      | 0     |

---

## Files Modified

| File                                         | Changes                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/api/src/modules/ai/ai-chat.service.ts` | +5 tool defs, +5 methods, +FORECAST_TOOLS array, card routing, system prompt |
| `apps/api/src/modules/ai/dto/chat.dto.ts`    | `'forecast'` card type                                                       |
| `components/AiCommandPanel.tsx`              | ForecastCard component, forecast case, predictive chips, icon imports        |
| `lib/hooks/useAiChat.ts`                     | `'forecast'` type                                                            |
| `lib/locales/en.json`                        | +5 i18n keys, updated empty description                                      |

---

## AI Intelligence Layer — Complete Summary

| Phase     | Feature                | Tools        | Card Types         | Status       |
| --------- | ---------------------- | ------------ | ------------------ | ------------ |
| 1         | Read-Only Intelligence | 7 query      | table, data, alert | ✅           |
| 2         | Report Generation      | 2 report     | download           | ✅           |
| 3         | Assisted Data Entry    | 3 write      | confirmation       | ✅           |
| 4         | Predictive & Advisory  | 5 forecast   | forecast           | ✅           |
| **Total** |                        | **17 tools** | **6 card types**   | **Complete** |
