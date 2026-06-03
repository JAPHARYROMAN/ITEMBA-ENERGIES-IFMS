# Load & performance testing

How to run a basic load test against the API, plus the results and findings
from the first run.

## Method

The API boots against any PostgreSQL. For a throwaway run:

```bash
cd apps/api
# 1) fresh DB + migrate + seed an admin
createdb ifms_loadtest   # or psql CREATE DATABASE
DATABASE_URL=postgresql://USER:PASS@localhost:5432/ifms_loadtest npx drizzle-kit migrate
DATABASE_URL=postgresql://USER:PASS@localhost:5432/ifms_loadtest \
  ADMIN_SEED_EMAIL=admin@ifms.local ADMIN_SEED_PASSWORD=Admin12345 npm run db:seed

# 2) build + boot (development mode so DB_SSL=false is allowed locally)
npm run build
DATABASE_URL=postgresql://USER:PASS@localhost:5432/ifms_loadtest \
  JWT_ACCESS_SECRET=loadtest-access-secret-32-characters-min \
  JWT_REFRESH_SECRET=loadtest-refresh-secret-32-characters-min \
  PORT=3011 FRONTEND_ORIGIN=http://localhost:3005 NODE_ENV=development DB_SSL=false \
  node dist/main.js &

# 3) get a token
TOKEN=$(curl -s -X POST http://localhost:3011/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ifms.local","password":"Admin12345"}' | jq -r .accessToken)

# 4) drive load (autocannon)
npx autocannon -c 30 -d 10 http://localhost:3011/health/ready
npx autocannon -c 4 -R 8 -d 8 -H "Authorization=Bearer $TOKEN" \
  http://localhost:3011/api/reports/overview
```

> Note: the API enforces a global rate limit (10 req/s "short", 100 req/min
> "medium") per client IP, so a single-IP load test will hit `429`s above
> those rates by design. Use `-R` (requests/sec) to stay under the cap when
> measuring endpoint latency, or test from multiple source IPs for throughput.

## Results (first run — native PostgreSQL 17, single host)

| Endpoint | Rate | p50 | p99 | Notes |
|---|---|---|---|---|
| `GET /health/ready` (DB ping) | 30 conns | 18 ms | 31 ms | ~1,550 req/s, 0 failures after the throttle fix below |
| `GET /api/reports/overview` (cached) | 8 req/s | 14 ms | 122 ms | LRU-cached report; fast warm path |
| `GET /api/companies?page=1&pageSize=25` | 8 req/s | 7 ms | 52 ms | typical list query |

The app is performant: cached reports respond in ~14 ms median, list queries
~7 ms median.

## Findings

1. **[FIXED] Health probes were rate-limited.** `GET /health/ready` and
   `/health/live` were subject to the global `ThrottlerGuard` and returned
   `429` above 10 req/s. A load balancer or Kubernetes probe — especially with
   multiple replicas behind one source IP — would be throttled and could mark
   the service unhealthy, causing false outages. Fixed by adding
   `@SkipThrottle({ short: true, medium: true })` to both health endpoints.
   (Note: with *named* throttlers, a bare `@SkipThrottle()` is a no-op — it
   only skips a throttler named `default`.)

2. **[TUNING] The global limit (100 req/min per IP) may be too aggressive.**
   Multiple users behind a shared corporate NAT/proxy, or a single power user
   doing bulk operations, can exceed 100 req/min and receive `429`s during
   normal use. Consider raising the `medium` limit, keying the throttle on the
   authenticated user instead of IP, or exempting read-heavy report endpoints.
   Left as-is pending a product decision.

3. **[OK] Latency is healthy** under sustained load with no memory/connection
   issues observed in a short run. A longer soak test (30+ min) and a
   multi-IP throughput test are recommended before high-traffic go-live.
