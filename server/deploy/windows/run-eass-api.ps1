<#
    Starts the EASS API on the AI server (DESKTOP-UH3VCQ5).

    It listens on 127.0.0.1:8800 and NOTHING ELSE ON THE NETWORK CAN REACH IT
    directly - that is the point. Cloudflare's tunnel, already running on this
    machine for api.eassiitgn.page, makes an OUTBOUND connection to Cloudflare
    and forwards https://eass.eassiitgn.page to this local port. IITGN's
    firewall never has to allow anything in, and the machine needs no public
    address.

    Settings come from server\.env beside the code; see .env.example.
#>
$ErrorActionPreference = "Stop"
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path          # ...\server\deploy\windows
$server = Split-Path -Parent (Split-Path -Parent $here)            # ...\server
$python = Join-Path (Split-Path -Parent $server) "venv\Scripts\python.exe"
if (-not (Test-Path $python)) { $python = "python" }               # fall back to whatever is on PATH

# .env, one KEY=value a line. Quotes are optional; # starts a comment.
$envFile = Join-Path $server ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $k, $v = $line.Split("=", 2)
            [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'), "Process")
        }
    }
} else {
    Write-Warning "No .env beside the code - copy .env.example to .env and fill it in."
}

Set-Location $server
# One worker: the SQLite file is one file, and a small team does not need two.
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8800 --workers 1
