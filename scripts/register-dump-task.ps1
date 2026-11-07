# Registers (or removes) a daily Windows scheduled task that runs scripts/neon-dump.ps1.
# Usage: pnpm db:dump:schedule              (daily at 09:00)
#        powershell -File scripts/register-dump-task.ps1 -At 21:30
#        powershell -File scripts/register-dump-task.ps1 -Unregister
# Runs as the current user, only while signed in (Docker Desktop needs the session).
# If the PC was off at that time, it runs as soon as it can.

param(
  [string]$At = '09:00',
  [switch]$Unregister
)

$ErrorActionPreference = 'Stop'
$TaskName = 'platin-neon-dump'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Task '$TaskName' removed"
  exit 0
}

$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $PSScriptRoot 'neon-dump.ps1'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $root `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'platin: daily pg_dump of Neon into dump.sql' -Force | Out-Null

Write-Output "Task '$TaskName' registered: daily at $At (log in dumps/dump.log)"
