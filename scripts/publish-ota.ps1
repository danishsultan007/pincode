<#
.SYNOPSIS
  Publish a JS-only OTA update (eas update) safely.

.DESCRIPTION
  1. Runs release-check.ps1 -Mode Ota (stops if it fails).
  2. Hides mobile\.env (DEV values) and exports the bundle under the target EAS
     environment (`eas env:exec <env> "npx expo export ..."`), because EXPO_PUBLIC_*
     values are baked in at EXPORT time.
  3. Scans mobile\dist BEFORE publishing: DEV ref must be absent, PROD ref present.
     Otherwise it aborts and nothing is live.
  4. `eas update --skip-bundler --input-dir dist` publishes exactly the scanned bundle.
  5. Reminds about source maps, prints suggested git tag commands.

.PARAMETER Channel
  preview | production. Used for BOTH --channel and --environment.

.PARAMETER Message
  Update message shown in the EAS dashboard (also used in the tag message).
  Must NOT contain any of  " & | < > ^ %  : npx.cmd re-parses arguments through cmd.exe and
  would break or split the command. The script REFUSES such a message (it does not strip).

.PARAMETER SkipChecks
  EMERGENCY HOTFIX ONLY. Skips release-check.ps1. Prints a loud warning.

.EXAMPLE
  .\scripts\publish-ota.ps1 -Channel production -Message "fix: feed crash on empty communities"

  Works in Windows PowerShell 5.1 and PowerShell 7.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('preview', 'production')]
  [string]$Channel,

  [Parameter(Mandatory = $true)]
  [string]$Message,

  [switch]$SkipChecks
)

$ErrorActionPreference = 'Continue'

# Refuse messages that cmd.exe would mis-parse (see .PARAMETER Message).
if ($Message -match '["&|<>^%]') {
  Write-Host 'The -Message contains one of  "  &  |  <  >  ^  %  which break npx.cmd argument passing.' -ForegroundColor Red
  Write-Host 'Remove those characters and run again.' -ForegroundColor Red
  exit 1
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$MobileDir = Join-Path $RepoRoot 'mobile'
$DevRef = 'dmbkyzdkmpyqgyyvcygs'
$ProdRef = 'jfvnahkskwhxgefmoiaz'

# ---------- 1. pre-flight checks ----------
if ($SkipChecks) {
  Write-Host '!!! WARNING: -SkipChecks given. No pre-flight checks were run. !!!' -ForegroundColor Red
  Write-Host '!!! Emergency hotfix only. The bundle guard below still runs. !!!' -ForegroundColor Red
} else {
  # Run in a child process so release-check's `exit` cannot end this script.
  $shell = (Get-Process -Id $PID).Path
  & $shell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'release-check.ps1') -Mode Ota -Environment $Channel
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'STOP: release-check.ps1 failed. Fix the FAIL lines above and run this again.' -ForegroundColor Red
    Write-Host '(Genuine emergency hotfix only: add -SkipChecks.)' -ForegroundColor Yellow
    exit 1
  }
}

# Version, for the tag suggestion.
$cfg = Get-Content (Join-Path $MobileDir 'app.config.ts') -Raw
$version = $null
if ($cfg -match "version:\s*'([^']+)'") { $version = $Matches[1] }

# ---------- 2. hide .env, export under the EAS environment ----------
$envFile = Join-Path $MobileDir '.env'
$envBak = Join-Path $MobileDir '.env.devbak'

# Recover from a previous crashed run.
if ((Test-Path $envBak) -and -not (Test-Path $envFile)) {
  Write-Host 'Found a leftover .env.devbak from an earlier run; restoring it first.' -ForegroundColor Yellow
  Move-Item $envBak $envFile
} elseif ((Test-Path $envBak) -and (Test-Path $envFile)) {
  Write-Host 'Both mobile\.env and mobile\.env.devbak exist. Resolve by hand, then re-run.' -ForegroundColor Red
  exit 1
}

# Clear any stale export so the guard only scans THIS export.
$distDir = Join-Path $MobileDir 'dist'
if (Test-Path $distDir) { Get-ChildItem $distDir -Force | Remove-Item -Recurse -Force }

