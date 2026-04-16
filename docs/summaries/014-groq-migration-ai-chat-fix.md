# 014 — Groq Migration & AI Chat Runtime Fix

## Scope

Migrate AI backend from Google Gemini to Groq (Llama 3.3 70B) and resolve all runtime errors preventing AI chat from working in the browser.

## Root Causes Identified & Fixed

### 1. Gemini Free-Tier Quota Exhausted

- **Symptom:** 429 RESOURCE_EXHAUSTED on all Gemini API calls
- **Fix:** Migrated entirely to Groq provider

### 2. Provider Migration — Gemini → Groq

- **File:** `apps/api/src/modules/ai/ai-chat.service.ts`
- Replaced `GoogleGenAI` (`@google/genai`) with `Groq` (`groq-sdk`)
- Converted all 20 tool definitions from Gemini `Type.STRING/NUMBER/BOOLEAN/OBJECT` to JSON Schema `'string'/'number'/'boolean'/'object'` (67 replacements)
- Rewrote `chat()` method for OpenAI-compatible format:
  - `ChatCompletionMessageParam[]` with system/user/assistant roles
  - `client.chat.completions.create()` with `model: 'llama-3.3-70b-versatile'`
  - Function call handling via `tool_calls[0]` → `role: 'tool'` follow-up
- Model: `llama-3.3-70b-versatile` (replaces `gemini-2.0-flash`)

### 3. Env Schema Update

- **File:** `apps/api/src/common/env/env.schema.ts`
- Added `GROQ_API_KEY` with `.optional().or(z.literal('')).transform(v => v || undefined)` pattern
- Retains `GEMINI_API_KEY` (unused) for backward compatibility

### 4. CORS — Frontend Port Mismatch

- **Symptom:** Frontend on port 3008, FRONTEND_ORIGIN only had 3007
- **Fix:** Added `http://localhost:3008` to FRONTEND_ORIGIN in `apps/api/.env`

### 5. TenantInterceptor Injecting `companyId` into AI Chat Body

- **Symptom:** `400 Bad Request: "property companyId should not exist"` on POST `/api/ai/chat`
- **Root Cause:** `TenantInterceptor` injects `request.body.companyId` for all non-GET/DELETE requests — caught by DTO `forbidNonWhitelisted` validation
- **File:** `apps/api/src/common/interceptors/tenant.interceptor.ts`
- **Fix:** Added `/api/ai` and `/ai` to the interceptor skip list

### 6. Second-Pass Groq Call Returning Empty Content

- **Symptom:** After tool execution, follow-up Groq call returned `null` content (fallback: "I retrieved the data but could not generate a summary.")
- **Root Cause:** Follow-up call included `tools: groqTools`, causing model to attempt another tool call instead of generating text
- **Fix:** Removed `tools` parameter from the follow-up `chat.completions.create()` call

## Files Changed

| File                                                     | Change                                      |
| -------------------------------------------------------- | ------------------------------------------- |
| `apps/api/src/modules/ai/ai-chat.service.ts`             | Full Groq migration + follow-up fix         |
| `apps/api/src/common/env/env.schema.ts`                  | Added GROQ_API_KEY                          |
| `apps/api/src/common/interceptors/tenant.interceptor.ts` | Skip AI routes                              |
| `apps/api/.env`                                          | Added GROQ_API_KEY, updated FRONTEND_ORIGIN |
| `apps/api/package.json`                                  | Added `groq-sdk` dependency                 |

## Verification

- **Direct Groq API test:** Confirmed working (text + function calling)
- **HTTP endpoint test:** `POST /api/ai/chat` returns structured response with natural language + data cards
- **Backend tests:** 53/53 passing
- **TypeScript errors:** 0
- **Example response:**
  ```json
  {
    "role": "assistant",
    "content": "The total revenue for today, 2026-04-15, is TZS 0.",
    "cards": [{ "type": "data", "title": "query_sales_summary", "content": { "totalRevenue": 0 } }]
  }
  ```
