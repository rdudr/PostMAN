<#
    Registers the EASS API as a scheduled task that starts with the machine,
    the way FastAPI-main already does on this server.

    Run it once, in an ADMINISTRATOR PowerShell, on the AI server:
        powershell -ExecutionPolicy Bypass -File .\install-task.ps1

    "At startup" matters: a task that only runs at logon does not come back
    after a power cut until somebody signs in, and a report tool that cannot
    reach its server is a report tool nobody trusts.
#>
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$run  = Join-Path $here "run-eass-api.ps1"
if (-not (Test-Path $run)) { throw "run-eass-api.ps1 is not beside this script." }

$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
             -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$run`""
$trigger  = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
             -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName "EASS-API" -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "EASS-API"
Start-Sleep -Seconds 4

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8800/api/health" -TimeoutSec 10
    Write-Host ("  EASS-API is up: {0}, {1} user(s), {2} report(s)." -f $health.engine, $health.users, $health.reports) -ForegroundColor Green
    Write-Host "  Now add the tunnel route - see cloudflared-ingress.md beside this script."
} catch {
    Write-Warning "The task is registered but the API did not answer on 127.0.0.1:8800."
    Write-Warning "Run run-eass-api.ps1 by hand in a window to see what it says."
}
