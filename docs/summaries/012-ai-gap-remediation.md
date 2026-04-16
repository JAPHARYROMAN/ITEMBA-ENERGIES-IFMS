# 012 — AI Intelligence Layer Gap Remediation

**Date:** 2026-04-15
**Scope:** Close all identified gaps between the AI blueprint and implemented features

---

## What Was Implemented

### 1. Proactive Insight Triggers (3 new alerts)

**File:** `apps/api/src/modules/ai/ai-chat.service.ts` → `getProactiveInsights()`

| Trigger                         | Condition                                          | Permission      |
| ------------------------------- | -------------------------------------------------- | --------------- |
| **Unusual Sales Spike**         | Today's sales ≥ 140% of 30-day daily average       | `sales:read`    |
| **Credit Customers Near Limit** | Active customers with balance ≥ 90% of creditLimit | `credit:read`   |
| **Expense Anomalies**           | Current month category spending ≥ 3× prior month   | `expenses:read` |

Proactive alerts now cover **5 triggers** total (low tanks, overdue shifts + 3 new).

### 2. Input Sanitization (Prompt Injection Defence)

**File:** `ai-chat.service.ts` → `sanitizeInput()`

- Strips "ignore previous instructions" and similar injection patterns
- Removes "you are now" / "act as" / "pretend to be" prompt hijacking
- Strips `system:` prefixes from user input
- Caps user message length at 4,000 characters
- Applied to every inbound `chat()` message before Gemini receives it

### 3. Token Budget Management

**File:** `ai-chat.service.ts` → `trimHistory()`

- **MAX_HISTORY_MESSAGES** = 20 (hard cap)
- **MAX_HISTORY_CHARS** = 24,000 (~6k tokens)
- When history exceeds the character budget, oldest messages are evicted
- A synthetic summary note of evicted messages is prepended for continuity
- Applied automatically in `chat()` before building Gemini contents

### 4. Undo / Correction Flow

**File:** `ai-chat.service.ts` → `undoLastWrite()`, `lastWrites` Map

- In-memory per-user tracking of the last AI-assisted write (action + entityId + timestamp)
- **10-minute undo window** — after that, undo is rejected
- New tool `undo_last_write` (tool #19) with `confirm` boolean parameter
- Two-step flow: first call returns what would be undone, second call with `confirm=true` executes
- Undo actions:
  - `create_delivery` → calls `deliveriesService.deleteDelivery()` (soft-delete + stock reversal)
  - `create_expense` → direct soft-delete via Drizzle (`SET deletedAt`)
  - `record_payment` → direct soft-delete via Drizzle (`SET deletedAt`)
- Audit trail: `userAgent: 'ai-assistant-undo'`

### 5. Void Sale Write Tool

**File:** `ai-chat.service.ts` → tool `void_sale` (#20)

- New write tool allowing AI to void/cancel sales transactions
- Requires `transactionId` and `reason` parameters
- Permission: `sales:void`
- Delegates to `SalesService.voidTransaction()` which handles governance approval flow
- Added to `WRITE_TOOLS` array for confirmation card rendering
- **DTO updated:** `ConfirmAction` type extended with `'void_sale'`
- **Module updated:** `SalesModule` imported into `AiModule`

### 6. Offline Behaviour (Frontend)

**File:** `components/AiCommandPanel.tsx`

- `useOnlineStatus()` hook using `useSyncExternalStore` + `navigator.onLine`
- Red offline banner with `WifiOff` icon: "AI is unavailable — you are offline"
- Text input and send button disabled when offline
- Uses `online`/`offline` window events for real-time detection

### 7. Multi-Language System Prompt

**File:** `ai-chat.service.ts` → `SYSTEM_PROMPT`

- Added instruction: respond in the user's language if they write non-English
- Technical terms (report names, tool references) kept in English
- Defaults to English when language is ambiguous

---

## Updated Metrics

| Metric             | Before   | After                                      |
| ------------------ | -------- | ------------------------------------------ |
| Tool definitions   | 17       | 20 (+undo, void_sale, updated permissions) |
| Proactive triggers | 2        | 5                                          |
| Write tools        | 3        | 4 (+ void_sale)                            |
| Card types         | 6        | 6 (unchanged)                              |
| Module imports     | 5        | 6 (+ SalesModule)                          |
| Backend tests      | 53/53 ✅ | 53/53 ✅                                   |
| Frontend tests     | 17/17 ✅ | 17/17 ✅                                   |
| TS errors          | 0        | 0                                          |

---

## Files Modified

| File                                         | Changes                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/ai/ai-chat.service.ts` | +3 proactive triggers, sanitizeInput(), trimHistory(), undoLastWrite(), void_sale tool, lastWrites Map, multi-language prompt, undo system prompt section |
| `apps/api/src/modules/ai/ai.module.ts`       | +SalesModule import                                                                                                                                       |
| `apps/api/src/modules/ai/dto/chat.dto.ts`    | ConfirmAction extended with `'void_sale'`                                                                                                                 |
| `components/AiCommandPanel.tsx`              | +useOnlineStatus hook, offline banner, input disabled when offline                                                                                        |
| `lib/locales/en.json`                        | +7 new AI locale keys (offline, confirmVoidSale, undoSuccess, etc.)                                                                                       |

---

## Remaining Items (Deferred)

| Feature                                | Reason                                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| Cross-session conversation persistence | Requires new DB table + migration — separate ticket               |
| Scheduled report delivery (cron)       | Requires cron infrastructure — separate ticket                    |
| SSE streaming responses                | Major architectural change — separate ticket                      |
| Voice input                            | Browser Speech API integration — separate ticket                  |
| Cost tracking per query                | Needs new DB table + Gemini billing integration — separate ticket |
| Open/close shift AI tools              | DTOs require physical nozzle meter readings — impractical for AI  |
