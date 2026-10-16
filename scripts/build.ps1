$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Write-Host "Configuring CMake for ParaMedic Engine..." -ForegroundColor Cyan
cmake -S (Join-Path $Root 'engine') -B (Join-Path $Root 'engine/build') -DCMAKE_BUILD_TYPE=Release
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) { 
    throw "CMake configure failed with exit code $LASTEXITCODE. Install CMake and MSVC/GCC compiler first." 
}

Write-Host "Compiling C++17/OpenMP Engine..." -ForegroundColor Cyan
cmake --build (Join-Path $Root 'engine/build') --config Release --parallel
if ($LASTEXITCODE -ne 0) { throw 'C++ engine build failed.' }

$ReleaseExe = Join-Path $Root 'engine/build/Release/paramedic_engine.exe'
$DirectExe = Join-Path $Root 'engine/build/paramedic_engine.exe'
if (Test-Path $ReleaseExe) {
    Write-Host "Engine binary successfully compiled at: $ReleaseExe" -ForegroundColor Green
} elseif (Test-Path $DirectExe) {
    Write-Host "Engine binary successfully compiled at: $DirectExe" -ForegroundColor Green
} else {
    throw 'Could not locate compiled paramedic_engine.exe executable.'
}
