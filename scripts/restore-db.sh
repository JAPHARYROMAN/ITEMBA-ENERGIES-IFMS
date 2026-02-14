#!/usr/bin/env bash
set -euo pipefail

if [[ "${CONFIRM_DB_RESTORE:-}" != "YES_RESTORE" ]]; then
  echo "[restore] blocked: set CONFIRM_DB_RESTORE=YES_RESTORE to continue" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: CONFIRM_DB_RESTORE=YES_RESTORE ./scripts/restore-db.sh <backup_file.dump>" >&2
  exit 1
fi

backup_file="$1"
if [[ ! -f "$backup_file" ]]; then
  echo "[restore] backup file not found: $backup_file" >&2
  exit 1
fi

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-ifms}"
PGDATABASE="${PGDATABASE:-ifms_staging}"

echo "[restore] restoring ${backup_file} into ${PGDATABASE} on ${PGHOST}:${PGPORT}"
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  "$backup_file"

echo "[restore] restore complete"
