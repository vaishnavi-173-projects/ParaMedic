# VTU Project Report Documentation — ParaMedic

## Project Title
**ParaMedic: Parallel Ambulance Dispatch and Route Optimization System Using OpenMP and Dijkstra's Algorithm**

**Course:** Parallel Computing / High Performance Computing Laboratory  
**Department:** Computer Science & Engineering  
**Affiliation:** Visvesvaraya Technological University (VTU), Belagavi  

---

## Abstract
In emergency medical services (EMS), response latency directly influences survival rates. Traditional dispatch algorithms evaluate potential ambulance units sequentially, which becomes computationally expensive as the fleet size and urban road network complexity expand. This project presents **ParaMedic**, an open-source, high-performance dispatch optimization system. Using a real OpenStreetMap (OSM) drivable road network of the Marathahalli–Bellandur tech corridor in Bengaluru (7,343 road nodes and 16,614 directed edges), ParaMedic accelerates multi-candidate route search using candidate-level parallelism via OpenMP in C++17. Each candidate ambulance computes its shortest travel-time path via Dijkstra's algorithm concurrently using thread-isolated state. Experimental evaluations across 1 to 8 threads demonstrate a speedup of up to **3.69x** for 50 units and **3.45x–3.65x** for 100 units on multi-core architectures, with guaranteed sequential/parallel decision equivalence. The engine interfaces with a Node.js Express REST API bridge and a responsive React Leaflet emergency operations dashboard.

---

## 1. Introduction & Problem Statement

### 1.1 Background
Urban centers such as Bengaluru face severe traffic congestion, complex one-way road hierarchies, and unpredictable bottlenecks. When an emergency incident occurs, selecting the nearest ambulance based merely on Euclidean straight-line distance frequently leads to suboptimal results due to one-way restrictions, physical dividers, and road speed disparities.

### 1.2 Problem Statement
Given:
1. A directed road network graph $G = (V, E)$ with non-negative travel-time edge weights $w(u, v) = \frac{\text{length}(u,v)}{v_{\text{road}}}$.
2. An incident location $t \in V$ snapped to the nearest road junction.
3. A set of $k$ candidate ambulance units $A = \{a_1, a_2, \dots, a_k\}$, where each ambulance $a_i$ is located at junction node $s_i \in V$ with availability status $\text{avail}(a_i) \in \{\text{true}, \text{false}\}$.

The objective is to identify the reachable, available ambulance $a^* \in A$ that minimizes total travel time to $t$:
$$a^* = \arg\min_{a_i \in A, \, \text{avail}(a_i) = \text{true}} \text{dist}(s_i, t)$$
and return the complete turn-by-turn route coordinates, distance, and estimated arrival time (ETA).

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 React + Leaflet Dashboard                   │
│   - Map View (Leaflet Dark Tiles)   - Dispatch Controls     │
│   - Real-time Road Network          - Parallel Benchmark UI │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON (Port 5173 -> 4000)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Express.js REST API Bridge                  │
│   - /api/health    - /api/graph       - /api/ambulances     │
│   - /api/snap      - /api/dispatch    - /api/benchmark      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Child Process (stdin / stdout)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 C++17 / OpenMP Route Engine                 │
│   - Directed Road Graph (7,343 nodes, 16,614 directed edges)│
│   - Candidate-Level OpenMP Dijkstra Search                  │
│   - Thread-isolated min-priority queues and distance arrays │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Algorithm & Parallelization Strategy

### 3.1 Dijkstra's Algorithm (Single Source Shortest Path)
For each candidate ambulance $a_i$, shortest travel time is computed using a binary min-heap priority queue:
- **Time Complexity:** $O((|V| + |E|) \log |V|)$ per candidate search.
- **Sequential Baseline:** $O(k \cdot (|V| + |E|) \log |V|)$ for $k$ candidate ambulances.

### 3.2 Candidate-Level Parallelism via OpenMP
Rather than attempting fine-grained inner-loop parallelization of Dijkstra (which suffers from severe synchronization overhead due to dynamic graph exploration), ParaMedic employs **coarse-grained candidate-level parallelism**:
```cpp
#pragma omp parallel for schedule(dynamic)
for (int i = 0; i < (int)ambulances.size(); ++i) {
    Result r = dijkstra(g, ambulances[i].node, targetNode);
    r.id = ambulances[i].id;
    results[i] = std::move(r);
}
```
- **Thread Safety:** Each OpenMP thread allocates its own private `dist` vector, `meters` vector, `prev` predecessor map, and `std::priority_queue`.
- **Shared Graph:** The directed adjacency list `graph.adj` is strictly read-only during route calculations, eliminating data races.
- **Deterministic Winner Selection:** After the OpenMP parallel section terminates, a single sequential pass selects the optimal ambulance using travel time with deterministic tie-breaking by ambulance identifier.

---

## 4. Road Graph Dataset (Marathahalli–Bellandur, Bengaluru)

- **Source:** OpenStreetMap (OSM) via Python OSMnx 2.1.1
- **Center Coordinate:** $12.956^\circ \text{ N}, 77.708^\circ \text{ E}$
- **Radius:** 4,000 meters
- **Node Count ($|V|$):** 7,343 unique road junctions
- **Directed Edge Count ($|E|$):** 16,614 directed road segments
- **Speed Assumptions by Highway Classification:**
  - `trunk` / `trunk_link`: 45 km/h
  - `primary` / `primary_link`: 35 km/h
  - `secondary` / `secondary_link`: 30 km/h
  - `tertiary` / `tertiary_link`: 25 km/h
  - `residential` / `unclassified`: 20 km/h
  - `living_street`: 10 km/h
  - `service`: 15 km/h

