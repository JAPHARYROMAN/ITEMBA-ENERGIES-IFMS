# IFMS AI Intelligence Layer — Design Blueprint

**Version:** 1.0  
**Date:** 2026-04-15  
**Status:** Draft — Awaiting approval before implementation

---

## 1. Vision

Transform the existing Gemini insights panel from a passive widget into a
**conversational command center** — a single interface where any user can query
data, enter transactions, generate reports, and receive proactive guidance using
plain language.

---

## 2. Core Capabilities

### A. Conversational Data Queries

Users ask questions; the AI translates them into the correct API calls, fetches
real data, and presents structured results (tables, charts, summaries).

| User says                                             | What happens                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| "How much diesel did we sell last week?"              | Queries sales by product + date range → total volume & revenue |
| "Which station had the highest revenue in March?"     | Aggregates revenue across branches → ranked list               |
| "Show me all unpaid credit invoices over 500,000 TZS" | Filters credit ledger by status + amount threshold             |
| "Current stock level for all tanks at Kariakoo?"      | Pulls live tank dip readings for that station                  |
| "Compare petrol sales this month vs last month"       | Two aggregations → delta + comparison card                     |

**Constraint:** The AI never fabricates data. Every number comes from an actual
API call. If data is unavailable, it says so.

---

### B. Natural Language Data Entry

Users dictate transactions; the AI pre-fills a confirmation card for review.

**Example flow:**

> **User:** "We received 20,000 litres of diesel from Oryx at Kariakoo today"
>
> **AI:** "I'll create a delivery record:
>
> - Supplier: Oryx Energies
> - Product: Diesel (AGO)
> - Quantity: 20,000 L
> - Station: Kariakoo
> - Date: Today
>
> **Should I submit this, or do you want to adjust anything?**"

**Candidate operations:**

- Record a delivery (GRN)
- Log an expense ("Spent 150,000 on generator maintenance at Mbezi")
- Open/close a shift
- Record a customer payment
- Adjust tank levels

**Excluded operations (manual-only):**

- Delete records
- Modify user roles / permissions
- Approve governance workflows
- Any action the user's role doesn't permit

---

### C. Report Generation & Delivery

> **User:** "Send me the March P&L report as PDF"
>
> **AI:** "Generating… Done. [Download PDF]. Want me to email it?"

> **User:** "Email the weekly sales summary to fatima@company.co.tz"
>
> **AI:** "I'll generate the weekly sales summary (Apr 7–13) and send it to
> fatima@company.co.tz. Confirm?"

Wires into the existing exports pipeline with a conversational front-end.

---

### D. Proactive Intelligence

The AI volunteers insights when patterns warrant attention. These appear as
dismissable cards in the AI panel, not disruptive pop-ups.

| Trigger                    | AI says                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tank below 20% capacity    | "Tank T2 (Petrol) at Kariakoo is at 18%. At current velocity you'll run dry in ~2 days. Draft a reorder?" |
| Unusual sales spike        | "Diesel at Tegeta is 40% above the 30-day average today."                                                 |
| Shift not closed on time   | "Day shift at Mbezi has been open for 14 hours. Reminder to close it?"                                    |
| Credit customer near limit | "Asha Logistics is at 92% of their 5M TZS credit limit."                                                  |
| Expense anomaly            | "Generator fuel at Ubungo is 3× the monthly average."                                                     |

---

## 3. Interface Design

### AI Panel Layout

Replace the current small insights widget with a **full-height sliding panel**
(right side, ~400px) that can expand to full-screen.

