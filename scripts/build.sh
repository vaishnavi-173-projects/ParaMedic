#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cmake -S "$ROOT/engine" -B "$ROOT/engine/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$ROOT/engine/build" --config Release -j
