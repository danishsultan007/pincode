<#
.SYNOPSIS
  Pre-release checklist for pincode. Read-only: it never changes the repo, the
  databases or EAS.

.DESCRIPTION
  Runs every check (never stops early), prints PASS / WARN / FAIL / INFO per check,
  then a summary. Exit code 1 if any check FAILED, else 0.

.PARAMETER Mode
  Ota    publishing a JS-only update (eas update)
  Build  making a new native build (eas build)
  Db     database / Edge Function release only (no app update)

.PARAMETER Environment
  EAS environment whose variables are verified (preview | production). Default production.

.EXAMPLE
  .\scripts\release-check.ps1 -Mode Ota
  .\scripts\release-check.ps1 -Mode Build
  .\scripts\release-check.ps1 -Mode Db

  Works in Windows PowerShell 5.1 and PowerShell 7.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Ota', 'Build', 'Db')]
  [string]$Mode,

  [ValidateSet('preview', 'production')]
  [string]$Environment = 'production'
)

# Native commands write progress to stderr; don't let that become a terminating error.
$ErrorActionPreference = 'Continue'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$MobileDir = Join-Path $RepoRoot 'mobile'
$DevRef = 'dmbkyzdkmpyqgyyvcygs'
$ProdRef = 'jfvnahkskwhxgefmoiaz'
$EasUser = 'danishsultan007'

$script:Fails = 0
$script:Warns = 0

# ---------- output helpers ----------
function Write-Result([string]$Level, [string]$Name, [string]$Reason) {
  $color = 'Gray'
  switch ($Level) {
    'PASS' { $color = 'Green' }
    'WARN' { $color = 'Yellow'; $script:Warns++ }
    'FAIL' { $color = 'Red'; $script:Fails++ }
    'INFO' { $color = 'Cyan' }
  }
  Write-Host ('[{0}] ' -f $Level) -ForegroundColor $color -NoNewline
  Write-Host ('{0}: {1}' -f $Name, $Reason)
}

# Run a native command in a directory; returns @{ Code; Lines } (stdout+stderr merged as strings).
function Invoke-Native([string]$Dir, [string]$Exe, [string[]]$CmdArgs) {
  Push-Location $Dir
  try {
    $lines = @(& $Exe @CmdArgs 2>&1 | ForEach-Object { "$_" })
    $code = $LASTEXITCODE
  } catch {
    $lines = @("$_")
    $code = 1
  } finally {
    Pop-Location
  }
  return @{ Code = $code; Lines = $lines }
}

function Get-Tail([string[]]$Lines, [int]$N = 6) {
  $clean = @($Lines | Where-Object { $_ -and $_.Trim() })
  if ($clean.Count -gt $N) { $clean = $clean[($clean.Count - $N)..($clean.Count - 1)] }
  return ($clean -join "`n      ")
}

