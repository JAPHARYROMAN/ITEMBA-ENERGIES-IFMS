# 008 — AI Phase 1: Read-Only Intelligence Layer

**Date:** 2026-04-15  
**Scope:** Replace minimal Gemini widget with full conversational AI command panel  
**Risk:** Low — read-only queries, no data mutation

---

## What Changed

### Backend — New AI Chat Service

| File                                         | Action       | Description                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/ai/dto/chat.dto.ts`    | **Created**  | Request/response DTOs with class-validator (`ChatRequestDto`, `ChatMessageDto`, `ResponseCardDto`). Message capped at 2000 chars.                                                                                               |
| `apps/api/src/modules/ai/ai-chat.service.ts` | **Created**  | Core service: Gemini 2.0 Flash with function calling. 7 tool definitions querying DB directly via Drizzle ORM. Two-pass call pattern (tool selection → result → NL summary). Proactive insights for low tanks & overdue shifts. |
| `apps/api/src/modules/ai/ai.controller.ts`   | **Modified** | Added `POST /ai/chat` (conversational, 10 req/min) and `GET /ai/insights/proactive` (5 req/min). Both use `@CurrentUser()` for permission-aware tool filtering.                                                                 |
| `apps/api/src/modules/ai/ai.module.ts`       | **Modified** | Registered `AiChatService` in providers/exports.                                                                                                                                                                                |
| `apps/api/package.json`                      | **Modified** | Added `@google/genai@1.41.0` as direct dependency.                                                                                                                                                                              |

### Frontend — AI Command Panel

| File                            | Action       | Description                                                                                                                                                                                                                        |
| ------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/AiCommandPanel.tsx` | **Created**  | Full-height sliding panel (400px, expandable to 700px). Conversation UI with user/assistant bubbles, response cards (table/data/alert), context-aware quick-action chips, proactive insight cards, typing indicator. Esc to close. |
| `lib/hooks/useAiChat.ts`        | **Created**  | Custom hook: message state, `sendMessage()` via `apiClient.post('ai/chat')`, `fetchProactiveInsights()` via `apiClient.get('ai/insights/proactive')`, `clearConversation()`. Session-scoped memory (in-memory).                    |
| `store.ts`                      | **Modified** | Added `isAiPanelOpen`, `toggleAiPanel()`, `setAiPanelOpen()` to `useAppStore`.                                                                                                                                                     |
| `components/Header.tsx`         | **Modified** | Added Sparkles icon button for AI panel toggle with active state indicator.                                                                                                                                                        |
| `components/Layout.tsx`         | **Modified** | Renders `<AiCommandPanel />` as overlay.                                                                                                                                                                                           |
| `components/Dashboard.tsx`      | **Modified** | Removed `<GeminiInsights />` import and rendering. Chart section expanded to full width.                                                                                                                                           |
| `lib/locales/en.json`           | **Modified** | Added `ai.*` i18n keys (title, subtitle, placeholder, empty states, etc.).                                                                                                                                                         |

---

## 7 AI Tool Definitions

| Tool                     | Database Table                 | Permission        | Purpose                                                     |
| ------------------------ | ------------------------------ | ----------------- | ----------------------------------------------------------- |
| `query_sales_summary`    | `salesTransactions`            | `sales:read`      | Revenue totals, counts, averages, breakdown by payment type |
| `query_inventory_levels` | `tanks` + `products`           | `inventory:read`  | Tank fill levels, capacity, product info                    |
| `query_shifts`           | `shifts`                       | `shifts:read`     | Shift status, times, variance amounts                       |
| `query_deliveries`       | `deliveries` + `products`      | `deliveries:read` | Delivery notes, ordered/received quantities                 |
| `query_credit_invoices`  | `creditInvoices` + `customers` | `credit:read`     | Invoice balances, overdue detection                         |
| `query_customers`        | `customers`                    | `credit:read`     | Credit limits, balances, utilization %                      |
| `query_variances`        | `variances` + `tanks`          | `inventory:read`  | Volume/value variances by classification                    |

---

## Architecture

```
User types question in AI Panel
    → POST /api/ai/chat { message, history, pageContext }
    → AiChatService filters tools by user permissions
    → Gemini 2.0 Flash selects tool + args (function calling)
    → Service executes direct DB query via Drizzle ORM
    → Tool result sent back to Gemini for NL summary
    → Response with text + structured cards returned to frontend
    → AiCommandPanel renders message bubble + response cards
```

---

## Quick-Action Chips (Context-Aware)

| Page      | Chips                                                                                |
| --------- | ------------------------------------------------------------------------------------ |
| Dashboard | Today's sales summary · Low stock alerts · Revenue vs yesterday · Pending approvals  |
| Sales     | Top products this week · Credit sales breakdown · Sales by shift · Today's revenue   |
| Inventory | Tank levels summary · Variance report · Products below reorder · Upcoming deliveries |
| Expenses  | This month's expenses · Expenses by category · Pending entries                       |
| Shifts    | Open shifts · Average shift duration · Unreconciled shifts                           |

---

## Proactive Insights

- **Low Tank Levels:** Automatically detects tanks below 20% capacity
- **Overdue Shifts:** Flags shifts open longer than 12 hours

---

## Verification

| Check                   | Result          |
| ----------------------- | --------------- |
| Backend `tsc --noEmit`  | ✅ Zero errors  |
| Backend `npm test`      | ✅ 53/53 passed |
| Frontend `tsc --noEmit` | ✅ Zero errors  |
| Frontend `vitest run`   | ✅ 17/17 passed |

---

## What's NOT Included (Future Phases)

- Phase 2: Report generation/PDF/email via AI
- Phase 3: Write operations (deliveries, expenses, payments via NL)
- Phase 4: Predictive analytics, demand forecasting
- SSE streaming responses
- Server-side conversation persistence
- Voice input / Swahili AI responses
