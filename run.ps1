# Starts the pincode mobile app's web dev server, optionally with a public
# ngrok tunnel in front of it.
#
# Usage (from the repo root, in PowerShell):
#   .\run.ps1            # local only  -> http://localhost:8081
#   .\run.ps1 -Ngrok      # local + a public https://...ngrok-free.dev URL
#
# Ctrl+C stops everything this script started.

param(
  [switch]$Ngrok,
  [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 8081 })
)

# Plain `npx`/`ngrok` can be missing from this shell's PATH even though
# they're installed (a fresh PowerShell doesn't always pick up machine/user
# PATH changes made earlier in the same session) — rebuild it explicitly.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

$mobileDir = Join-Path $PSScriptRoot 'mobile'
if (-not (Test-Path $mobileDir)) {
  Write-Host "Can't find the mobile/ folder next to this script." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $mobileDir '.env'))) {
  Write-Host "mobile/.env is missing — the app will show its own 'Setup needed' screen until you fill it in (see SETUP.md)." -ForegroundColor Yellow
}

function Wait-ForPort([int]$Port, [int]$TimeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
      if ($response.StatusCode) { return $true }
    } catch {
      # Not up yet — Invoke-WebRequest throws on a non-2xx/3xx status too,
      # which still means the server IS listening, so treat that as ready.
      if ($_.Exception.Response) { return $true }
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

if (-not $Ngrok) {
  # Local only: run the dev server directly in this window. Ctrl+C stops it.
  Write-Host "Starting the app at http://localhost:$Port ..." -ForegroundColor Green
  Push-Location $mobileDir
  try {
    npx.cmd expo start --web --port $Port
  } finally {
    Pop-Location
  }
  return
}

# --ngrok: run the dev server in the background, wait for it to come up,
# then run ngrok in the foreground so its URL is the last thing printed.
# Stopping ngrok (Ctrl+C) also stops the dev server in the finally block.
Write-Host "Starting the app in the background..." -ForegroundColor Green
$expo = Start-Process -FilePath 'npx.cmd' -ArgumentList "expo start --web --port $Port" `
  -WorkingDirectory $mobileDir -WindowStyle Hidden -PassThru

try {
  Write-Host "Waiting for http://localhost:$Port to come up..." -ForegroundColor DarkGray
  if (-not (Wait-ForPort -Port $Port)) {
    Write-Host "The app didn't come up within 60s. Check mobile/.env and try '.\run.ps1' without -Ngrok to see the raw error." -ForegroundColor Red
    exit 1
  }
  Write-Host "App is up. Starting ngrok — your public URL will print below." -ForegroundColor Green
  Write-Host "First-time visitors see ngrok's own 'Visit Site' page once; that's normal, not an app error." -ForegroundColor DarkGray
  ngrok http $Port
} finally {
  Write-Host "Stopping the app..." -ForegroundColor DarkGray
  Stop-Process -Id $expo.Id -Force -ErrorAction SilentlyContinue
  # expo start spawns Metro as a child process tree; make sure it's gone too.
  Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match [regex]::Escape($mobileDir) } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}