# Parse `supabase migration list` output. The CLI prints JSON only in "agent" or json-output mode
# (a plain terminal prints a text table), so callers pass `--agent yes --output-format json`
# explicitly. Returns @{ Ok; Pending; Reason }. Ok is $false (=> caller must FAIL) for a non-zero
# exit, unparsable output, an {"_tag":"Error"} object, or an object without a `migrations`
# property. A migration is pending when it has a local version and an empty/missing remote one.
function Get-PendingMigrations($Result) {
  if ($Result.Code -ne 0) {
    return @{ Ok = $false; Pending = @(); Reason = "supabase exited $($Result.Code)" }
  }
  $jsonLine = $Result.Lines | Where-Object { $_ -match '^\s*\{' } | Select-Object -First 1
  if (-not $jsonLine) { return @{ Ok = $false; Pending = @(); Reason = 'no JSON in output' } }
  try { $data = $jsonLine | ConvertFrom-Json } catch { return @{ Ok = $false; Pending = @(); Reason = 'output is not valid JSON' } }
  if ($data.PSObject.Properties.Name -contains '_tag' -and [string]$data._tag -eq 'Error') {
    return @{ Ok = $false; Pending = @(); Reason = 'CLI reported an error' }
  }
  if (-not ($data.PSObject.Properties.Name -contains 'migrations')) {
    return @{ Ok = $false; Pending = @(); Reason = "JSON has no 'migrations' field" }
  }
  $pending = @()
  foreach ($m in @($data.migrations)) {
    if ($m.local -and -not $m.remote) { $pending += [string]$m.local }
  }
  return @{ Ok = $true; Pending = $pending; Reason = '' }
}
function Read-SecretFile([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return (Get-Content $Path -Raw).Trim()
}

Write-Host ''
Write-Host ("pincode release check  |  mode: {0}  |  environment: {1}" -f $Mode, $Environment) -ForegroundColor White
Write-Host ('repo: ' + $RepoRoot)
Write-Host ''

# ---------- 1. branch ----------
$branch = ((Invoke-Native $RepoRoot 'git' @('rev-parse', '--abbrev-ref', 'HEAD')).Lines -join '').Trim()
if ($branch -eq 'main' -or $branch -like 'hotfix/*') {
  Write-Result 'PASS' 'Branch' "on '$branch'"
} else {
  Write-Result 'FAIL' 'Branch' "on '$branch'; release from 'main' or 'hotfix/*'"
}

# ---------- 2. clean tree ----------
$porcelain = @((Invoke-Native $RepoRoot 'git' @('status', '--porcelain')).Lines | Where-Object { $_ -and $_.Trim() })
if ($porcelain.Count -eq 0) {
  Write-Result 'PASS' 'Working tree' 'clean'
} else {
  Write-Result 'FAIL' 'Working tree' ("{0} uncommitted change(s); commit or stash first (e.g. {1})" -f $porcelain.Count, $porcelain[0].Trim())
}

# ---------- 3. pushed ----------
[void](Invoke-Native $RepoRoot 'git' @('fetch', '--quiet'))
$lr = Invoke-Native $RepoRoot 'git' @('rev-list', '--left-right', '--count', 'HEAD...@{u}')
if ($lr.Code -ne 0) {
  Write-Result 'FAIL' 'Pushed' 'no upstream branch configured (git push -u origin <branch>)'
} else {
  $parts = (($lr.Lines -join ' ').Trim()) -split '\s+'
  if ($parts.Count -ge 2 -and $parts[0] -eq '0' -and $parts[1] -eq '0') {
    Write-Result 'PASS' 'Pushed' 'HEAD matches upstream'
  } else {
    Write-Result 'FAIL' 'Pushed' ("ahead {0} / behind {1} vs upstream; push or pull first" -f $parts[0], $parts[1])
  }
}

# ---------- 4. typecheck ----------
$tc = Invoke-Native $MobileDir 'npm.cmd' @('run', 'typecheck')
if ($tc.Code -eq 0) {
  Write-Result 'PASS' 'Typecheck' 'tsc --noEmit clean'
} else {
  Write-Result 'FAIL' 'Typecheck' ("npm run typecheck exited {0}`n      {1}" -f $tc.Code, (Get-Tail $tc.Lines))
}

# ---------- 5. expo-doctor ----------
$doc = Invoke-Native $MobileDir 'npx.cmd' @('expo-doctor')
if ($doc.Code -eq 0) {
  Write-Result 'PASS' 'expo-doctor' 'all checks passed'
} else {
  Write-Result 'FAIL' 'expo-doctor' ("exited {0}`n      {1}" -f $doc.Code, (Get-Tail $doc.Lines))
}

# ---------- 6. expo install --check ----------
# How PASS/FAIL is decided: `npx expo install --check` only REPORTS (it never edits files;
# `--fix` is the flag that edits). In SDK 57 it exits 0 and prints "Dependencies are up to date"
# when everything matches the SDK's expected versions. When something is off it lists the
# packages and exits non-zero. Because our output is captured (not a TTY), the CLI cannot
# prompt. PASS = exit 0 AND that sentence present.
$ic = Invoke-Native $MobileDir 'npx.cmd' @('expo', 'install', '--check')
$icText = $ic.Lines -join "`n"
if ($ic.Code -eq 0 -and $icText -match 'up to date') {
  Write-Result 'PASS' 'expo install --check' 'dependencies match the Expo SDK'
} else {
  Write-Result 'FAIL' 'expo install --check' ("versions differ from the SDK (fix with: npx.cmd expo install --fix)`n      {0}" -f (Get-Tail $ic.Lines))
}

# ---------- 7. npm audit (WARN only) ----------
$au = Invoke-Native $MobileDir 'npm.cmd' @('audit', '--omit=dev', '--json')
$auJson = $null
try {
  $start = ($au.Lines -join "`n")
  $idx = $start.IndexOf('{')
  if ($idx -ge 0) { $auJson = $start.Substring($idx) | ConvertFrom-Json }
} catch { $auJson = $null }
if ($null -eq $auJson -or $null -eq $auJson.vulnerabilities) {
  Write-Result 'WARN' 'npm audit' 'could not read audit output (offline?); skipped'
} else {
  $bad = @()
  foreach ($p in $auJson.vulnerabilities.PSObject.Properties) {
    $sev = [string]$p.Value.severity
    if ($sev -eq 'high' -or $sev -eq 'critical') { $bad += ('{0} ({1})' -f $p.Name, $sev) }
  }
  if ($bad.Count -eq 0) {
    Write-Result 'PASS' 'npm audit' 'no high/critical findings in production dependencies'
  } else {
    $shown = ($bad | Select-Object -First 10) -join ', '
    $more = ''
    if ($bad.Count -gt 10) { $more = ' ...' }
    Write-Result 'WARN' 'npm audit' ("{0} high/critical: {1}{2}" -f $bad.Count, $shown, $more)
    Write-Host '      Reminder: findings in Expo / Metro / CLI / build tooling never ship in the app (noise).' -ForegroundColor DarkYellow
    Write-Host '      Act only if a package that runs INSIDE the app (supabase-js, react-query, ...) has a' -ForegroundColor DarkYellow
    Write-Host '      high/critical issue with a fix in range. Never run `npm audit fix --force`.' -ForegroundColor DarkYellow
  }
}

# ---------- 8. Supabase CLI link ----------
$refFile = Join-Path $RepoRoot 'supabase\.temp\project-ref'
$linked = $null
if (Test-Path $refFile) { $linked = (Get-Content $refFile -Raw).Trim() }
if ($linked -eq $DevRef) {
  Write-Result 'PASS' 'Supabase CLI link' 'linked to DEV (safe default)'
} elseif ($linked -eq $ProdRef) {
  Write-Result 'FAIL' 'Supabase CLI link' 'linked to PROD; relink to dev: npx.cmd supabase link --project-ref dmbkyzdkmpyqgyyvcygs'
} elseif ($linked) {
  Write-Result 'FAIL' 'Supabase CLI link' "linked to unknown project '$linked'"
} else {
  Write-Result 'FAIL' 'Supabase CLI link' 'supabase\.temp\project-ref missing; run: npx.cmd supabase link --project-ref dmbkyzdkmpyqgyyvcygs'
}

# ---------- 9. dev migrations ----------
$devPw = Read-SecretFile (Join-Path $RepoRoot '.secrets\pincode-dev-db-password.txt')
if (-not $devPw) {
  Write-Result 'FAIL' 'Dev migrations' '.secrets\pincode-dev-db-password.txt is missing; cannot check dev'
} elseif ($linked -ne $DevRef) {
  Write-Result 'FAIL' 'Dev migrations' 'skipped: CLI is not linked to dev (see check above), would query the wrong project'
} else {
  $ml = Invoke-Native $RepoRoot 'npx.cmd' @('supabase', 'migration', 'list', '--linked', '-p', $devPw, '--agent', 'yes', '--output-format', 'json')
  $pr = Get-PendingMigrations $ml; $pend = $pr.Pending
  if (-not $pr.Ok) {
    Write-Result 'FAIL' 'Dev migrations' ("could not read migration state: {0}`n      {1}" -f $pr.Reason, ((Get-Tail $ml.Lines 3) -replace [regex]::Escape($devPw), '***'))
  } elseif ($pend.Count -eq 0) {
    Write-Result 'PASS' 'Dev migrations' 'all local migrations applied on dev'
  } else {
    Write-Result 'FAIL' 'Dev migrations' ("{0} pending on dev: {1}. Apply: npx.cmd supabase db push --linked -p <devpw>" -f $pend.Count, ($pend -join ', '))
  }
}

# ---------- 10. prod migrations ----------
$prodUrl = Read-SecretFile (Join-Path $RepoRoot '.secrets\prod-db-url.txt')
if (-not $prodUrl) {
  Write-Result 'FAIL' 'Prod migrations' '.secrets\prod-db-url.txt is missing; cannot check prod'
} else {
  $ml = Invoke-Native $RepoRoot 'npx.cmd' @('supabase', 'migration', 'list', '--db-url', $prodUrl, '--agent', 'yes', '--output-format', 'json')
  $pr = Get-PendingMigrations $ml; $pend = $pr.Pending
  if (-not $pr.Ok) {
    # Mask the URL before showing any output.
    $tail = (Get-Tail $ml.Lines 3) -replace [regex]::Escape($prodUrl), '<prod-url>'
    Write-Result 'FAIL' 'Prod migrations' ("could not read migration state: {0}`n      {1}" -f $pr.Reason, $tail)
  } elseif ($Mode -eq 'Db') {
    if ($pend.Count -eq 0) {
      Write-Result 'INFO' 'Prod migrations' 'nothing pending on prod'
    } else {
      Write-Result 'INFO' 'Prod migrations' ("{0} pending on prod: {1}" -f $pend.Count, ($pend -join ', '))
    }
  } elseif ($pend.Count -eq 0) {
    Write-Result 'PASS' 'Prod migrations' 'prod is up to date (DB changes are ahead of the app)'
  } else {
    Write-Result 'FAIL' 'Prod migrations' ("{0} pending on prod: {1}. Push DB changes to prod BEFORE the app update (RELEASING.md section 6)" -f $pend.Count, ($pend -join ', '))
  }
}

# ---------- 11. RUN_ALL in sync ----------
$runAll = Join-Path $RepoRoot 'supabase\RUN_ALL_MIGRATIONS.sql'
if (-not (Test-Path $runAll)) {
  Write-Result 'FAIL' 'RUN_ALL_MIGRATIONS' 'supabase\RUN_ALL_MIGRATIONS.sql not found'
} else {
  $runAllText = Get-Content $runAll -Raw
  $missing = @()
  foreach ($f in Get-ChildItem (Join-Path $RepoRoot 'supabase\migrations') -Filter '*.sql') {
    if (-not $runAllText.Contains('-- ---- ' + $f.Name + ' ----')) { $missing += $f.Name }
  }
  if ($missing.Count -eq 0) {
    Write-Result 'PASS' 'RUN_ALL_MIGRATIONS' 'every migration has its header in the combined file'
  } else {
    Write-Result 'FAIL' 'RUN_ALL_MIGRATIONS' ("missing from RUN_ALL: {0}" -f ($missing -join ', '))
  }
}

# ---------- 12. EAS login ----------
$who = Invoke-Native $MobileDir 'npx.cmd' @('eas-cli', 'whoami')
if (($who.Lines -join "`n") -match [regex]::Escape($EasUser)) {
  Write-Result 'PASS' 'EAS login' "logged in as $EasUser"
} else {
  Write-Result 'FAIL' 'EAS login' 'not logged in as danishsultan007 (run: npx.cmd eas-cli login)'
}

# ---------- 13. EAS env points at prod ----------
# `eas env:list <env>` prints plaintext vars (EXPO_PUBLIC_* are plaintext). We extract only
# the SUPABASE_URL line, so the anon key is never printed.
$envOut = Invoke-Native $MobileDir 'npx.cmd' @('eas-cli', 'env:list', $Environment)
$urlLine = $envOut.Lines | Where-Object { $_ -match '^\s*EXPO_PUBLIC_SUPABASE_URL\s*=' } | Select-Object -First 1
if (-not $urlLine) {
  Write-Result 'FAIL' 'EAS env' "EXPO_PUBLIC_SUPABASE_URL not found in EAS environment '$Environment'"
} elseif ($urlLine -match [regex]::Escape($DevRef)) {
  Write-Result 'FAIL' 'EAS env' "'$Environment' points at the DEV backend!"
} elseif ($urlLine -match [regex]::Escape($ProdRef)) {
  Write-Result 'PASS' 'EAS env' "'$Environment' EXPO_PUBLIC_SUPABASE_URL -> prod ($ProdRef)"
} else {
  Write-Result 'FAIL' 'EAS env' "'$Environment' EXPO_PUBLIC_SUPABASE_URL does not contain the prod ref: $($urlLine.Trim())"
}

# ---------- 14. version vs latest build ----------
$cfg = Get-Content (Join-Path $MobileDir 'app.config.ts') -Raw
$version = $null
if ($cfg -match "version:\s*'([^']+)'") { $version = $Matches[1] }

# Returns @{ Ok; Build } for the latest FINISHED android build of a profile.
# Ok=$false means the command failed or its output could not be parsed (unknown, not "none").
# Stray text before the JSON (CLI notices, "[warn]" lines) is tolerated: we try every '['
# until one parses as JSON.
function Get-LatestBuild([string]$Profile) {
  $r = Invoke-Native $MobileDir 'npx.cmd' @('eas-cli', 'build:list', '--platform', 'android', '--build-profile', $Profile, '--status', 'finished', '--limit', '1', '--non-interactive', '--json')
  if ($r.Code -ne 0) { return @{ Ok = $false; Build = $null } }
  $text = $r.Lines -join "`n"
  $i = $text.IndexOf('[')
  while ($i -ge 0) {
    try {
      # Windows PowerShell 5.1 emits a JSON array as ONE object; foreach flattens both 5.1 and 7.
      $parsed = $text.Substring($i) | ConvertFrom-Json
      $arr = @()
      foreach ($x in $parsed) { if ($null -ne $x) { $arr += $x } }
      if ($arr.Count -eq 0) { return @{ Ok = $true; Build = $null } }
      if ($arr[0].PSObject.Properties.Name -contains 'appVersion') { return @{ Ok = $true; Build = $arr[0] } }
    } catch { }
    $i = $text.IndexOf('[', $i + 1)
  }
  # "[]" with surrounding text can fail to parse above; accept an explicit empty array.
  if ($text -match '\[\s*\]') { return @{ Ok = $true; Build = $null } }
  return @{ Ok = $false; Build = $null }
}

if (-not $version) {
  Write-Result 'FAIL' 'Version' "could not read version from mobile\app.config.ts"
} else {
  $lb = Get-LatestBuild 'production'
  $build = $lb.Build
  $profileUsed = 'production'
  $readOk = $lb.Ok
  if ($lb.Ok -and $null -eq $build) {
    $lb = Get-LatestBuild 'preview'
    $build = $lb.Build
    $readOk = $lb.Ok
    $profileUsed = 'preview'
    if ($null -ne $build) {
      Write-Result 'INFO' 'Builds' 'no finished production build yet; comparing against the latest finished PREVIEW build'
    }
  }
  if (-not $readOk) {
    $lvl = 'INFO'
    if ($Mode -eq 'Ota') { $lvl = 'FAIL' }
    Write-Result $lvl 'Version vs builds' "could not read the EAS build list (command failed or unparsable); cannot confirm installed builds match version $version"
  } elseif ($null -eq $build) {
    $lvl = 'INFO'
    if ($Mode -eq 'Ota') { $lvl = 'FAIL' }
    Write-Result $lvl 'Version vs builds' "app.config version is $version; no finished Android build on EAS, so no installed build would receive an OTA"
  } else {
    $bv = [string]$build.appVersion
    $desc = "latest finished $profileUsed build has appVersion $bv (build $($build.appBuildVersion))"
    if ($Mode -eq 'Ota') {
      if ($version -eq $bv) {
        Write-Result 'PASS' 'Version vs builds' "version $version matches; $desc. Installed builds will receive this OTA"
      } else {
        Write-Result 'FAIL' 'Version vs builds' "version $version != $bv. $desc. No installed build would receive an OTA published as $version"
      }
    } elseif ($Mode -eq 'Build') {
      if ($version -eq $bv) {
        Write-Result 'WARN' 'Version vs builds' "version $version is unchanged; $desc. Forgot to bump version in app.config.ts?"
      } else {
        Write-Result 'PASS' 'Version vs builds' "version $version is new; $desc"
      }
    } else {
      Write-Result 'INFO' 'Version vs builds' "version $version; $desc"
    }
  }
}
# ---------- 15. changelog ----------
$clPath = Join-Path $RepoRoot 'CHANGELOG.md'
if (-not $version) {
  Write-Result 'WARN' 'CHANGELOG' 'skipped (version unknown)'
} elseif (-not (Test-Path $clPath)) {
  Write-Result 'WARN' 'CHANGELOG' 'CHANGELOG.md not found'
} else {
  $hasHeading = Get-Content $clPath | Where-Object { $_ -match '^#{1,3}\s' -and $_.Contains($version) } | Select-Object -First 1
  if ($hasHeading) {
    Write-Result 'PASS' 'CHANGELOG' "has a heading for $version"
  } else {
    Write-Result 'WARN' 'CHANGELOG' "no heading containing $version (write the entry in the PLAN step)"
  }
}

# ---------- 16. info summary ----------
$tag = ((Invoke-Native $RepoRoot 'git' @('describe', '--tags', '--abbrev=0')).Lines -join '').Trim()
if ($tag -match 'fatal|No names|No tags') { $tag = '(none)' }
if (-not $tag) { $tag = '(none)' }
$short = ((Invoke-Native $RepoRoot 'git' @('rev-parse', '--short', 'HEAD')).Lines -join '').Trim()
Write-Result 'INFO' 'Summary' ("version {0} | latest tag {1} | HEAD {2}" -f $version, $tag, $short)

# ---------- result ----------
Write-Host ''
if ($script:Fails -gt 0) {
  Write-Host ("RESULT: FAIL ({0} failed, {1} warnings)" -f $script:Fails, $script:Warns) -ForegroundColor Red
  exit 1
} else {
  Write-Host ("RESULT: PASS ({0} warnings)" -f $script:Warns) -ForegroundColor Green
  exit 0
}
