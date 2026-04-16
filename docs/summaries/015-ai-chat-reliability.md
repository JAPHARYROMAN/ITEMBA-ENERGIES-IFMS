# 015 — AI Chat Reliability & Rate Limit Fixes

## Problem

AI chat worked on the first request but failed on subsequent ones.

## Root Cause

Groq free-tier rate limits for `llama-3.3-70b-versatile`: only **6,000 TPM** (tokens per minute). Our 20 tool definitions alone consume ~3,300 tokens. Two API calls per interaction (tool call + follow-up) = ~8,000+ tokens, instantly exceeding the limit.

## Fixes Applied

### 1. Model Switch: `llama-3.3-70b-versatile` → `llama-3.1-8b-instant`

- Free-tier TPM: 6,000 → **20,000** (3.3× improvement)
- Still supports tool/function calling
- Model is configurable via `GROQ_MODEL` env var (defaults to `llama-3.1-8b-instant`)

### 2. Smart Tool Selection (per-request filtering)

- Reduced tools sent per request from 20 → max 10
- Tools scored by page context keywords and message content
- e.g., on `/dashboard`, prioritizes sales/inventory/forecast tools
- On `/credit`, prioritizes credit/customer/payment tools
- Reduces token overhead by ~50%

### 3. Retry with Backoff for Rate Limits

- Groq calls now retry up to 2 times with 2s/4s backoff on 429 errors
- Catches both `status === 429` and message-level patterns (`rate_limit`, `Rate limit`)

### 4. Frontend Error Detail Visibility

- `useAiChat.ts` catch block now includes the actual error message
- Before: `"Sorry, I encountered an error. Please try again."`
- After: `"Sorry, I encountered an error. <actual error message>"`

## Files Changed

| File                                         | Change                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/api/src/modules/ai/ai-chat.service.ts` | Model switch, tool selection, retry logic, improved rate limit detection |
| `lib/hooks/useAiChat.ts`                     | Error detail in catch block                                              |

## Verification

- **4/4 sequential chat requests succeeded** (was 0/3 before)
- **53/53 backend tests passing**
- **0 TypeScript errors**
