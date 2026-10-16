# ParaMedic — Parallel Ambulance Dispatch & Route Optimization System

**VTU 6th/7th Semester Computer Science & Engineering — Parallel Computing Project**  
Parallel ambulance dispatch and emergency routing optimization using Dijkstra's algorithm accelerated with OpenMP candidate-level parallelism, an Express.js REST API bridge, and a React + Leaflet real-time operations dashboard.

---

## 1. Project Overview & Architecture

When an emergency occurs, emergency medical services (EMS) must identify the fastest reachable ambulance among a distributed fleet. In complex urban networks with one-way streets, physical dividers, and road speed hierarchies, evaluating candidate routes sequentially creates computational bottlenecks as fleet sizes scale.

ParaMedic solves this with **candidate-level OpenMP parallelism**: each candidate ambulance concurrently computes its shortest travel-time path via Dijkstra's algorithm using thread-isolated state.

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
└──────────────────────────────┘
```

---

## 2. Technology Stack

- **Routing Engine (`engine/`)**: C++17, OpenMP (`-openmp`), Dijkstra shortest-path with min-priority queues.
- **Road Network Data (`engine/data/`)**: Real OpenStreetMap road graph of the Marathahalli–Bellandur tech corridor in Bengaluru (7,343 nodes, 16,614 directed edges) exported via OSMnx.
- **Backend API (`server/`)**: Node.js v20+, Express.js, child process engine execution with stdin/stdout protocol, nearest-node snapping via Haversine metric.
- **Frontend Dashboard (`client/`)**: React 18, Vite 6, Leaflet, Lucide icons, responsive dark operations interface.
- **Testing & Tooling (`scripts/`)**: PowerShell smoke test suites, REST API test suites, Python CLI benchmark tool.

---

## 3. Verified System Requirements

- **Operating System**: Windows 10 / 11 (64-bit) or Linux (Ubuntu 20.04+).
- **C++ Compiler**: Microsoft Visual C++ 2022 (Build Tools with MSVC v143 and C++ CMake tools) or GCC 9+ with OpenMP.
- **CMake**: Version 3.16 or higher (`cmake --version`).
- **Node.js**: Version 18+ or 20+ (`node -v`, `npm -v`).
- **Python**: Version 3.10+ (for benchmark scripts and graph downloader).

---

## 4. Step-by-Step Setup & Execution on Windows

Open **PowerShell as Administrator or normal user** in the root of the project:

### Step 1: Set Execution Policy & Build C++ Engine
```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build.ps1
```
*Compiles `engine/src/main.cpp` using MSVC and OpenMP into `engine/build/Release/paramedic_engine.exe`.*

### Step 2: Run Built-In Engine Tests & Smoke Suite
```powershell
# Built-in C++ engine unit tests (20/20 tests)
.\engine\build\Release\paramedic_engine.exe engine\data\nodes.csv engine\data\edges.csv test

# PowerShell automated smoke test suite (13/13 tests)
.\scripts\smoke-test.ps1
```

### Step 3: Install Dependencies & Start API Server
In **Terminal 1**:
```powershell
cd server
npm install
npm start
```
*API server will listen on `http://localhost:4000`.*

### Step 4: Verify REST API Endpoints
In **Terminal 2**:
```powershell
.\scripts\test-api.ps1
```
*Runs 22/22 automated integration checks including HTTP 400 rejection tests.*

### Step 5: Start the React Dashboard
In **Terminal 2**:
```powershell
cd client
npm install
npm run dev
```
*Open your browser at `http://localhost:5173`.*

---

## 5. One-Click Quick Launcher

A PowerShell launcher is included to automatically verify the engine build and spawn both the API and frontend in separate terminals:
```powershell
.\scripts\start.ps1
```

---

## 6. How to Use the Operations Dashboard

1. **View Network**: The map automatically centers on Bengaluru's Marathahalli–Bellandur road network. Green markers represent available ambulances; yellow markers indicate busy ambulances.
2. **Select Incident Location**:
   - Click anywhere on the road network on the map. The dashboard automatically queries `/api/snap` to snap the coordinate to the nearest road junction.
   - Or select a junction node ID directly from the dropdown menu.
3. **Configure Dispatch**:
   - Choose **Sequential** or **OpenMP Parallel** execution.
   - When Parallel is selected, choose the CPU thread count (1 to 8 threads).
4. **Calculate Best Route**:
   - Click **Find fastest ambulance**.
   - The winning available unit is highlighted with its ETA (in minutes and seconds), total road distance (km), and path junction count.
   - The computed route is drawn as a luminous green and white road polyline.
   - Evaluated candidate ambulances are compared in the candidate table.
5. **Run Parallel Benchmark**:
   - Click **Run benchmark suite** to execute the multi-threaded routing workload and observe live speedup and parallel efficiency bars.

---

## 7. Parallel Performance & Benchmark Results

Run the reproducible benchmark suite to measure sequential vs. OpenMP performance on the 7,343-node road network:
```powershell
python scripts\benchmark.py --fleet-sizes 5 10 25 50 100 --threads 1 2 4 8 --repeats 5 --output-json benchmark_results.json
```

### Actual Measured Results (Intel 12-Core System, 5-Iteration Averages)

Every speedup and parallel efficiency metric is calculated directly from the raw measurements in `benchmark_results.json`:

$$\text{Speedup } S(p) = \frac{T_{\text{sequential}}}{T_{\text{parallel}}(p)}, \quad \text{Parallel Efficiency } E(p) = \frac{S(p)}{p} \times 100\%$$

