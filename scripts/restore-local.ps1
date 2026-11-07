# Replaces the LOCAL database with the contents of dump.sql (or -File).
# Usage: pnpm db:restore
#        powershell -File scripts/restore-local.ps1 -File dumps/dump-2026-11-07.sql
# Target: DATABASE_URL (environment or .env). Refuses any host other than this machine,
# so it can never overwrite Neon. Before restoring, it saves the current local data in
# dumps/local-before-restore-<timestamp>.sql (newest 5 kept). Everything runs in one transaction: if it fails, the
# local database stays as it was.
# Compatible with Windows PowerShell 5.1.

param(
  [string]$File = 'dump.sql'
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$DumpsDir = Join-Path $Root 'dumps'
$LogFile = Join-Path $DumpsDir 'dump.log'
$Image = 'postgres:18' # the dump uses psql 18 meta-commands (\restrict)
$BackupsToKeep = 5
$LocalHosts = @('localhost', '127.0.0.1', 'host.docker.internal')

New-Item -ItemType Directory -Force $DumpsDir | Out-Null
. (Join-Path $PSScriptRoot 'lib\common.ps1')

function Exit-WithError([string]$Message) {
  Write-Log "ERROR: $Message"
  exit 1
}

$source = if ([System.IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $Root $File }
if (-not (Test-Path $source)) { Exit-WithError "Dump file not found: $source" }
$source = (Resolve-Path $source).Path

$url = Get-EnvValue 'DATABASE_URL'
if (-not $url) { Exit-WithError 'DATABASE_URL is not set (environment or .env)' }
$uri = [System.Uri]$url
if ($LocalHosts -notcontains $uri.Host) {
  Exit-WithError "DATABASE_URL points to '$($uri.Host)', not to this machine; refusing to overwrite it"
}

# Seen from the container, this machine is host.docker.internal. The query string
# (e.g. Prisma's ?schema=public) is dropped because psql rejects unknown parameters.
$builder = New-Object System.UriBuilder $uri
$builder.Host = 'host.docker.internal'
$builder.Query = ''
$containerUrl = $builder.Uri.AbsoluteUri

if (-not (Start-DockerIfNeeded)) { Exit-WithError "Docker is not available after $DockerWaitSeconds s" }

$env:PLATIN_DB_URL = $containerUrl
$env:PLATIN_DUMP_FILE = Split-Path -Leaf $source
$sourceDir = Split-Path -Parent $source
try {
  Write-Log "Restore of $(Split-Path -Leaf $source) into the local database started"

  # One backup per restore (never overwritten), keeping the newest $BackupsToKeep.
  $env:PLATIN_BACKUP_FILE = 'local-before-restore-{0}.sql' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
  $backup = Invoke-Native {
    docker run --rm -e PLATIN_DB_URL -e PLATIN_BACKUP_FILE -v "${DumpsDir}:/out" $Image `
      sh -c 'set -f; exec pg_dump $PLATIN_DB_URL --no-owner --no-privileges -f /out/$PLATIN_BACKUP_FILE'
  }
  Assert-NativeResult $backup 'Backup of the local database failed; nothing was changed'
  Write-Log "Local data saved in dumps/$($env:PLATIN_BACKUP_FILE)"
  Get-ChildItem -Path $DumpsDir -Filter 'local-before-restore-*.sql' |
    Sort-Object Name -Descending | Select-Object -Skip $BackupsToKeep |
    ForEach-Object { Remove-Item $_.FullName -Force; Write-Log "Deleted old backup $($_.Name)" }

  $restore = Invoke-Native {
    docker run --rm -e PLATIN_DB_URL -e PLATIN_DUMP_FILE -v "${sourceDir}:/in:ro" $Image `
      sh -c 'set -f; exec psql $PLATIN_DB_URL -X -q -v ON_ERROR_STOP=1 -o /dev/null --single-transaction -c ''SET client_min_messages = warning'' -c ''DROP SCHEMA public CASCADE'' -c ''CREATE SCHEMA public'' -f /in/$PLATIN_DUMP_FILE'
  }
  Assert-NativeResult $restore 'Restore failed; the local database was left as it was'
} finally {
  Remove-Item Env:\PLATIN_DB_URL, Env:\PLATIN_DUMP_FILE, Env:\PLATIN_BACKUP_FILE -ErrorAction SilentlyContinue
}

Write-Log 'Restore finished: the local database now has the data of the dump'
