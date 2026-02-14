# IFMS Operations Runbook (Backups, Restore, Monitoring)

This runbook covers staging-ready operations essentials:

- Daily PostgreSQL backups with retention
- Controlled restore drill procedure
- Monitoring hooks (`/ops/metrics`)
- Slow report query alert logging

## 1) Database Backups (Staging)

### Backup script

- Script: `scripts/backup-db.sh`
- Behavior:
  - Creates UTC timestamped `pg_dump` custom-format backup
  - Stores backups under `BACKUP_DIR` (default `/backups`)
  - Keeps only the last `BACKUP_RETENTION_COUNT` files (default `14`)

### Compose backup scheduler

`docker-compose.staging.yml` includes a `db-backup` service that:

- Runs `sh /scripts/backup-db.sh` immediately on startup
- Re-runs every `BACKUP_INTERVAL_SECONDS` (default `86400` = daily)
- Persists dumps to volume `ifms_staging_backups`

### Verify backups

```bash
docker compose -f docker-compose.staging.yml exec db-backup ls -lh /backups
```

## 2) Restore Drill (Explicit confirmation required)

### Restore script

- Script: `scripts/restore-db.sh`
- Safety gate: requires `CONFIRM_DB_RESTORE=YES_RESTORE`
- Uses `pg_restore --clean --if-exists` to replace objects in target DB

### Example restore command

```bash
CONFIRM_DB_RESTORE=YES_RESTORE \
PGHOST=postgres PGPORT=5432 PGUSER=ifms PGPASSWORD='<redacted>' PGDATABASE=ifms_staging \
./scripts/restore-db.sh /backups/ifms_staging_20260214T000000Z.dump
```

### Restore drill checklist

1. Pick latest valid dump from `/backups`.
2. Confirm staging maintenance window.
3. Set `CONFIRM_DB_RESTORE=YES_RESTORE`.
4. Run restore.
5. Validate:
   - `GET /api/health/ready`
   - business smoke checks

## 3) Monitoring Hooks

### Ops metrics endpoint

- Endpoint: `GET /ops/metrics`
- Scope: staging only (controlled by env)
- Enable with: `OPS_METRICS_ENABLED=true`

Current payload includes:

- request counts
- latency bucket counters (`<=100ms`, `<=300ms`, `<=1000ms`, `<=3000ms`, `<=10000ms`, `>10000ms`)
- report cache hits/misses + hit rate

### Environment flags

In API env:

- `OPS_METRICS_ENABLED` (default false)
- `REPORTS_SLOW_QUERY_THRESHOLD_MS` (default 2000)

## 4) Alert-Ready Logs (Reports)

Reports already emit structured JSON logs under `ReportsPerf` and `ReportsCache` contexts.

Additional slow-query alert log is emitted when report response time exceeds threshold:

- event: `reports.slow_query`
- fields include: `thresholdMs`, `totalMs`, `report`, `endpoint`, `correlationId`, `subqueries`

This is suitable for log-based alerts (e.g., alert if count over 5m exceeds threshold).

## 5) Quick Commands

Bring up staging stack:

```bash
docker compose -f docker-compose.staging.yml up -d
```

Check backup service logs:

```bash
docker compose -f docker-compose.staging.yml logs -f db-backup
```

Check ops metrics:

```bash
curl -s http://<staging-host>/api/ops/metrics | jq
```

Check readiness:

```bash
curl -i http://<staging-host>/api/health/ready
```
