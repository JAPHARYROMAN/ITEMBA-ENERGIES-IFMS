# Reports Caching

This project now supports server-side in-memory caching for report read endpoints to reduce repeat dashboard load.

## Goals

- Reduce repeated aggregation load for dashboard/report refreshes.
- Keep response payload shapes unchanged.
- Prevent cross-scope cache leakage by keying cache with both filter params and user scope.

## What is cached

Cached in `ReportsService` for these endpoints:

- `GET /api/reports/overview`
- `GET /api/reports/daily-operations`
- `GET /api/reports/stock-loss`
- `GET /api/reports/profitability`
- `GET /api/reports/credit-cashflow`
- `GET /api/reports/station-comparison`

## Cache implementation

- In-memory LRU+TTL cache (`LruTtlCache`) is used.
- Cache key is a stable JSON hash input made from:
  - endpoint name
  - normalized report filter params (`dateFrom`, `dateTo`, `companyId`, `stationId`, `branchId`, `productId`)
  - request scope (`userId`, sorted permissions, scoped company/branch)
- This prevents data leakage between users and between company/branch scopes.

## HTTP caching headers

Read-only report endpoints include:

- `Cache-Control: private, max-age=30`
- `ETag: "<sha256-base64url>"` derived from stable payload hash

If the client sends `If-None-Match` equal to the current ETag, endpoint returns `304 Not Modified`.

## Metrics logging

For each report request, cache metric events are logged via `AppLogger`:

- `cache_hit`
- `cache_miss`

Log context: `ReportsCache`.

## Configuration

Configured in env schema:

- `REPORTS_CACHE_ENABLED` (default: `true`)
- `REPORTS_CACHE_MAX_ENTRIES` (default: `500`)
- `REPORTS_CACHE_TTL_SECONDS_DEFAULT` (default: `60`)
- `REPORTS_CACHE_TTL_SECONDS_OVERVIEW` (default: `60`)
- `REPORTS_CACHE_TTL_SECONDS_DAILY_OPERATIONS` (default: `60`)
- `REPORTS_CACHE_TTL_SECONDS_STOCK_LOSS` (default: `60`)
- `REPORTS_CACHE_TTL_SECONDS_PROFITABILITY` (default: `60`)
- `REPORTS_CACHE_TTL_SECONDS_CREDIT_CASHFLOW` (default: `60`)
- `REPORTS_CACHE_TTL_SECONDS_STATION_COMPARISON` (default: `120`)

## Notes

- Caching does not alter report response data contracts.
- Cache is process-local (single-node in-memory). In multi-instance deployments, each instance maintains its own cache.
