# ParaMedic — Windows Smoke Test Suite (PowerShell)
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Exe = Join-Path $Root 'engine\build\Release\paramedic_engine.exe'
if (-not (Test-Path $Exe)) { $Exe = Join-Path $Root 'engine\build\paramedic_engine.exe' }
if (-not (Test-Path $Exe)) { Write-Error "Engine not built. Run scripts\build.ps1 first."; exit 1 }
$Nodes = Join-Path $Root 'engine\data\nodes.csv'
$Edges = Join-Path $Root 'engine\data\edges.csv'

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ParaMedic Smoke Test Suite" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$totalTests = 0; $passedTests = 0; $failedTests = 0

function Test-Check($condition, $name) {
    $script:totalTests++
    if ($condition) {
        Write-Host "  PASS: $name" -ForegroundColor Green
        $script:passedTests++
    } else {
        Write-Host "  FAIL: $name" -ForegroundColor Red
        $script:failedTests++
    }
}

# --- Test 1: Built-in engine tests ---
Write-Host "[1/6] Running built-in engine tests..." -ForegroundColor Yellow
$testLines = & $Exe $Nodes $Edges test 2>&1
$testJson = ($testLines | Where-Object { $_ -match '^\{.*"tests"' }) | Select-Object -First 1
try {
    $parsed = $testJson | ConvertFrom-Json
    Test-Check ($parsed.failed -eq 0) "All $($parsed.tests) built-in engine tests passed"
} catch {
    Test-Check $false "Engine test output parsing"
}

# --- Test 2: Sequential dispatch ---
Write-Host "`n[2/6] Testing sequential dispatch..." -ForegroundColor Yellow
$input = "9`nAMB-01 1`nAMB-02 6`nAMB-03 13`nAMB-04 10"
$seqOut = $input | & $Exe $Nodes $Edges sequential 1 2>&1
$seqJson = ($seqOut | Where-Object { $_ -match '^\{' }) | Select-Object -First 1
try {
    $seq = $seqJson | ConvertFrom-Json
    Test-Check ($seq.best_ambulance -ne $null) "Sequential: identified best ambulance ($($seq.best_ambulance))"
    Test-Check ($seq.mode -eq 'sequential') "Sequential: mode is sequential"
    Test-Check ($seq.candidates.Count -eq 4) "Sequential: evaluated 4 candidate ambulances"
} catch {
    Test-Check $false "Sequential dispatch output parsing"
}

# --- Test 3: Parallel dispatch ---
Write-Host "`n[3/6] Testing parallel dispatch..." -ForegroundColor Yellow
$parOut = $input | & $Exe $Nodes $Edges parallel 4 2>&1
$parJson = ($parOut | Where-Object { $_ -match '^\{' }) | Select-Object -First 1
try {
    $par = $parJson | ConvertFrom-Json
    Test-Check ($par.best_ambulance -ne $null) "Parallel: identified best ambulance ($($par.best_ambulance))"
    Test-Check ($par.threads -eq 4) "Parallel: thread count is 4"
} catch {
    Test-Check $false "Parallel dispatch output parsing"
}

# --- Test 4: Sequential/Parallel consistency ---
Write-Host "`n[4/6] Checking sequential/parallel consistency..." -ForegroundColor Yellow
try {
    $seqParsed = $seqJson | ConvertFrom-Json
    $parParsed = $parJson | ConvertFrom-Json
    Test-Check ($seqParsed.best_ambulance -eq $parParsed.best_ambulance) "Same best ambulance in both modes ($($seqParsed.best_ambulance))"
    $allMatch = $true
    for ($i = 0; $i -lt $seqParsed.candidates.Count; $i++) {
        $s = $seqParsed.candidates[$i]
        $p = $parParsed.candidates[$i]
        if ($s.ambulance_id -ne $p.ambulance_id -or
            $s.reachable -ne $p.reachable -or
            [math]::Abs($s.travel_time_s - $p.travel_time_s) -gt 0.001 -or
            [math]::Abs($s.distance_m - $p.distance_m) -gt 0.001) {
            $allMatch = $false
        }
    }
    Test-Check $allMatch "All candidate routes match between sequential and parallel"
} catch {
    Test-Check $false "Consistency check parsing"
}

# --- Test 5: Invalid target handling ---
Write-Host "`n[5/6] Testing invalid/unknown target node handling..." -ForegroundColor Yellow
$errInput = "999999`nAMB-01 1"
$null = $errInput | & $Exe $Nodes $Edges sequential 1 2>$null
$exitCode = $LASTEXITCODE
Test-Check ($exitCode -ne 0) "Engine returns non-zero exit for unknown target node (exit=$exitCode)"

# --- Test 6: Benchmark mode ---
Write-Host "`n[6/6] Testing benchmark mode..." -ForegroundColor Yellow
$benchOut = $input | & $Exe $Nodes $Edges benchmark 4 2>&1
$benchJson = ($benchOut | Where-Object { $_ -match '^\{' }) | Select-Object -First 1
try {
    $bench = $benchJson | ConvertFrom-Json
    Test-Check ($bench.fleet_size -eq 4) "Benchmark: fleet size is 4"
    Test-Check ($bench.repeats -gt 0) "Benchmark: repeats count is $($bench.repeats)"
    Test-Check ($bench.parallel.Count -ge 2) "Benchmark: reported results across multiple thread counts"
    Test-Check ($bench.best_ambulance -eq $seqParsed.best_ambulance) "Benchmark: best ambulance matches sequential dispatch"
} catch {
    Test-Check $false "Benchmark output parsing"
}

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Results: $passedTests/$totalTests passed, $failedTests failed" -ForegroundColor $(if ($failedTests -eq 0) { 'Green' } else { 'Red' })
Write-Host "========================================" -ForegroundColor Cyan

if ($failedTests -gt 0) { exit 1 } else { exit 0 }
