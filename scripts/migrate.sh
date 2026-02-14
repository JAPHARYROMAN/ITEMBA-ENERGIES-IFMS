#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
SERVICE_NAME="${MIGRATION_SERVICE:-api}"
MIGRATION_CMD="${MIGRATION_CMD:-npm run db:migrate:ci}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker command is required" >&2
  exit 1
fi

echo "[migrate] compose file: ${COMPOSE_FILE}"
echo "[migrate] service: ${SERVICE_NAME}"
echo "[migrate] command: ${MIGRATION_CMD}"

docker compose -f "${COMPOSE_FILE}" run --rm "${SERVICE_NAME}" sh -lc "${MIGRATION_CMD}"
