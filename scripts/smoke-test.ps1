param(
  [string]$BaseUrl = $(if ($args.Count -gt 0 -and $args[0]) { $args[0] } elseif ($env:SMOKE_BASE_URL) { $env:SMOKE_BASE_URL } else { "" }),
  [string]$IsStaging = $(if ($args.Count -gt 1 -and $args[1]) { $args[1] } elseif ($env:SMOKE_STAGING) { $env:SMOKE_STAGING } else { "false" }),
  [string]$ApiBaseUrl = $(if ($env:SMOKE_API_BASE_URL) { $env:SMOKE_API_BASE_URL } elseif ($BaseUrl) { $BaseUrl } else { "http://localhost:3001" }),
  [string]$WebBaseUrl = $(if ($env:SMOKE_WEB_BASE_URL) { $env:SMOKE_WEB_BASE_URL } elseif ($BaseUrl) { $BaseUrl } else { "http://localhost:3005" }),
  [string]$SwaggerUrl = $(if ($env:SMOKE_SWAGGER_URL) { $env:SMOKE_SWAGGER_URL } elseif ($BaseUrl) { "$($BaseUrl.TrimEnd('/'))/api/docs" } else { "$($ApiBaseUrl.TrimEnd('/'))/docs" })
)

$ErrorActionPreference = "Stop"

function Assert-HttpStatus {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][int]$ExpectedStatus,
    [string]$User,
    [string]$Password
  )

  $headers = @{}
  if ($User -and $Password) {
    $token = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${User}:${Password}"))
    $headers["Authorization"] = "Basic $token"
  }

  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 20 -UseBasicParsing -Headers $headers
  }
  catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq $ExpectedStatus) {
      Write-Host "[smoke] $Name ok ($ExpectedStatus)"
      return
    }
    Write-Error "[smoke] $Name failed -> $Url :: $($_.Exception.Message)"
    exit 1
  }

  if ($response.StatusCode -ne $ExpectedStatus) {
    Write-Error "[smoke] $Name failed ($($response.StatusCode), expected $ExpectedStatus) -> $Url"
    exit 1
  }

  Write-Host "[smoke] $Name ok ($ExpectedStatus)"
}

function Assert-Http200 {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Url
  )
  Assert-HttpStatus -Name $Name -Url $Url -ExpectedStatus 200
}

$apiBase = $ApiBaseUrl.TrimEnd('/')
$webBase = $WebBaseUrl.TrimEnd('/')

Assert-Http200 -Name "api ready" -Url "$apiBase/health/ready"
Assert-Http200 -Name "web root" -Url "$webBase/"

if ($IsStaging.ToLowerInvariant() -eq "true") {
  if ($env:SMOKE_SWAGGER_USER -and $env:SMOKE_SWAGGER_PASS) {
    Assert-HttpStatus -Name "api docs" -Url $SwaggerUrl -ExpectedStatus 200 -User $env:SMOKE_SWAGGER_USER -Password $env:SMOKE_SWAGGER_PASS
  }
  else {
    Assert-HttpStatus -Name "api docs protected" -Url $SwaggerUrl -ExpectedStatus 401
  }
}

Write-Host "[smoke] all checks passed"