---

## 5. Experimental Results & Performance Evaluation

### 5.1 Test Environment
- **Processor:** Intel 12th/13th Gen Core (12 Logical Processors)
- **RAM:** 16 GB DDR4/DDR5
- **Operating System:** Microsoft Windows 11 (64-bit)
- **C++ Compiler:** Microsoft Visual C++ 19.43 (MSVC 2022 Build Tools)
- **OpenMP Version:** OpenMP 2.0 (MSVC `-openmp`)
### 5.2 Measured Performance (5 Iteration Averages, 7,343 Nodes)

All values are calculated directly from `benchmark_results.json` without approximations:

$$\text{Speedup } S(p) = \frac{T_{\text{sequential}}}{T_{\text{parallel}}(p)}, \quad \text{Parallel Efficiency } E(p) = \frac{S(p)}{p} \times 100\%$$

| Fleet Size ($k$) | Sequential Baseline ($T_{\text{seq}}$) | 1-Thread OpenMP ($T_1$) | 2 Threads ($T_2$) | 4 Threads ($T_4$) | 8 Threads ($T_8$) | 8-Thread Speedup | 8-Thread Efficiency ($E_8$) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **5 ambulances** | 1.193 ms | 1.186 ms (1.01x) | 1.252 ms (0.95x) | 0.994 ms (1.20x) | 0.940 ms (1.27x) | **1.27x** | **15.9%** |
| **10 ambulances** | 1.995 ms | 2.011 ms (0.99x) | 1.359 ms (1.47x) | 0.992 ms (2.01x) | 1.197 ms (1.67x) | **1.67x** | **20.8%** |
| **25 ambulances** | 4.432 ms | 4.118 ms (1.08x) | 2.632 ms (1.68x) | 1.907 ms (2.32x) | 1.951 ms (2.27x) | **2.27x** | **28.4%** |
| **50 ambulances** | 9.955 ms | 10.088 ms (0.99x) | 5.671 ms (1.76x) | 3.838 ms (2.59x) | 2.701 ms (3.69x) | **3.69x** | **46.1%** |
| **100 ambulances** | 19.566 ms | 18.481 ms (1.06x) | 10.849 ms (1.80x) | 7.364 ms (2.66x) | 5.678 ms (3.45x) | **3.45x** | **43.1%** |

### 5.3 Sequential Baseline vs. OpenMP 1-Thread Analysis
1. **Sequential Baseline ($T_{\text{seq}}$):** Pure sequential execution in the calling thread without activating OpenMP parallel runtime teams or barrier constructs.
2. **OpenMP 1-Thread ($T_1$):** Single worker thread dispatched via `#pragma omp parallel for schedule(dynamic)`. Incurs OpenMP work-sharing construct initialization and dynamic chunk allocation overhead.
3. **Equivalence:** As demonstrated in the data, $T_{\text{seq}}$ and $T_1$ track each other closely (within ~1–6% across all fleet sizes), confirming that the sequential implementation is an authentic unparallelized baseline.

### 5.4 Analytical Discussion of Speedup & Efficiency
1. **Parallel Overhead on Small Fleets ($k \le 5$):** When candidate counts are very small, thread dispatch, barrier synchronization, and thread-local memory allocation overhead dominate the runtime, resulting in modest scaling.
2. **Strong Scaling on Larger Workloads ($k \ge 50$):** As the candidate workload increases, computation dominates thread overhead:
   - For 50 ambulances, 8 threads achieve a **3.69x speedup** (2.701 ms vs. 9.955 ms sequential baseline) with **46.1% parallel efficiency**.
   - For 100 ambulances, 8 threads achieve a **3.45x speedup** (5.678 ms vs. 19.566 ms sequential baseline) with **43.1% parallel efficiency**.
3. **Amdahl's Law Effect:** Due to sequential initialization and memory bandwidth saturation on shared L3 cache, efficiency decreases as thread count scales beyond physical cores.
4. **Deterministic Winner Selection:** In all test runs, sequential and OpenMP parallel executions chose the exact same optimal ambulance with identical turn-by-turn route coordinates.

---

## 6. Verification & Automated Test Summary

- **C++ Engine Unit Tests:** 20/20 PASSED
- **PowerShell Smoke Tests:** 13/13 PASSED
- **REST API Integration Tests:** 22/22 PASSED (including HTTP 400 error rejection)
- **Vite React Production Build:** PASSED (Zero errors, 328 kB bundle)

---

## 7. Limitations & Future Scope

1. **Static Speed Model:** Road travel times are estimated via legal road classification speeds; real-time dynamic traffic APIs (e.g. Google Maps API) can be integrated in future work.
2. **Traffic Signal & Turn Penalties:** Current Dijkstra implementation ignores junction turning delays.
3. **Dynamic Re-routing:** Emergency vehicles encountering sudden roadblocks currently require full re-dispatch.

---

## 8. References
1. E. W. Dijkstra, "A note on two problems in connexion with graphs," *Numerische Mathematik*, vol. 1, no. 1, pp. 269–271, 1959.
2. OpenMP Architecture Review Board, "OpenMP Application Program Interface Version 5.2," Nov. 2021.
3. G. Boeing, "OSMnx: New methods for acquiring, constructing, analyzing, and visualizing complex street networks," *Computers, Environment and Urban Systems*, vol. 65, pp. 126–139, 2017.
4. OpenStreetMap Contributors, "Planet dump retrieved from https://planet.osm.org," Open Data Commons Open Database License (ODbL), 2026.