```
┌─────────────────────────────────────────────────────┐
│  💬 IFMS Command                            [↗] [×] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Response Card ────────────────────────────┐     │
│  │ 📊 Diesel sales last week: 45,200 L        │     │
│  │ Revenue: TZS 135,600,000                    │     │
│  │ ▸ Breakdown by station                      │     │
│  └────────────────────────────────────────────┘     │
│                                                     │
│  ┌─ Alert Card ───────────────────────────────┐     │
│  │ ⚠️ Tank T2 at Kariakoo is at 18%            │     │
│  │ [Draft Reorder]  [Dismiss]                  │     │
│  └────────────────────────────────────────────┘     │
│                                                     │
│  ┌─ Confirmation Card ────────────────────────┐     │
│  │ 📝 New Delivery                             │     │
│  │ Supplier: Oryx  │  Product: Diesel          │     │
│  │ Qty: 20,000 L   │  Station: Kariakoo        │     │
│  │ [Edit]  [Confirm & Submit]  [Cancel]        │     │
│  └────────────────────────────────────────────┘     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Today's sales] [Low stock] [Pending approvals]    │
├─────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────┐  [Send ➤]   │
│  │ Ask anything or give a command... │              │
│  └───────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

**Key UI elements:**

- **Response cards** — structured results (tables, mini-charts, summaries)
- **Confirmation cards** — for every write operation; user must approve before submission
- **Alert cards** — proactive insights with inline action buttons
- **Quick-action chips** — contextual suggestions below the conversation area
- **Context awareness** — panel knows which page the user is on

### Contextual Quick-Action Chips

Chips change based on the user's current page and role:

| Page      | Suggested chips                                                                              |
| --------- | -------------------------------------------------------------------------------------------- |
| Dashboard | `Today's sales summary` · `Low stock alerts` · `Pending approvals` · `Revenue vs yesterday`  |
| Sales     | `Top products this week` · `Credit sales breakdown` · `Sales by shift`                       |
| Inventory | `Tank levels summary` · `Products below reorder` · `Variance report` · `Upcoming deliveries` |
| Expenses  | `This month's total` · `By category` · `Pending entries`                                     |
| Shifts    | `Open shifts` · `Average shift duration` · `Unreconciled shifts`                             |

---

## 4. Architecture

### Request Flow

```
User message
    │
    ▼
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Frontend    │────▶│  AI Orchestrator  │────▶│  Gemini API  │
│  AI Panel    │     │  (NestJS)         │     │  (function   │
│              │◀────│                   │◀────│   calling)   │
└──────────────┘     └────────┬─────────┘     └──────────────┘
                              │
                     ┌────────▼─────────┐
                     │  Internal APIs   │
                     │  (same endpoints │
                     │   the UI uses)   │
                     └──────────────────┘
```

1. **User sends message** → Frontend posts to `/api/ai/chat`
2. **Orchestrator classifies intent** → Builds system prompt with available tools and user context
3. **Gemini selects tools** → Returns function call(s) with parameters
4. **Orchestrator executes** → Calls internal APIs using the user's auth token
5. **Response assembly** → Formats results into structured card JSON
6. **Return to frontend** → Panel renders typed response cards

### Tool Definitions

The AI's available tools map 1:1 to existing API endpoints, scoped by the
user's permissions.

| Tool name           | Maps to                                | Permission          |
| ------------------- | -------------------------------------- | ------------------- |
| `query_sales`       | `GET /api/sales`                       | `sales:read`        |
| `query_inventory`   | `GET /api/inventory/*`                 | `inventory:read`    |
| `query_deliveries`  | `GET /api/deliveries`                  | `deliveries:read`   |
| `query_customers`   | `GET /api/customers`                   | `customers:read`    |
| `query_expenses`    | `GET /api/expense-entries`             | `expenses:read`     |
| `query_reports`     | `GET /api/reports/*`                   | `reports:read`      |
| `query_shifts`      | `GET /api/shifts`                      | `shifts:read`       |
| `query_credit`      | `GET /api/credit-invoices`             | `credit:read`       |
| `create_delivery`   | `POST /api/deliveries`                 | `deliveries:create` |
| `create_expense`    | `POST /api/expense-entries`            | `expenses:create`   |
| `create_sale`       | `POST /api/pos/sale`                   | `sales:create`      |
| `record_payment`    | `POST /api/credit-invoices/*/payments` | `credit:create`     |
| `generate_report`   | `POST /api/exports`                    | `exports:create`    |
| `send_email_report` | `POST /api/exports` + email            | `exports:create`    |

The orchestrator dynamically filters this list so the AI only sees tools
matching the authenticated user's permissions.

---

## 5. Conversation Context

### Within a session

The AI maintains the thread, enabling follow-ups:

> **User:** "What were diesel sales last week?"  
> **AI:** "45,200 L — TZS 135.6M"  
> **User:** "And the week before?"  
> **AI:** "38,100 L — TZS 114.3M. That's an 18.6% increase week-over-week."

### Across sessions

Persist recent conversation summaries per user so the AI can reference prior
context:

> **AI:** "Last time you asked about Tegeta's diesel variance. The
> reconciliation was completed yesterday — variance is now within tolerance."

### Page context

When the user opens the panel, the frontend sends the current route and any
visible filters. This lets the AI ground its responses:

> _User is on Sales page, filtered to "Kariakoo" and "This week"_
>
> **User:** "Summarize this"  
> **AI:** _(knows the context)_ "Kariakoo this week: 312 transactions, TZS 47.2M revenue, top product Diesel at 62%."

---

## 6. Safety & Guardrails

