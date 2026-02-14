param(
  [string]$ComposeFile = $(if ($env:COMPOSE_FILE) { $env:COMPOSE_FILE } else { "docker-compose.staging.yml" }),
  [string]$ServiceName = $(if ($env:MIGRATION_SERVICE) { $env:MIGRATION_SERVICE } else { "api" }),
  [string]$MigrationCommand = $(if ($env:MIGRATION_CMD) { $env:MIGRATION_CMD } else { "npm run db:migrate:ci" })
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker command is required"
}

Write-Host "[migrate] compose file: $ComposeFile"
Write-Host "[migrate] service: $ServiceName"
Write-Host "[migrate] command: $MigrationCommand"

docker compose -f $ComposeFile run --rm $ServiceName sh -lc $MigrationCommand
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
