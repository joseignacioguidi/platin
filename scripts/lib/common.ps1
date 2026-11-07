# Helpers shared by the db scripts. Dot-source it after setting $Root and $LogFile.
# Compatible with Windows PowerShell 5.1.

$DockerWaitSeconds = 180

function Write-Log([string]$Message) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line # not Write-Output: it would leak into the return value of the caller
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

# Value from the environment, else from the repo's .env.
function Get-EnvValue([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ($value) { return $value }
  $envFile = Join-Path $Root '.env'
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile) {
    if ($line -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*?)\s*$')) {
      return $Matches[1].Trim('"', "'")
    }
  }
  return $null
}

# Native stderr under 'Stop' turns into terminating errors in 5.1, so relax it around docker calls.
function Invoke-Native([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $Command 2>&1 | ForEach-Object { "$_" }
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Test-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return $false }
  return (Invoke-Native { docker info }).ExitCode -eq 0
}

function Start-DockerIfNeeded {
  if (Test-Docker) { return $true }
  $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $desktop)) { return $false }
  Write-Log 'Docker is not running; starting Docker Desktop'
  Start-Process -FilePath $desktop | Out-Null
  $deadline = (Get-Date).AddSeconds($DockerWaitSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 5
    if (Test-Docker) { return $true }
  }
  return $false
}

# Logs the output of a docker run and fails with $Message if it exited with an error.
function Assert-NativeResult($Result, [string]$Message) {
  foreach ($line in $Result.Output) { if ($line) { Write-Log "  $line" } }
  if ($Result.ExitCode -ne 0) { Exit-WithError "$Message (exit code $($Result.ExitCode))" }
}
