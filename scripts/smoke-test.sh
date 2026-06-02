#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${SMOKE_BASE_URL:-}}"
IS_STAGING="${2:-${SMOKE_STAGING:-false}}"
API_BASE_URL="${SMOKE_API_BASE_URL:-${BASE_URL:-http://localhost:3001}}"
WEB_BASE_URL="${SMOKE_WEB_BASE_URL:-${BASE_URL:-http://localhost:3005}}"
if [[ -n "${SMOKE_SWAGGER_URL:-}" ]]; then
  SWAGGER_URL="$SMOKE_SWAGGER_URL"
elif [[ -n "$BASE_URL" ]]; then
  SWAGGER_URL="${BASE_URL%/}/api/docs"
else
  SWAGGER_URL="${API_BASE_URL%/}/docs"
fi

check_status() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local auth_args=()
  if [[ $# -ge 5 ]]; then
    auth_args=(-u "$4:$5")
  fi
  local code
  code="$(curl -sS "${auth_args[@]}" -o /tmp/ifms_smoke_body.txt -w '%{http_code}' "$url")"
  if [[ "$code" != "$expected" ]]; then
    echo "[smoke] ${name} failed (${code}, expected ${expected}) -> ${url}" >&2
    cat /tmp/ifms_smoke_body.txt >&2 || true
    exit 1
  fi
  echo "[smoke] ${name} ok (${expected})"
}

check_200() {
  check_status "$1" "$2" "200"
}

check_200 "api ready" "${API_BASE_URL%/}/health/ready"
check_200 "web root" "${WEB_BASE_URL%/}/"

if [[ "${IS_STAGING}" == "true" ]]; then
  if [[ -n "${SMOKE_SWAGGER_USER:-}" && -n "${SMOKE_SWAGGER_PASS:-}" ]]; then
    check_status "api docs" "$SWAGGER_URL" "200" "$SMOKE_SWAGGER_USER" "$SMOKE_SWAGGER_PASS"
  else
    check_status "api docs protected" "$SWAGGER_URL" "401"
  fi
fi

echo "[smoke] all checks passed"
