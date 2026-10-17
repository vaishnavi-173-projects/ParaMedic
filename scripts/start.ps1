# ParaMedic Quick Launcher (PowerShell)
# Launches both the Express API and the React Dashboard in separate windows.

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ServerDir = Join-Path $Root 'server'
$ClientDir = Join-Path $Root 'client'

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "  ParaMedic Quick Launcher" -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan

# 1. Check C++ engine executable
$ReleaseExe = Join-Path $Root 'engine\build\Release\paramedic_engine.exe'
$DirectExe = Join-Path $Root 'engine\build\paramedic_engine.exe'
if (-not (Test-Path $ReleaseExe) -and -not (Test-Path $DirectExe)) {
    Write-Warning "Routing engine executable not found. Running scripts\build.ps1 first..."
    & (Join-Path $Root 'scripts\build.ps1')
}

# 2. Start API Server in new window and wait for its real health response.
Write-Host "Starting Node.js / Express API on http://localhost:4000..." -ForegroundColor Green
$ApiCommand = "`$env:PORT = '4000'; Set-Location -LiteralPath '$ServerDir'; Write-Host '--- ParaMedic API Server ---' -ForegroundColor Cyan; npm start"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $ApiCommand

$ApiReady = $false
for ($Attempt = 1; $Attempt -le 20; $Attempt++) {
    try {
        $Health = Invoke-RestMethod -Uri 'http://localhost:4000/api/health' -TimeoutSec 2
        if ($Health.ok -eq $true) {
            $ApiReady = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}
if (-not $ApiReady) {
    throw "The API did not become healthy at http://localhost:4000/api/health. Check the API PowerShell window."
}

# 3. Start React Dashboard in new window with the canonical API endpoint.
Write-Host "Starting React + Vite Dashboard on http://localhost:5173..." -ForegroundColor Green
$DashboardCommand = "`$env:VITE_API_BASE_URL = 'http://localhost:4000/api'; Set-Location -LiteralPath '$ClientDir'; Write-Host '--- ParaMedic Dashboard ---' -ForegroundColor Cyan; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $DashboardCommand

Write-Host "`nBoth services launched in separate windows!" -ForegroundColor Yellow
Write-Host "API Health: http://localhost:4000/api/health" -ForegroundColor Gray
Write-Host "Dashboard:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "`nTo stop services, close the spawned PowerShell windows or press Ctrl+C in each." -ForegroundColor Gray
