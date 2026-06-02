# ITEMBA-ENERGIES Fuel Management System (IFMS)

## Overview

**ITEMBA-ENERGIES IFMS** is an enterprise-grade fuel management and intelligence platform designed for modern filling station operations and multi-branch fuel retail groups.

The system provides end-to-end operational control across sales, inventory, deliveries, credit management, payables, expenses, governance workflows, and advanced analytics — with a strong emphasis on performance reporting and executive oversight.

IFMS transforms fuel retail operations from manual record-keeping into a data-driven, auditable, and scalable digital system.

---

## Core Objectives

* Eliminate revenue leakage and shrinkage
* Provide real-time operational visibility
* Enable multi-branch and multi-company oversight
* Strengthen compliance and governance controls
* Deliver executive-grade analytics and reporting
* Ensure performance, scalability, and auditability

---

## Key Features

### 1. Setup & Master Data

* Company → Station → Branch hierarchy
* Tanks, pumps, nozzles mapping
* Products (fuel and non-fuel)
* User roles and RBAC permissions

### 2. Shift Management

* Open and close shifts
* Meter readings (opening/closing)
* Cash reconciliation and variance tracking
* Maker-checker workflow (optional governance)

### 3. Sales (POS)

* Fuel and non-fuel sales
* Split payments (cash, mobile money, card, voucher)
* Discount controls and approval thresholds
* Sale void governance

### 4. Inventory & Reconciliation

* Tank dips and physical stock capture
* Book vs physical reconciliation
* Shrinkage detection and variance classification

### 5. Deliveries & GRN

* Expected deliveries
* Goods Received Note (GRN)
* Tank allocation validation
* Variance and density tracking

### 6. Transfers & Adjustments

* Tank-to-tank transfers
* Station-to-station transfers
* Controlled stock adjustments

### 7. Credit Management (AR)

* Customer credit limits
* Invoice generation
* Payment allocation
* Aging analysis
* Statements

### 8. Supplier Payables (AP)

* Supplier invoices
* Payments
* Aging reports

### 9. Expenses & Petty Cash

* Expense tracking
* Approval workflows
* Petty cash ledger
* Departmental tagging

### 10. Advanced Reporting & Analytics (Core Focus)

* Executive dashboards
* Daily operations reports
* Stock loss intelligence
* Profitability analytics
* Credit & cashflow monitoring
* Multi-branch comparative analysis
* Materialized view acceleration
* Cached reporting endpoints

---

## Governance Engine

IFMS includes a configurable governance workflow system that supports:

* Maker-checker controls
* Multi-step approvals
* Threshold-based policy enforcement
* SLA tracking
* Full approval audit trail
* Read-only auditor roles

---

## Technology Stack

### Frontend

* Vite 6
* React 19
* React Router 7 (HashRouter)
* TypeScript
* Tailwind CSS (custom component library)
* TanStack Query
* Zustand
* React Hook Form + Zod
* Recharts
* i18next (react-i18next)
* socket.io-client

### Backend

* NestJS
* PostgreSQL
* Drizzle ORM
* JWT Authentication + RBAC
* Materialized Views for reporting
* LRU caching for heavy endpoints
* Structured logging

### Infrastructure

* Docker & Docker Compose
* Nginx reverse proxy
* CI/CD (GitHub Actions)
* Automated migrations
* Backup and restore scripts

---

## Architecture Highlights

* Multi-tenant hierarchical design
* Immutable audit logging
* Transactional shift close and GRN allocation
* Materialized daily summaries
* Configurable governance policies
* Performance-optimized reporting queries
* Clean module separation
* Environment-based configuration

---

## Repository Structure

The backend lives in `apps/api`; the frontend is a Vite app at the repository root.

```
/                              → Vite + React frontend (root)
  App.tsx                      → root application component
  index.tsx / index.html       → frontend entry point
  store.ts                     → Zustand store
  types.ts                     → shared frontend types
  constants.tsx                → app constants
  vite.config.ts               → Vite config (dev server on port 3005)
  /components                  → React UI components
    /ifms                      → IFMS domain components
    /ui                        → reusable Tailwind UI primitives
    /forms /pages /pos /reports /expenses
  /lib                         → frontend utilities
    /api                       → API client layer
    /hooks /locales
  /hooks                       → shared React hooks
  /shared                      → shared types (frontend/backend)
/apps
  /api                         → NestJS backend (API on port 3001)
/docs                          → documentation
/scripts                       → operational scripts
/docker-compose.yml            → base compose (also .staging / .production)
/nginx.conf                    → Nginx reverse proxy config
/Dockerfile                    → frontend image
```

---

## Running Locally

### 1. Start Postgres

```bash
docker compose up -d postgres
```

The local compose database is exposed on `localhost:5433` with user/password/db `ifms`.

### 2. Start the API

```bash
cd apps/api
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run start:dev
```

The NestJS API listens on [http://localhost:3001](http://localhost:3001). Health probes are:

* Live: [http://localhost:3001/health/live](http://localhost:3001/health/live)
* Ready: [http://localhost:3001/health/ready](http://localhost:3001/health/ready) (`503` when the DB is unavailable)

If you need to restore the default local admin after a reset, run `npm run db:reset-admin` from `apps/api`. The local seeded login is `admin@ifms.local` / `1618`.

### 3. Run Frontend

The frontend runs from the repository root via Vite:

```bash
npm install
npm run dev
```

The Vite dev server listens on [http://localhost:3005](http://localhost:3005). Ensure `apps/api/.env` has `FRONTEND_ORIGIN` entries for `http://localhost:3005` and `http://localhost:5173`.

### 4. Access

* Web App: [http://localhost:3005](http://localhost:3005)
* API Docs (Swagger): [http://localhost:3001/docs](http://localhost:3001/docs)

---

## Production Considerations

* Environment separation (dev / staging / prod)
* Strict RBAC enforcement
* Daily materialized view refresh
* Report caching
* Database backup rotation
* Approval workflow enforcement
* Health checks and monitoring endpoints

---

## Roadmap

* General ledger integration (double-entry accounting)
* Redis distributed caching
* Horizontal scaling support
* Advanced BI exports
* Fuel pump/ATG hardware integration
* AI-assisted anomaly detection

---

## License

Proprietary – ITEMBA-ENERGIES
