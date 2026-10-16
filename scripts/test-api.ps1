# ParaMedic — API Integration Test Script (PowerShell)
# Assumes the Node.js API server is running on localhost:4000.
$ErrorActionPreference = 'Stop'
$API = 'http://localhost:4000/api'

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ParaMedic API Integration Tests" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$total = 0; $passed = 0; $failed = 0

function Test-Api($condition, $name) {
    $script:total++
    if ($condition) {
        Write-Host "  PASS: $name" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  FAIL: $name" -ForegroundColor Red
        $script:failed++
    }
}

# --- Health ---
Write-Host "[1/7] Health check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API/health" -Method GET
    Test-Api ($health.ok -eq $true) "Health endpoint returns ok:true"
    Test-Api ($health.engineBuilt -eq $true) "Engine binary found"
    Test-Api ($health.project -eq 'ParaMedic') "Project name correct"
} catch {
    Test-Api $false "Health endpoint reachable ($_)"
}

# --- Graph ---
Write-Host "`n[2/7] Graph endpoint..." -ForegroundColor Yellow
try {
    $graph = Invoke-RestMethod -Uri "$API/graph" -Method GET
    Test-Api ($graph.nodes.Count -gt 0) "Graph has $($graph.nodes.Count) nodes"
    Test-Api ($graph.edges.Count -gt 0) "Graph has $($graph.edges.Count) edges"
} catch {
    Test-Api $false "Graph endpoint ($_)"
}

# --- Ambulances ---
Write-Host "`n[3/7] Ambulances endpoint..." -ForegroundColor Yellow
try {
    $fleet = Invoke-RestMethod -Uri "$API/ambulances" -Method GET
    Test-Api ($fleet.ambulances.Count -gt 0) "Fleet has $($fleet.ambulances.Count) ambulances"
    $available = @($fleet.ambulances | Where-Object { $_.available -eq $true }).Count
    $unavailable = @($fleet.ambulances | Where-Object { $_.available -eq $false }).Count
    Test-Api ($available -gt 0) "$available ambulances available"
    Test-Api ($unavailable -gt 0) "$unavailable ambulances unavailable (correctly excluded from dispatch)"
} catch {
    Test-Api $false "Ambulances endpoint ($_)"
}

# --- Dispatch (sequential) ---
Write-Host "`n[4/7] Dispatch (sequential)..." -ForegroundColor Yellow
try {
    $targetNode = $graph.nodes[([math]::Floor($graph.nodes.Count / 2))].id
    $body = @{ targetNode = $targetNode; mode = 'sequential'; threads = 1 } | ConvertTo-Json
    $disp = Invoke-RestMethod -Uri "$API/dispatch" -Method POST -Body $body -ContentType 'application/json'
    Test-Api ($disp.best_ambulance -ne $null) "Dispatch returns best ambulance: $($disp.best_ambulance)"
    Test-Api ($disp.elapsed_ms -ge 0) "Elapsed time reported: $($disp.elapsed_ms) ms"
    Test-Api ($disp.mode -eq 'sequential') "Mode is sequential"
    $bestCandidate = $disp.candidates | Where-Object { $_.ambulance_id -eq $disp.best_ambulance }
    Test-Api ($bestCandidate.reachable -eq $true) "Best ambulance route is reachable"
    Test-Api ($bestCandidate.routeCoordinates.Count -gt 0) "Route has coordinates for map display"
} catch {
    Test-Api $false "Sequential dispatch ($_)"
}

# --- Dispatch (parallel) ---
Write-Host "`n[5/7] Dispatch (parallel)..." -ForegroundColor Yellow
try {
    $body = @{ targetNode = $targetNode; mode = 'parallel'; threads = 4 } | ConvertTo-Json
    $dispP = Invoke-RestMethod -Uri "$API/dispatch" -Method POST -Body $body -ContentType 'application/json'
    Test-Api ($dispP.best_ambulance -eq $disp.best_ambulance) "Parallel selects same best ambulance as sequential"
    Test-Api ($dispP.mode -eq 'parallel') "Mode is parallel"
} catch {
    Test-Api $false "Parallel dispatch ($_)"
}

# --- Snap endpoint ---
Write-Host "`n[6/7] Snap endpoint..." -ForegroundColor Yellow
try {
    $snapBody = @{ lat = 12.956; lon = 77.708 } | ConvertTo-Json
    $snap = Invoke-RestMethod -Uri "$API/snap" -Method POST -Body $snapBody -ContentType 'application/json'
    Test-Api ($snap.nodeId -gt 0) "Snapped to node $($snap.nodeId)"
    Test-Api ($snap.snapDistM -ge 0) "Snap distance: $([math]::Round($snap.snapDistM, 1)) m"
} catch {
    Test-Api $false "Snap endpoint ($_)"
}

# --- Benchmark ---
Write-Host "`n[7/8] Benchmark endpoint..." -ForegroundColor Yellow
try {
    $benchBody = @{ targetNode = $targetNode; maxThreads = 4; repeats = 2 } | ConvertTo-Json
    $bench = Invoke-RestMethod -Uri "$API/benchmark" -Method POST -Body $benchBody -ContentType 'application/json'
    Test-Api ($bench.benchmarks.Count -gt 0) "Benchmark returned results"
    $firstBench = $bench.benchmarks[0]
    Test-Api ($firstBench.sequential.avg_ms -gt 0) "Sequential baseline: $($firstBench.sequential.avg_ms) ms"
    Test-Api ($firstBench.parallel.Count -ge 2) "Parallel results for $($firstBench.parallel.Count) thread counts"
} catch {
    Test-Api $false "Benchmark endpoint ($_)"
}

# --- Error Handling (HTTP 400) ---
Write-Host "`n[8/8] Error handling (HTTP 400 rejection)..." -ForegroundColor Yellow
try {
    $badReq = @{ targetNode = 999999; threads = 4 } | ConvertTo-Json
    $res = Invoke-WebRequest -Uri "$API/dispatch" -Method POST -Body $badReq -ContentType 'application/json'
    Test-Api $false "Unknown targetNode should be rejected"
} catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Test-Api ($statusCode -eq 400) "Unknown targetNode returns HTTP 400 (got $statusCode)"
}

try {
    $badCoord = @{ lat = 999.0; lon = 999.0 } | ConvertTo-Json
    $res = Invoke-WebRequest -Uri "$API/snap" -Method POST -Body $badCoord -ContentType 'application/json'
    Test-Api $false "Out-of-range coordinate should be rejected"
} catch {
    $statusCode = [int]$_.Exception.Response.StatusCode
    Test-Api ($statusCode -eq 400) "Out-of-range coordinate returns HTTP 400 (got $statusCode)"
}

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Results: $passed/$total passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host "========================================" -ForegroundColor Cyan

exit $failed
