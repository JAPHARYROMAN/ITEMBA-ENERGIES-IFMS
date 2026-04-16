# 009 — AI Phase 2: Report Generation & Email Delivery

**Date:** 2026-04-15  
**Scope:** Add report generation and email delivery capabilities to the AI command panel  
**Risk:** Low — leverages existing export pipeline, no new data mutation paths

---

## What Changed

### Backend

| File                                         | Action       | Description                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/ai/ai-chat.service.ts` | **Modified** | Added 2 new tool definitions (`generate_report`, `email_report`). Injected `ExportsService` + `EmailTransport`. Added `generateReport()`, `emailReport()`, and `pollAndEmailReport()` methods. Updated system prompt with report instructions. Extended `ToolContext` with `email` field. Updated `executeTool` to pass context and route new tools. |
| `apps/api/src/modules/ai/ai.controller.ts`   | **Modified** | Now passes `user.email` in `ToolContext` to both `chat()` and `getProactiveInsights()`.                                                                                                                                                                                                                                                              |
| `apps/api/src/modules/ai/ai.module.ts`       | **Modified** | Imports `ExportsModule` and `NotificationsModule` so `ExportsService` and `EmailTransport` are injectable.                                                                                                                                                                                                                                           |
| `apps/api/src/modules/ai/dto/chat.dto.ts`    | **Modified** | Added `'download'` to `ResponseCardDto.type` union.                                                                                                                                                                                                                                                                                                  |

### Frontend

| File                            | Action       | Description                                                                                                                                                                                                                                                  |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/AiCommandPanel.tsx` | **Modified** | Added `DownloadCard` component with status polling, download button, email indicator. Added `'download'` case to `ResponseCards`. Added report-page quick-action chips. New imports: `FileDown`, `Mail`, `Loader2`, `CheckCircle2`, `XCircle`, `apiExports`. |
| `lib/hooks/useAiChat.ts`        | **Modified** | Added `'download'` to `ResponseCard.type` union.                                                                                                                                                                                                             |
| `lib/locales/en.json`           | **Modified** | Added 7 new i18n keys: `ai.report`, `ai.reportFormat`, `ai.reportStatus`, `ai.reportReady`, `ai.reportFailed`, `ai.reportGenerating`, `ai.reportEmailTo`, `ai.downloadReport`. Updated `ai.emptyDescription` to mention reports.                             |

---

## 2 New AI Tool Definitions

| Tool              | Permission     | Purpose                                                                                                 |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| `generate_report` | `reports:read` | Queue a report export (PDF/CSV) via existing ExportsService pipeline. Returns exportId + download card. |
| `email_report`    | `reports:read` | Same as generate_report + fire-and-forget background polling → email via EmailTransport when ready.     |

### Report Types Available via AI

| Type                 | Description                 |
| -------------------- | --------------------------- |
| `overview`           | Business overview with KPIs |
| `daily-operations`   | Shift and pump performance  |
| `stock-loss`         | Tank losses and shrinkage   |
| `profitability`      | Margins and P&L             |
| `credit-cashflow`    | AR/AP aging and cash flow   |
| `station-comparison` | Ranked station performance  |

---

## Architecture

```
User: "Generate the March profitability report as PDF"
    → POST /api/ai/chat { message, history, pageContext }
    → Gemini selects generate_report tool with args
    → AiChatService.generateReport() calls ExportsService.createExport()
    → Export pipeline processes: generate → finalize → sign → publish
    → Returns download card with exportId + polling status
    → Frontend DownloadCard polls GET /api/exports/{id} every 2s
    → When status=ready, shows "Download Report" button
    → User clicks → apiExports.download() fetches blob + triggers browser save

User: "Email the daily operations report to fatima@company.co.tz"
    → Same as above + AiChatService.emailReport()
    → Fire-and-forget: pollAndEmailReport() polls DB every 2s (max 60s)
    → When export ready → EmailTransport.send() with download link
    → Returns immediately with emailStatus: 'queued'
```

---

## DownloadCard Component

- Shows report type, format (PDF/CSV), status
- Polls `apiExports.getById()` every 2s until ready/failed
- Ready state: green "Download Report" button
- Failed state: red status indicator
- Email variant shows recipient address
- Automatic cleanup on unmount (cancelled flag)

---

## Quick-Action Chips for Reports Page

When user navigates to `/app/reports`:

- Generate overview report PDF
- Generate profitability report
- Email daily operations report
- Generate stock loss report CSV
- Credit cashflow report
- Station comparison report

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

- Phase 3: Write operations (deliveries, expenses, payments via NL)
- Phase 4: Predictive analytics, demand forecasting
- Scheduled report requests ("Send me this every Monday") — deferred
- SSE streaming responses
- Server-side conversation persistence