$moved = $false
$publishOutput = @()
$publishCode = 1
try {
  if (Test-Path $envFile) {
    Move-Item $envFile $envBak
    $moved = $true
    Write-Host 'mobile\.env hidden for the duration of the publish.' -ForegroundColor DarkGray
  }

  Push-Location $MobileDir
  try {
    Write-Host "Exporting bundle under EAS environment '$Channel'..." -ForegroundColor White
    & npx.cmd eas-cli env:exec $Channel 'npx expo export --platform android --output-dir dist' --non-interactive
    $exportCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($exportCode -ne 0) {
    Write-Host "Export failed (exit $exportCode). NOTHING was published." -ForegroundColor Red
    exit 1
  }

  # ---------- 3. bundle guard (BEFORE publishing) ----------
  Write-Host ''
  Write-Host 'Bundle guard: scanning mobile\dist for backend references...' -ForegroundColor White
  $skipExt = '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ttf', '.otf', '.mp3', '.mp4', '.ico'
  $files = @()
  if (Test-Path $distDir) {
    $files = @(Get-ChildItem $distDir -Recurse -File | Where-Object { $skipExt -notcontains $_.Extension.ToLower() })
  }
  $problems = @()
  if ($files.Count -eq 0) {
    $problems += "No exported files found in $distDir; cannot verify the backend."
  } else {
    $devHit = $files | Select-String -SimpleMatch $DevRef -List | Select-Object -First 3
    $prodHit = $files | Select-String -SimpleMatch $ProdRef -List | Select-Object -First 1
    if ($devHit) { $problems += ('DEV ref found in: ' + (($devHit | ForEach-Object { $_.Path }) -join ', ')) }
    if (-not $prodHit) { $problems += 'PROD ref NOT found in the bundle.' }
  }
  if ($problems.Count -gt 0) {
    Write-Host '################################################################' -ForegroundColor Red
    Write-Host 'ABORTED BEFORE PUBLISH: the bundle points at the wrong backend. Nothing is live.' -ForegroundColor Red
    foreach ($p in $problems) { Write-Host "  $p" -ForegroundColor Red }
    Write-Host "  Check the EAS env:  npx.cmd eas-cli env:list $Channel" -ForegroundColor Red
    Write-Host '################################################################' -ForegroundColor Red
    exit 1
  }
  Write-Host 'Bundle guard OK: prod ref present, dev ref absent.' -ForegroundColor Green

  # ---------- 4. publish the already-exported, already-checked bundle ----------
  # --skip-bundler: do not rebuild, publish what is in dist. -p android matches the export.
  Push-Location $MobileDir
  try {
    $publishOutput = @(& npx.cmd eas-cli update --skip-bundler --input-dir dist -p android --channel $Channel --environment $Channel --message $Message --non-interactive 2>&1 |
        ForEach-Object { Write-Host "$_"; "$_" })
    $publishCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  # Always restore, also on Ctrl+C / errors / the exit calls above.
  if ($moved -and (Test-Path $envBak)) {
    Move-Item $envBak $envFile -Force
    Write-Host 'mobile\.env restored.' -ForegroundColor DarkGray
  }
}

# Update group id from the CLI output (for the rollback command).
$groupId = '<GROUP_ID>'
$gm = [regex]::Match(($publishOutput -join "`n"), '(?i)(?:update group id|group id|group)\W+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')
if ($gm.Success) { $groupId = $gm.Groups[1].Value }

# Syntax verified from `eas update:rollback --help`: GROUPID must be the latest update on the
# branch; it republishes the previous group (or rolls back to the embedded bundle if none).
$rollbackCmd = "npx.cmd eas-cli update:rollback $groupId --message `"rollback: bad OTA`" --non-interactive"

if ($publishCode -ne 0) {
  Write-Host ''
  Write-Host "eas update failed (exit $publishCode). Nothing was published unless the output above says so." -ForegroundColor Red
  exit 1
}

# ---------- 5. source maps reminder ----------
if ($env:SENTRY_AUTH_TOKEN) {
  Write-Host ''
  Write-Host 'Reminder: SENTRY_AUTH_TOKEN is set. Source maps for OTA bundles must be uploaded to Sentry' -ForegroundColor Yellow
  Write-Host 'or crash stack traces from this update stay minified. See the Sentry docs for' -ForegroundColor Yellow
  Write-Host '"Expo / EAS Update source maps" (docs.sentry.io, React Native -> Expo).' -ForegroundColor Yellow
}

# ---------- 6. tag suggestion ----------
$n = 1
if ($version) {
  $existing = @(& git -C $RepoRoot tag --list ("v{0}+ota.*" -f $version))
  $n = $existing.Count + 1
}
Write-Host ''
Write-Host 'Published. Tag this release:' -ForegroundColor Green
Write-Host ("  git tag -a `"v{0}+ota.{1}`" -m `"OTA: {2}`"" -f $version, $n, $Message)
Write-Host '  git push origin --tags'
Write-Host ''
Write-Host 'If it misbehaves, roll back with:' -ForegroundColor DarkGray
Write-Host "  $rollbackCmd" -ForegroundColor DarkGray
exit 0
