# Unimplemented Features, Functionalities & Logic

Comprehensive scan of the IFMS Enterprise Financial Suite codebase. Organized by severity.

---

## 🔴 Critical (Broken or Missing Core Paths)

### 1. No Signup Backend Endpoint
The frontend has a full [useSignup](file:///c:/projects/ifms-enterprise-financial-suite/hooks/auth/useSignup.ts) hook and a [SignupPage](file:///c:/projects/ifms-enterprise-financial-suite/components/pages/SignupPage.tsx) calling `POST /api/auth/signup`, but the backend [auth.controller.ts](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/auth/auth.controller.ts) has **no signup endpoint**. The `useSignup` hook probes for availability and gracefully degrades to "invite only" mode, but user self-registration is non-functional.

### 2. No Forgot Password / Password Reset Backend
The frontend calls `POST /api/auth/forgot-password` via [useForgotPassword](file:///c:/projects/ifms-enterprise-financial-suite/hooks/auth/useForgotPassword.ts), but the backend has **no forgot-password or reset-password endpoint**. The "Forgot password?" link on the login page leads nowhere.

### 3. JWT Payload Missing Company/Tenant Scopes
The [auth.service.ts login()](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/auth/auth.service.ts#L54-L73) method signs JWTs with only `{ sub, email, type }`. The [TenantInterceptor](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/common/interceptors/tenant.interceptor.ts) expects `company:<uuid>` entries in the JWT permissions array to enforce cross-tenant isolation. Since these are never populated, the interceptor's tenant-scoping logic (body/query filtering, auto-scoping) is **entirely inert**. This was temporarily worked around to allow login, but the actual multi-tenant JWT flow is unimplemented.

---

## 🟠 High (Feature Gaps in Existing Modules)

### 4. Email Notification Delivery
[outbox.worker.ts](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/notifications/outbox.worker.ts#L226-L230) has an explicit `// TODO: Implement email delivery` stub that throws `Error('Email delivery not yet implemented')`. The notification schema supports email channels, but no SMTP/mail integration exists.

### 5. SMS Notification Delivery
Same file, [line 233-235](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/notifications/outbox.worker.ts#L232-L236) — `// TODO: Implement SMS delivery` throws. No SMS provider (Twilio, etc.) is integrated.

### 6. Push Notification Delivery
The notification preferences schema defines a `push: boolean` channel, but there is **no push notification implementation** anywhere — no Firebase/APNs integration, no service worker registration, and no `processJobType('push')` handler.

### 7. Notification Digest Mode
The `notificationPreferences` schema includes a `digestMode` field (returned by `getUserPreferences` with a default of `'none'`), but there is **no digest aggregation logic** — no scheduled job batches notifications into daily/weekly summaries.

### 8. Audit Log UI
The backend `AuditService` logs actions across all modules, but there is **no frontend page or component** to browse, filter, or export audit logs. The audit data exists in the database but is invisible to users.

### 9. GeminiService AI Integration — No Backend Endpoint
[geminiService.ts](file:///c:/projects/ifms-enterprise-financial-suite/services/geminiService.ts) is a client-side service that calls the Gemini API directly with `process.env.GEMINI_API_KEY`. This runs in the browser where `process.env` is undefined. The service needs a **backend proxy endpoint** to securely call the Gemini API without exposing the API key to the client.

---

## 🟡 Medium (Incomplete Functionality)

### 10. Governance Approval Workflow UI
The backend has a full governance module ([governance.service.ts](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/governance/governance.service.ts), [policy-evaluator.service.ts](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/governance/policy-evaluator.service.ts)) with multi-step approval policies. However, there is **no dedicated approval queue/inbox UI** where managers can review, approve, or reject pending controlled actions. Approval status is only visible incidentally on entity detail pages.

### 11. User Management CRUD
The backend has user authentication but appears to lack a **user management API** — no endpoint to list all users, create users (admin-side), deactivate users, or change roles. The seed script creates users directly in the database.

### 12. Role & Permission Management UI
Roles and permissions are seeded via the database seed script. There is **no admin UI** to create custom roles, assign/revoke permissions, or manage role hierarchies.

### 13. Exports Compliance — TSA Fiscal Integration
[exports.compliance.service.ts](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/exports/exports.compliance.service.ts) has logic to sign exports and submit to a "Tax and Standards Authority," but it depends on `TSA_API_URL`, `TSA_API_KEY`, and signing key environment variables that are unlikely configured. The compliance workflow is structurally complete but **untested against a real fiscal authority**.

### 14. Realtime WebSocket — No Client-Side Consumer
The backend has a [RealtimeGateway](file:///c:/projects/ifms-enterprise-financial-suite/apps/api/src/modules/notifications/realtime.gateway.ts) emitting `notification:new` and `notification:unreadCount` events via Socket.IO, but the frontend notification hooks use **HTTP polling with React Query**, not WebSocket subscriptions. Real-time notification delivery to the browser is wired on the backend but **not consumed on the frontend**.

### 15. Stock Adjustment Approval Flow
The seed defines a governance policy for `stock_adjustment` → `approve`, but there is no evidence of the inventory module integrating with the governance service to trigger controlled-action requests when adjustments are made.

---

## 🔵 Low (Polish & Infrastructure Gaps)

### 16. Internationalization (i18n)
All user-facing strings are hardcoded in English across both frontend and backend. No i18n framework (react-intl, i18next) is integrated. The seed data mentions `timezone` in quiet hours but there is no user-facing locale/language preference.

### 17. Frontend Error Boundaries
There is no global React Error Boundary wrapping the application. Unhandled component-level exceptions will crash the entire app without a recovery UI.

### 18. Database Migrations — Production Readiness
The [docker-compose.staging.yml](file:///c:/projects/ifms-enterprise-financial-suite/docker-compose.staging.yml) defines migration commands, but the CI workflow only runs lint/test — it does **not validate that migrations apply cleanly** against the current schema.

### 19. Rate Limiting on Sensitive Endpoints
While the auth controller uses `@Throttle` decorators, other sensitive endpoints (bulk operations, exports, report generation) have **no rate limiting**. The global throttler may not be tuned for production traffic patterns.

### 20. Monitoring & Observability
The notification module has a custom `NotificationMetricsService` with Prometheus-like output, but there is **no centralized application monitoring** — no health check endpoint aggregating DB connectivity, no APM integration, no structured logging to an external sink (ELK, Datadog, etc.).

### 21. Data Export/Import
Users cannot export data (sales reports, audit trails, inventory snapshots) to CSV/Excel/PDF from the frontend. The backend `exports` module handles compliance-specific exports but not general user-facing data downloads.

### 22. Multi-Branch / Multi-Station Switching
The frontend login resolves a single user session but there is **no station/branch switcher** in the app shell. Users assigned to multiple stations cannot switch context without logging out.

---

## Summary Table

| # | Feature | Location | Severity |
|---|---------|----------|----------|
| 1 | Self-Service Signup | Auth module | 🔴 Critical |
| 2 | Forgot Password / Reset | Auth module | 🔴 Critical |
| 3 | JWT Company Scopes for Tenant Isolation | Auth + TenantInterceptor | 🔴 Critical |
| 4 | Email Notification Delivery | OutboxWorker | 🟠 High |
| 5 | SMS Notification Delivery | OutboxWorker | 🟠 High |
| 6 | Push Notification Delivery | Notifications module | 🟠 High |
| 7 | Notification Digest Mode | Notifications module | 🟠 High |
| 8 | Audit Log UI | Frontend | 🟠 High |
| 9 | GeminiService Backend Proxy | Services / AI | 🟠 High |
| 10 | Governance Approval Queue UI | Frontend | 🟡 Medium |
| 11 | User Management CRUD | Auth/Admin | 🟡 Medium |
| 12 | Role & Permission Management UI | Admin | 🟡 Medium |
| 13 | TSA Fiscal Integration Testing | Exports | 🟡 Medium |
| 14 | WebSocket Consumer (Frontend) | Notifications | 🟡 Medium |
| 15 | Stock Adjustment Approval | Inventory + Governance | 🟡 Medium |
| 16 | Internationalization (i18n) | Full stack | 🔵 Low |
| 17 | React Error Boundaries | Frontend | 🔵 Low |
| 18 | Migration CI Validation | CI/CD | 🔵 Low |
| 19 | Endpoint Rate Limiting | Backend | 🔵 Low |
| 20 | Monitoring & Observability | Infrastructure | 🔵 Low |
| 21 | Data Export/Import (CSV/Excel/PDF) | Full stack | 🔵 Low |
| 22 | Multi-Branch/Station Switcher | Frontend | 🔵 Low |