| Fleet Size ($k$) | Sequential Baseline ($T_{\text{seq}}$) | 1-Thread OpenMP ($T_1$) | 2 Threads ($T_2$) | 4 Threads ($T_4$) | 8 Threads ($T_8$) | 8-Thread Speedup | 8-Thread Efficiency |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **5 units** | 1.193 ms | 1.186 ms (1.01x) | 1.252 ms (0.95x) | 0.994 ms (1.20x) | 0.940 ms (1.27x) | **1.27x** | **15.9%** |
| **10 units** | 1.995 ms | 2.011 ms (0.99x) | 1.359 ms (1.47x) | 0.992 ms (2.01x) | 1.197 ms (1.67x) | **1.67x** | **20.8%** |
| **25 units** | 4.432 ms | 4.118 ms (1.08x) | 2.632 ms (1.68x) | 1.907 ms (2.32x) | 1.951 ms (2.27x) | **2.27x** | **28.4%** |
| **50 units** | 9.955 ms | 10.088 ms (0.99x) | 5.671 ms (1.76x) | 3.838 ms (2.59x) | 2.701 ms (3.69x) | **3.69x** | **46.1%** |
| **100 units** | 19.566 ms | 18.481 ms (1.06x) | 10.849 ms (1.80x) | 7.364 ms (2.66x) | 5.678 ms (3.45x) | **3.45x** | **43.1%** |

### Sequential Baseline vs. OpenMP 1-Thread Execution
- **Sequential Baseline ($T_{\text{seq}}$):** Executes purely in the calling thread without invoking the OpenMP runtime subsystem or entering a `#pragma omp parallel` region. It evaluates candidates sequentially in a simple for-loop.
- **OpenMP 1-Thread Execution ($T_1$):** Sets `omp_set_num_threads(1)` and enters the `#pragma omp parallel for schedule(dynamic)` block. While restricted to a single worker thread, it incurs minor runtime overhead (team creation, dynamic chunk assignment, and thread synchronization barriers).
- As shown in the table above, $T_{\text{seq}}$ and $T_1$ are nearly identical (within ~1–6% of each other across all fleet sizes), confirming that the sequential baseline is rigorous and unburdened by multi-threading artifacts.

### Key Performance Findings:
1. **Thread Overhead on Small Fleets ($k \le 5$):** When candidate counts are very small, thread dispatch, barrier synchronization, and thread-local memory allocation overhead dominate the runtime, resulting in modest scaling.
2. **Significant Scaling on Larger Workloads ($k \ge 50$):** As the candidate workload increases, computation dominates thread overhead:
   - For 50 ambulances, 8 threads achieve a **3.69x speedup** (2.701 ms vs. 9.955 ms sequential baseline) with **46.1% parallel efficiency**.
   - For 100 ambulances, 8 threads achieve a **3.45x speedup** (5.678 ms vs. 19.566 ms sequential baseline) with **43.1% parallel efficiency**.
3. **Deterministic Output:** Sequential and parallel runs produce identical winning ambulances and identical shortest-path node sequences across all trials.

---

## 8. REST API Reference

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Health status, engine build status, node/edge counts | 200 |
| `GET` | `/api/graph` | Road graph nodes, directed edges, and metadata | 200, 500 |
| `GET` | `/api/ambulances` | Simulated fleet GPS positions and availability | 200, 500 |
| `POST` | `/api/snap` | Snaps arbitrary latitude/longitude to nearest road junction | 200, 400, 404, 500 |
| `POST` | `/api/dispatch` | Computes fastest reachable ambulance route via C++ engine | 200, 400, 500, 503 |
| `POST` | `/api/benchmark` | Runs sequential vs OpenMP benchmark across threads | 200, 400, 500, 503 |
| `POST` | `/api/reload` | Flushes cache and reloads road network from CSV | 200, 500 |

### Error Response Standard
All API errors return consistent JSON error objects with appropriate HTTP status codes:
- **HTTP 400 Bad Request**: Invalid coordinates, non-integer parameters, or unknown node IDs (e.g. `{"error":"Unknown target node ID: 999999"}`).
- **HTTP 404 Not Found**: Coordinate cannot be snapped to any road node.
- **HTTP 503 Service Unavailable**: C++ routing engine binary is missing or not yet compiled.
- **HTTP 500 Internal Server Error**: Unexpected server-side failure.

---

## 9. Verification & Automated Test Status

| Suite | Scope | Status |
| :--- | :--- | :---: |
| **C++ Engine Tests** | 20 unit tests in `main.cpp` covering Dijkstra correctness, one-way roads, tie-breaking, invalid nodes, multi-threading consistency. | **20/20 PASSED** |
| **Smoke Tests** | `scripts/smoke-test.ps1` covering compilation, CLI piping, sequential/parallel dispatch, error exits, benchmark parsing. | **13/13 PASSED** |
| **API Integration Tests** | `scripts/test-api.ps1` covering health, graph, fleet filtering, dispatch, snapping, benchmark, and HTTP 400 rejection. | **22/22 PASSED** |
| **Vite Production Build** | `npm run build` in `client/` generating production bundle. | **SUCCESS (0 errors)** |

---

## 10. Limitations & Academic Scope

1. **Static Speed Model**: Travel times are estimated using road classification speeds (35 km/h primary, 20 km/h residential) rather than dynamic real-time GPS traffic feeds.
2. **Simulation Environment**: Ambulance GPS positions and incident locations are simulated and not connected to emergency dispatch services (108 / 911).
3. **Turn Penalties**: Dijkstra evaluates segment travel times without explicit U-turn or traffic signal delay penalties.

---

## 11. OpenStreetMap Attribution & Licensing

The road network data is derived from OpenStreetMap data:
- **Source**: © OpenStreetMap contributors
- **License**: Open Data Commons Open Database License (ODbL)
- **Extraction Tool**: OSMnx library by Geoff Boeing
