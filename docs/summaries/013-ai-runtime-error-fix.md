# 013 — AI Chat Runtime Error Fix

**Date:** 2026-04-15

## Problem

AI chat returned "Sorry, I encountered an error. Please try again." for every user message.

## Root Cause

Two issues identified:

1. **Missing env variable:** `GEMINI_API_KEY` was defined in the project root `.env` but absent from `apps/api/.env`. NestJS `ConfigModule` resolves env files relative to the API directory (`.env.local`, `.env`), so the key was never loaded.

2. **Quota exhaustion:** The Gemini free-tier quota was temporarily exhausted (429 `RESOURCE_EXHAUSTED`). The generic catch block returned an unhelpful error message with no indication of the real cause.

## Changes

| File                                         | Change                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/.env`                              | Added `GEMINI_API_KEY`                                                                                                         |
| `apps/api/src/modules/ai/ai-chat.service.ts` | Enhanced catch block to detect 429/quota errors and return a user-friendly "rate-limited" message instead of the generic error |

## Verification

- `GEMINI_API_KEY` loads correctly from `apps/api/.env` (confirmed via dotenv test)
- NestJS server starts without `GEMINI_API_KEY not set` warning
- Zero TypeScript errors (`tsc --noEmit`)
