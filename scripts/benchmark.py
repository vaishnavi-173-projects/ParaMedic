"""Reproducible benchmark suite for ParaMedic.
Evaluates sequential vs OpenMP parallel route search across 1, 2, 4, 8 threads
and multiple fleet sizes on the loaded road network.
Outputs timing, speedup, and efficiency metrics in formatted tables and JSON.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE_WIN_RELEASE = ROOT / 'engine' / 'build' / 'Release' / 'paramedic_engine.exe'
EXE_WIN = ROOT / 'engine' / 'build' / 'paramedic_engine.exe'
EXE_NIX = ROOT / 'engine' / 'build' / 'paramedic_engine'

def get_engine():
    if os.name == 'nt':
        if EXE_WIN_RELEASE.exists():
            return str(EXE_WIN_RELEASE)
        if EXE_WIN.exists():
            return str(EXE_WIN)
    if EXE_NIX.exists():
        return str(EXE_NIX)
    sys.exit("Error: paramedic_engine executable not found. Please build the engine first.")

def load_node_ids(nodes_csv):
    ids = []
    with open(nodes_csv, 'r', encoding='utf-8') as f:
        next(f)  # header
        for line in f:
            parts = line.strip().split(',')
            if parts and parts[0]:
                try:
                    ids.append(int(parts[0]))
                except ValueError:
                    pass
    return ids

def run_benchmark():
    parser = argparse.ArgumentParser(description="ParaMedic Parallel Routing Benchmark Suite")
    parser.add_argument("--fleet-sizes", type=int, nargs="+", default=[5, 10, 20, 50, 100],
                        help="List of candidate fleet sizes to benchmark")
    parser.add_argument("--threads", type=int, nargs="+", default=[1, 2, 4, 8],
                        help="Thread counts for OpenMP parallel benchmark")
    parser.add_argument("--repeats", type=int, default=5,
                        help="Number of iterations per scenario to average")
    parser.add_argument("--output-json", type=str, default="",
                        help="Optional file path to export raw JSON results")
    args = parser.parse_args()

    engine = get_engine()
    nodes_csv = ROOT / 'engine' / 'data' / 'nodes.csv'
    edges_csv = ROOT / 'engine' / 'data' / 'edges.csv'
    meta_json = ROOT / 'engine' / 'data' / 'graph_metadata.json'

    if not nodes_csv.exists() or not edges_csv.exists():
        sys.exit("Error: Road graph CSVs missing from engine/data/.")

    meta = {}
    if meta_json.exists():
        try:
            with open(meta_json, 'r', encoding='utf-8') as f:
                meta = json.load(f)
        except Exception:
            pass

    node_ids = load_node_ids(nodes_csv)
    if not node_ids:
        sys.exit("Error: No nodes loaded from nodes.csv.")

    target_node = node_ids[len(node_ids) // 2]

    print("=" * 80)
    print("  ParaMedic — Sequential vs. OpenMP Dijkstra Routing Benchmark")
    print(f"  Dataset: {meta.get('dataset_type', 'road_graph')} | Nodes: {len(node_ids)} | Target: Node {target_node}")
    print(f"  Iterations per configuration: {args.repeats}")
    print("=" * 80)

    benchmark_records = []

    for fleet_size in args.fleet_sizes:
        # Generate simulated ambulance fleet distributed across graph
        step = max(1, len(node_ids) // fleet_size)
        ambulances = []
        for i in range(fleet_size):
            node = node_ids[(i * step) % len(node_ids)]
            ambulances.append((f"AMB-{i+1:03d}", node))

        stdin_data = f"{target_node}\n" + "\n".join(f"{aid} {nid}" for aid, nid in ambulances) + "\n"

        # Sequential baseline
        seq_times = []
        for _ in range(args.repeats):
            p = subprocess.Popen([engine, str(nodes_csv), str(edges_csv), "sequential", "1"],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            out, err = p.communicate(input=stdin_data)
            if p.returncode != 0:
                print(f"Error executing sequential run: {err}", file=sys.stderr)
                continue
            res = json.loads(out)
            seq_times.append(res['elapsed_ms'])

        seq_avg = sum(seq_times) / len(seq_times) if seq_times else 0.0

        print(f"\n[Fleet Size: {fleet_size:3d} ambulances] — Sequential Baseline: {seq_avg:.3f} ms")
        print(f"{'Threads':<10} | {'Parallel (ms)':<15} | {'Speedup':<12} | {'Efficiency':<12}")
        print("-" * 55)

        thread_records = []
        for th in args.threads:
            par_times = []
            for _ in range(args.repeats):
                p = subprocess.Popen([engine, str(nodes_csv), str(edges_csv), "parallel", str(th)],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                out, err = p.communicate(input=stdin_data)
                if p.returncode != 0:
                    continue
                res = json.loads(out)
                par_times.append(res['elapsed_ms'])

            par_avg = sum(par_times) / len(par_times) if par_times else 0.0
            speedup = (seq_avg / max(par_avg, 1e-6)) if par_avg > 0 else 0.0
            efficiency = speedup / th

            thread_records.append({
                "threads": th,
                "avg_ms": round(par_avg, 3),
                "speedup": round(speedup, 2),
                "efficiency": round(efficiency, 3)
            })

            print(f"{th:<10} | {par_avg:<15.3f} | {speedup:<12.2f}x | {efficiency:<12.3f}")

        benchmark_records.append({
            "fleet_size": fleet_size,
            "sequential_avg_ms": round(seq_avg, 3),
            "parallel_results": thread_records
        })

    print("\n" + "=" * 80)
    print("Benchmark complete.")
    print("Note: Reported times measure core C++ route search computation, excluding I/O.")
    print("=" * 80)

    if args.output_json:
        out_path = Path(args.output_json)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump({
                "metadata": meta,
                "target_node": target_node,
                "benchmarks": benchmark_records
            }, f, indent=2)
        print(f"Results exported to {out_path}")

if __name__ == '__main__':
    run_benchmark()
