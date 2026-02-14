param(
  [string]$BaseUrl = $(if ($args.Count -gt 0 -and $args[0]) { $args[0] } elseif ($env:SMOKE_BASE_URL) { $env:SMOKE_BASE_URL } else { "http://localhost" }),
  [string]$IsStaging = $(if ($args.Count -gt 1 -and $args[1]) { $args[1] } elseif ($env:SMOKE_STAGING) { $env:SMOKE_STAGING } else { "true" })
)

$ErrorActionPreference = "Stop"

function Assert-Http200 {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Url
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 20 -UseBasicParsing
  }
  catch {
    Write-Error "[smoke] $Name failed -> $Url :: $($_.Exception.Message)"
    exit 1
  }

  if ($response.StatusCode -ne 200) {
    Write-Error "[smoke] $Name failed ($($response.StatusCode)) -> $Url"
    exit 1
  }

  Write-Host "[smoke] $Name ok (200)"
}

$base = $BaseUrl.TrimEnd('/')

Assert-Http200 -Name "api ready" -Url "$base/api/health/ready"
Assert-Http200 -Name "web root" -Url "$base/"

if ($IsStaging.ToLowerInvariant() -eq "true") {
  Assert-Http200 -Name "api docs" -Url "$base/api/docs"
}

Write-Host "[smoke] all checks passed"
