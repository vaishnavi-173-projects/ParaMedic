#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/engine/build/paramedic_engine"
if [[ ! -x "$BIN" && -x "$ROOT/engine/build/Release/paramedic_engine" ]]; then
  BIN="$ROOT/engine/build/Release/paramedic_engine"
fi
if [[ ! -x "$BIN" ]]; then "$ROOT/scripts/build.sh"; fi

echo "Running engine tests..."
"$BIN" "$ROOT/engine/data/nodes.csv" "$ROOT/engine/data/edges.csv" test

INPUT=$'9\nAMB-01 1\nAMB-02 6\nAMB-03 13\nAMB-04 10\n'
printf '%s' "$INPUT" | "$BIN" "$ROOT/engine/data/nodes.csv" "$ROOT/engine/data/edges.csv" sequential 1 > /tmp/paramedic-sequential.json
printf '%s' "$INPUT" | "$BIN" "$ROOT/engine/data/nodes.csv" "$ROOT/engine/data/edges.csv" parallel 4 > /tmp/paramedic-parallel.json

python3 - <<'PY' || python - <<'PY'
import json, math
s = json.load(open('/tmp/paramedic-sequential.json'))
p = json.load(open('/tmp/paramedic-parallel.json'))
assert s['best_ambulance'] == p['best_ambulance'], f"Best ambulance mismatch: {s['best_ambulance']} vs {p['best_ambulance']}"
canon = lambda x: [(r['ambulance_id'], r['reachable'], round(r['travel_time_s'], 3), round(r['distance_m'], 2), r['path']) for r in x['candidates']]
assert canon(s) == canon(p), 'Sequential and parallel candidate route results differ'
print(f"PASS: Sequential and OpenMP route results match perfectly (Best: {s['best_ambulance']}).")
print(f"Sequential engine time: {s['elapsed_ms']:.3f} ms; parallel engine time: {p['elapsed_ms']:.3f} ms.")
PY
