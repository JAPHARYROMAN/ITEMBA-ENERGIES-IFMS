# 029 — Fix Pre-existing Test Failures

**Date:** 2026-04-16
**Files Modified:** 2
**Scope:** Fix all 13 pre-existing test failures across 2 suites

---

## Problem

After achieving a clean TypeScript build (Phase 11, doc 028), the test suite had **13 pre-existing failures** in 2 suites that predated the Phase 10–11 work.

| Suite | Failures | Root Cause |
|-------|----------|------------|
| `notifications.service.spec.ts` | 12 | Missing `PushTransport` mock provider in OutboxWorker test setup |
| `shifts-transaction.e2e-spec.ts` | 1 | `ParseUUIDPipe` rejects non-UUID `shift-1` param |

---

## Fix 1: `notifications.service.spec.ts` — Missing PushTransport Mock

The `OutboxWorker` constructor requires 7 injected dependencies:
```
DRIZZLE, ConfigService, RealtimeGateway, NotificationMetricsService, EmailTransport, SmsTransport, PushTransport
```

The test module only provided 6 — `PushTransport` (index [6]) was missing. NestJS threw a dependency resolution error in `beforeEach`, cascading to all 12 OutboxWorker tests (including 6 Quiet Hours tests that use `new NotificationService(...)` but are nested in the OutboxWorker describe block).

**Changes:**
- Added `import { PushTransport } from './transports/push.transport'`
- Added `mockPushTransport` object with `send: jest.fn()`
- Added `{ provide: PushTransport, useValue: mockPushTransport }` to test module providers

---

## Fix 2: `shifts-transaction.e2e-spec.ts` — Invalid UUID Param

The controller uses `@Param('id', ParseUUIDPipe)` which validates UUID format. The test was sending `/shifts/shift-1/close` where `shift-1` is not a valid UUID, causing a 400 Bad Request.

**Changes:**
- Replaced hardcoded `'shift-1'` with a valid UUID constant: `'22222222-2222-2222-2222-222222222222'`
- Updated mock return values and request URL to use the UUID constant

---

## Files Modified

1. `apps/api/src/modules/notifications/notifications.service.spec.ts` — Added PushTransport import, mock, and provider
2. `apps/api/test/shifts-transaction.e2e-spec.ts` — Replaced `shift-1` with valid UUID

## Verification

```
Backend (Jest):  12 suites passed, 53 tests passed, 0 failures
Frontend (Vitest): 4 suites passed, 17 tests passed, 0 failures
```

**Full codebase: 70/70 tests passing across 16 suites.**
