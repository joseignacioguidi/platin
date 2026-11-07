# Dumps the Neon database into dump.sql (repo root) and keeps dated copies in dumps/.
# Usage: pnpm db:dump   (or scheduled with scripts/register-dump-task.ps1)
# Needs Docker and NEON_DUMP_URL (environment or .env): Neon's direct connection string.
# To load it into the local database afterwards: pnpm db:restore
# Compatible with Windows PowerShell 5.1.

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$DumpsDir = Join-Path $Root 'dumps'
$LogFile = Join-Path $DumpsDir 'dump.log'
$TmpFile = Join-Path $DumpsDir 'dump.sql.tmp'
$Target = Join-Path $Root 'dump.sql'
$Image = 'postgres:18' # pg_dump must be the server's major version or newer (Neon runs 18)
$RetentionDays = 7

New-Item -ItemType Directory -Force $DumpsDir | Out-Null
. (Join-Path $PSScriptRoot 'lib\common.ps1')

function Exit-WithError([string]$Message) {
  Write-Log "ERROR: $Message"
  if (Test-Path $TmpFile) { Remove-Item $TmpFile -Force }
  exit 1
}

$url = Get-EnvValue 'NEON_DUMP_URL'
if (-not $url) { Exit-WithError 'NEON_DUMP_URL is not set (environment or .env)' }
if ($url -match '-pooler\.') { Exit-WithError 'NEON_DUMP_URL points to the pooler; use the direct connection string' }

if (-not (Start-DockerIfNeeded)) { Exit-WithError "Docker is not available after $DockerWaitSeconds s" }

Write-Log 'Dump started'
if (Test-Path $TmpFile) { Remove-Item $TmpFile -Force }

# The URL goes through an environment variable so it never shows up in a command line.
# pg_dump writes straight into the mounted folder: no PowerShell re-encoding of the output.
# 'set -f' keeps sh from globbing the '?' of the query string.
$env:PLATIN_DUMP_URL = $url
try {
  $result = Invoke-Native {
    docker run --rm -e PLATIN_DUMP_URL -v "${DumpsDir}:/out" $Image `
      sh -c 'set -f; exec pg_dump $PLATIN_DUMP_URL --no-owner --no-privileges -f /out/dump.sql.tmp'
  }
} finally {
  Remove-Item Env:\PLATIN_DUMP_URL -ErrorAction SilentlyContinue
}

Assert-NativeResult $result 'pg_dump failed'
if (-not (Test-Path $TmpFile)) { Exit-WithError 'pg_dump produced no file' }
if (-not (Select-String -Path $TmpFile -Pattern 'PostgreSQL database dump complete' -SimpleMatch -Quiet)) {
  Exit-WithError 'The dump is incomplete; dump.sql was left untouched'
}

# Replace dump.sql only once the new dump is known to be complete.
Move-Item -Path $TmpFile -Destination $Target -Force
$dated = Join-Path $DumpsDir ('dump-{0}.sql' -f (Get-Date -Format 'yyyy-MM-dd'))
Copy-Item -Path $Target -Destination $dated -Force

$limit = (Get-Date).Date.AddDays(-$RetentionDays)
Get-ChildItem -Path $DumpsDir -Filter 'dump-*.sql' |
  Where-Object { $_.LastWriteTime -lt $limit } |
  ForEach-Object { Remove-Item $_.FullName -Force; Write-Log "Deleted old copy $($_.Name)" }

# Keep the log short.
$lines = @(Get-Content $LogFile)
if ($lines.Count -gt 1000) { $lines[-500..-1] | Set-Content -Path $LogFile -Encoding UTF8 }

$sizeKb = [math]::Round((Get-Item $Target).Length / 1KB)
Write-Log "Dump finished: dump.sql ($sizeKb KB), copy $(Split-Path -Leaf $dated)"
