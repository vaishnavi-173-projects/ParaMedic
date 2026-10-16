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

# 2. Start API Server in new window
Write-Host "Starting Node.js / Express API on http://localhost:4000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ServerDir'; Write-Host '--- ParaMedic API Server ---' -ForegroundColor Cyan; npm start"

Start-Sleep -Seconds 2

# 3. Start React Dashboard in new window
Write-Host "Starting React + Vite Dashboard on http://localhost:5173..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ClientDir'; Write-Host '--- ParaMedic Dashboard ---' -ForegroundColor Cyan; npm run dev"

Write-Host "`nBoth services launched in separate windows!" -ForegroundColor Yellow
Write-Host "API Health: http://localhost:4000/api/health" -ForegroundColor Gray
Write-Host "Dashboard:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "`nTo stop services, close the spawned PowerShell windows or press Ctrl+C in each." -ForegroundColor Gray
