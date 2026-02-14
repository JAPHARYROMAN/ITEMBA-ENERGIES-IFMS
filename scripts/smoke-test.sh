#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${SMOKE_BASE_URL:-http://localhost}}"
IS_STAGING="${2:-${SMOKE_STAGING:-true}}"

check_200() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -sS -o /tmp/ifms_smoke_body.txt -w '%{http_code}' "$url")"
  if [[ "$code" != "200" ]]; then
    echo "[smoke] ${name} failed (${code}) -> ${url}" >&2
    cat /tmp/ifms_smoke_body.txt >&2 || true
    exit 1
  fi
  echo "[smoke] ${name} ok (200)"
}

check_200 "api ready" "${BASE_URL%/}/api/health/ready"
check_200 "web root" "${BASE_URL%/}/"

if [[ "${IS_STAGING}" == "true" ]]; then
  check_200 "api docs" "${BASE_URL%/}/api/docs"
fi

echo "[smoke] all checks passed"