| Rule                                          | Rationale                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| All writes require explicit confirmation card | Prevents accidental data entry from misunderstood prompts                              |
| Permission enforcement is server-side         | AI inherits the user's JWT — cannot bypass RBAC                                        |
| No delete operations via AI                   | Deletions remain manual-only through the UI                                            |
| Rate limiting on AI calls                     | Reuse existing throttler (10 req/min for AI endpoints)                                 |
| Audit logging for AI-initiated actions        | Every AI-triggered write gets audit entry tagged `source: ai-assistant`                |
| No PII sent to Gemini                         | Customer emails/phones are never included in the prompt — only IDs and aggregated data |
| Hallucination prevention                      | Responses must cite the data source; "no data found" if API returns empty              |
| Input sanitization                            | User messages are sanitized before inclusion in prompts to prevent injection           |
| Token budget management                       | Conversation history is summarized when exceeding token limits                         |

---

## 7. Phased Rollout

### Phase 1 — Read-Only Intelligence (2–3 weeks)

- New sliding panel UI replacing the current Gemini widget
- Conversational queries across all modules
- Proactive insight cards (tank alerts, anomaly detection)
- Quick-action chips
- Conversation memory within session

**Risk:** Low — no writes, no data mutation, pure query layer.

### Phase 2 — Report Generation (1–2 weeks)

- "Generate X report" commands
- PDF/CSV delivery via existing export pipeline
- Email report delivery with confirmation
- Scheduled report requests ("Send me this every Monday")

**Risk:** Low — uses existing export system, only new path is email trigger.

### Phase 3 — Assisted Data Entry (2–3 weeks)

- Natural language → confirmation card for deliveries, expenses, payments, sales
- Edit capability on confirmation cards before submission
- Audit tagging for AI-initiated writes
- Undo/correction flow ("That was wrong, reverse the last entry")

**Risk:** Medium — writes to production data, mitigated by mandatory confirmation.

### Phase 4 — Predictive & Advisory (ongoing)

- Demand forecasting ("When should I reorder diesel for Kariakoo?")
- Cash flow projections
- Pricing analysis
- Shift staffing recommendations based on sales patterns
- Seasonal trend analysis

**Risk:** Medium — predictions can be wrong, must be clearly labeled as estimates.

---

## 8. Success Metrics

| Metric                  | Target                                                           | How to measure                                     |
| ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| Query accuracy          | >95% of AI responses return correct data                         | Sample audit of AI responses vs direct API calls   |
| Adoption rate           | >60% of daily active users interact with AI panel within 30 days | Track unique users per day hitting `/api/ai/chat`  |
| Time saved on reports   | 50% reduction in time from request to delivered report           | Compare export creation timestamps before/after    |
| Data entry speed        | 40% faster for common operations via AI vs forms                 | Timed user testing                                 |
| False positive alerts   | <10% dismissal rate on proactive insights                        | Track dismiss vs act-on ratio                      |
| Error rate on AI writes | <1% of confirmed submissions need correction                     | Track corrections within 1h of AI-initiated writes |

---

## 9. Technical Prerequisites

Before implementation begins, verify:

- [ ] Gemini API supports function calling in the model version we use
- [ ] API key quota is sufficient for projected usage (estimate: 500–2,000 calls/day)
- [ ] All query endpoints support the filter parameters the AI tools will need
- [ ] WebSocket or SSE available for streaming long AI responses
- [ ] Email transport is configured and tested for report delivery

---

## 10. Open Questions

1. **Streaming vs batch responses?** — Streaming (SSE) gives a better UX for long answers but adds complexity.
2. **Multi-language support?** — Should the AI respond in Swahili if the user writes in Swahili?
3. **Voice input?** — Browser speech-to-text as an input option for the chat?
4. **Offline behavior?** — What does the AI panel show when there's no connectivity?
5. **Cost management?** — Per-query cost tracking and monthly budget caps?

---

## Appendix: Comparison with Current State

| Capability                  | Current                                               | After Phase 1                                 | After Phase 3                    |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------- | -------------------------------- |
| Ask "how much diesel sold?" | Navigate to Reports → filter → read                   | Type question → get answer                    | Same                             |
| Record a delivery           | Navigate to Deliveries → New → fill 8 fields → submit | Same (forms still available)                  | Say it in one sentence → confirm |
| Get alerted on low stock    | Check inventory page manually                         | Proactive card appears automatically          | Same                             |
| Generate a PDF report       | Exports page → select type → wait → download          | "Give me the March P&L" → download            | Same                             |
| Email a report              | Generate → download → open email → attach → send      | "Email sales summary to fatima@..." → confirm | Same                             |
