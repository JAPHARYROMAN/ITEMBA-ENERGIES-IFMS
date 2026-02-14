#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-ifms}"
PGDATABASE="${PGDATABASE:-ifms_staging}"

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/${PGDATABASE}_${timestamp}.dump"

echo "[backup] starting pg_dump to ${backup_file}"
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --host="$PGHOST" \
  --port="$PGPORT" \
  --username="$PGUSER" \
  --dbname="$PGDATABASE" \
  --file="$backup_file"

echo "[backup] completed ${backup_file}"

mapfile -t backups < <(ls -1t "${BACKUP_DIR}/${PGDATABASE}_"*.dump 2>/dev/null || true)
backup_count="${#backups[@]}"

if [[ "$backup_count" -gt "$BACKUP_RETENTION_COUNT" ]]; then
  for ((i=BACKUP_RETENTION_COUNT; i<backup_count; i++)); do
    old_file="${backups[$i]}"
    echo "[backup] deleting old backup ${old_file}"
    rm -f "$old_file"
  done
fi

echo "[backup] retention complete (kept up to ${BACKUP_RETENTION_COUNT})"
