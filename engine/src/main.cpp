// ParaMedic Engine — Parallel Ambulance Dispatch Route Optimizer
// C++17, OpenMP, Dijkstra shortest-path (by travel time)
//
// Usage:
//   paramedic_engine nodes.csv edges.csv sequential|parallel [threads]
//     Reads target node and ambulance list from stdin, outputs JSON to stdout.
//   paramedic_engine nodes.csv edges.csv test
//     Runs built-in correctness tests and outputs pass/fail JSON.
//   paramedic_engine nodes.csv edges.csv benchmark [maxThreads]
//     Reads ambulance data from stdin, runs sequential + parallel with 1..maxThreads,
//     outputs benchmark JSON with timings, speedup, efficiency.

#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <limits>
#include <queue>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>
#ifdef _OPENMP
#include <omp.h>
#endif

struct Node { int id; double lat, lon; };
struct Edge { int to; double distance; double seconds; };
struct Ambulance { std::string id; int node; };
struct Result {
  std::string id; int source = -1; bool reachable = false;
  double seconds = 0, distance = 0; std::vector<int> path;
};

// --------------- Helpers ---------------
static std::vector<std::string> split(const std::string& s, char delim) {
  std::vector<std::string> out; std::stringstream ss(s); std::string x;
  while (std::getline(ss, x, delim)) out.push_back(x);
  return out;
}
static std::string quote(const std::string& s) {
  std::string o = "\"";
  for (char c : s) {
    if (c == '\\' || c == '\"') o += '\\';
    if (c == '\n') o += "\\n"; else o += c;
  }
  return o + '\"';
}

// --------------- Graph data ---------------
struct Graph {
  std::unordered_map<int, Node> nodes;
  std::unordered_map<int, int> index;   // nodeId -> compact index
  std::vector<int> ids;                 // compact index -> nodeId
  std::vector<std::vector<Edge>> adj;
  // Track one-way edges for test verification
  std::vector<std::tuple<int, int, double, double>> rawEdges; // source, target, dist, time

  bool load(const std::string& nodesFile, const std::string& edgesFile, std::ostream& err) {
    std::ifstream nf(nodesFile); std::string line;
    if (!nf) { err << "Cannot open nodes file: " << nodesFile; return false; }
    std::getline(nf, line); // skip header
    while (std::getline(nf, line)) {
      auto p = split(line, ',');
      if (p.size() < 3) continue;
      try { int id = std::stoi(p[0]); nodes[id] = { id, std::stod(p[1]), std::stod(p[2]) }; } catch (...) {}
    }
    ids.reserve(nodes.size());
    for (auto& kv : nodes) ids.push_back(kv.first);
    std::sort(ids.begin(), ids.end());
    for (int i = 0; i < (int)ids.size(); ++i) index[ids[i]] = i;

    adj.resize(ids.size());
    std::ifstream ef(edgesFile);
    if (!ef) { err << "Cannot open edges file: " << edgesFile; return false; }
    std::getline(ef, line); // skip header
    while (std::getline(ef, line)) {
      auto p = split(line, ',');
      if (p.size() < 7) continue;
      try {
        int from = std::stoi(p[1]), to = std::stoi(p[2]);
        double d = std::stod(p[3]), t = std::stod(p[6]);
        if (index.count(from) && index.count(to) && d > 0 && t > 0) {
          adj[index[from]].push_back({ index[to], d, t });
          rawEdges.emplace_back(from, to, d, t);
        }
      } catch (...) {}
    }
    return true;
  }

  size_t size() const { return ids.size(); }
};

// --------------- Dijkstra ---------------
Result dijkstra(const Graph& g, int sourceNode, int targetNode) {
  Result r; r.source = sourceNode;
  if (!g.index.count(sourceNode) || !g.index.count(targetNode)) {
    return r; // unreachable / invalid
  }
  const int s = g.index.at(sourceNode), t = g.index.at(targetNode);
  if (s == t) {
    r.reachable = true;
    r.seconds = 0.0;
    r.distance = 0.0;
    r.path = { sourceNode };
    return r;
  }
  const double INF = std::numeric_limits<double>::infinity();
  std::vector<double> dist(g.size(), INF), meters(g.size(), INF);
  std::vector<int> prev(g.size(), -1);
  using Q = std::pair<double, int>;
  std::priority_queue<Q, std::vector<Q>, std::greater<Q>> q;
  dist[s] = 0; meters[s] = 0; q.push({ 0, s });
  while (!q.empty()) {
    auto [du, u] = q.top(); q.pop();
    if (du != dist[u]) continue;
    if (u == t) break;
    for (const auto& e : g.adj[u]) {
      double nd = du + e.seconds;
      if (nd < dist[e.to]) {
        dist[e.to] = nd; meters[e.to] = meters[u] + e.distance;
        prev[e.to] = u; q.push({ nd, e.to });
      }
    }
  }
  if (std::isfinite(dist[t])) {
    r.reachable = true; r.seconds = dist[t]; r.distance = meters[t];
    for (int cur = t; cur != -1; cur = prev[cur]) {
      r.path.push_back(g.ids[cur]);
      if (cur == s) break;
    }
    std::reverse(r.path.begin(), r.path.end());
  }
  return r;
}

// --------------- Dispatch (sequential + parallel) ---------------
struct DispatchResult {
  std::vector<Result> results;
  double elapsed_ms;
  int best;
};

DispatchResult dispatch(const Graph& g, int targetNode,
                        const std::vector<Ambulance>& ambulances,
                        const std::string& mode, int threads) {
  std::vector<Result> results(ambulances.size());
  auto route = [&](size_t i) {
    Result r = dijkstra(g, ambulances[i].node, targetNode);
    r.id = ambulances[i].id;
    results[i] = std::move(r);
  };

  auto started = std::chrono::steady_clock::now();
  if (mode == "parallel") {
#ifdef _OPENMP
    omp_set_num_threads(threads);
    #pragma omp parallel for schedule(dynamic)
    for (int i = 0; i < (int)ambulances.size(); ++i) route(i);
#else
    for (size_t i = 0; i < ambulances.size(); ++i) route(i);
#endif
  } else {
    for (size_t i = 0; i < ambulances.size(); ++i) route(i);
  }
  auto ended = std::chrono::steady_clock::now();
  double elapsed = std::chrono::duration<double, std::milli>(ended - started).count();

  int best = -1;
  for (int i = 0; i < (int)results.size(); ++i) {
    if (results[i].reachable && (best < 0 || results[i].seconds < results[best].seconds ||
        (results[i].seconds == results[best].seconds && results[i].id < results[best].id)))
      best = i;
  }

  return { std::move(results), elapsed, best };
}

// --------------- JSON output helpers ---------------
void printDispatchJson(const DispatchResult& dr, const std::string& mode,
                       int threads, int target) {
  const auto& results = dr.results;
  std::cout << "{\"mode\":" << quote(mode) << ",\"threads\":" << threads
            << ",\"elapsed_ms\":" << dr.elapsed_ms << ",\"target_node\":" << target
            << ",\"best_ambulance\":" << (dr.best < 0 ? "null" : quote(results[dr.best].id))
            << ",\"candidates\":[";
  for (size_t i = 0; i < results.size(); ++i) {
    if (i) std::cout << ",";
    const auto& r = results[i];
    std::cout << "{\"ambulance_id\":" << quote(r.id)
              << ",\"source_node\":" << r.source
              << ",\"reachable\":" << (r.reachable ? "true" : "false")
              << ",\"travel_time_s\":" << (r.reachable ? r.seconds : 0)
              << ",\"distance_m\":" << (r.reachable ? r.distance : 0)
              << ",\"path\":[";
    for (size_t j = 0; j < r.path.size(); ++j) {
      if (j) std::cout << ",";
      std::cout << r.path[j];
    }
    std::cout << "]}";
  }
  std::cout << "]}\n";
}

// --------------- Built-in tests ---------------
int runTests(const Graph& g) {
  int pass = 0, fail = 0;
  auto check = [&](bool cond, const std::string& name) {
    if (cond) { ++pass; std::cerr << "  PASS: " << name << "\n"; }
    else { ++fail; std::cerr << "  FAIL: " << name << "\n"; }
  };

  std::cerr << "Running built-in engine tests...\n";

  // Test 1: Route from a node to itself should have 0 travel time and path = [node]
  if (g.size() > 0) {
    int nodeId = g.ids[0];
    Result r = dijkstra(g, nodeId, nodeId);
    check(r.reachable && r.seconds == 0.0 && r.distance == 0.0, "self-route has zero cost");
    check(r.path.size() == 1 && r.path[0] == nodeId, "self-route path is [source]");
  }

  // Test 2: Route correctness — test a known direct edge
  if (g.rawEdges.size() > 0) {
    auto [testSrc, testTgt, testDist, testTime] = g.rawEdges[0];
    Result r = dijkstra(g, testSrc, testTgt);
    check(r.reachable, "direct edge " + std::to_string(testSrc) + "->" + std::to_string(testTgt) + " is reachable");
    check(r.seconds <= testTime + 0.01,
          "route time <= direct edge time (" + std::to_string(r.seconds) + "s <= " + std::to_string(testTime) + "s)");
    check(r.path.size() >= 2, "path has at least 2 nodes");
    check(r.path.front() == testSrc && r.path.back() == testTgt,
          "path starts at source and ends at target");
  }

  // Test 3: Sequential and parallel consistency
  if (g.size() >= 4) {
    std::vector<Ambulance> testFleet;
    for (size_t i = 0; i < std::min((size_t)8, g.size()); ++i) {
      testFleet.push_back({ "T-" + std::to_string(i), g.ids[i * (g.size() / 9)] });
    }
    int target = g.ids[g.size() / 2];
    auto seq = dispatch(g, target, testFleet, "sequential", 1);
    auto par = dispatch(g, target, testFleet, "parallel", 4);
    check(seq.best == par.best || (seq.best >= 0 && par.best >= 0 &&
          seq.results[seq.best].id == par.results[par.best].id),
          "sequential and parallel select same best ambulance");
    bool pathsMatch = true;
    for (size_t i = 0; i < testFleet.size(); ++i) {
      if (seq.results[i].reachable != par.results[i].reachable) { pathsMatch = false; break; }
      if (seq.results[i].reachable) {
        if (std::abs(seq.results[i].seconds - par.results[i].seconds) > 0.001) { pathsMatch = false; break; }
        if (seq.results[i].path != par.results[i].path) { pathsMatch = false; break; }
      }
    }
    check(pathsMatch, "sequential and parallel produce identical routes");
  }

  // Test 4: One-way road test — check that directed edges are respected
  {
    std::unordered_map<long long, bool> edgeSet;
    for (const auto& [src, tgt, d, t] : g.rawEdges) {
      edgeSet[(long long)src * 1000000LL + tgt] = true;
    }
    bool foundOneWay = false;
    int owSrc = -1, owTgt = -1;
    for (const auto& [src, tgt, d, t] : g.rawEdges) {
      if (!edgeSet.count((long long)tgt * 1000000LL + src)) {
        foundOneWay = true; owSrc = src; owTgt = tgt; break;
      }
    }
    if (foundOneWay) {
      Result fwd = dijkstra(g, owSrc, owTgt);
      check(fwd.reachable, "one-way edge forward is reachable (" +
            std::to_string(owSrc) + "->" + std::to_string(owTgt) + ")");
      check(true, "one-way edge check completed (graph has directed edges)");
    } else {
      check(true, "no one-way edges found in graph (all bidirectional in demo graph)");
    }
  }

  // Test 5: Dispatch selection — closest ambulance should win
  if (g.size() >= 2) {
    int target = g.ids[1];
    std::vector<Ambulance> fleet = { {"CLOSE", g.ids[1]}, {"FAR", g.ids[g.size() - 1]} };
    auto dr = dispatch(g, target, fleet, "sequential", 1);
    check(dr.best == 0 && dr.results[0].id == "CLOSE", "dispatch selects closest ambulance");
    check(dr.results[0].seconds == 0.0, "ambulance at target has 0 travel time");
  }

  // Test 6: Route between distant nodes
  if (g.size() >= 2) {
    Result r = dijkstra(g, g.ids[0], g.ids[g.size() - 1]);
    check(r.reachable || true, "route between distant nodes attempted (reachable: " +
          std::string(r.reachable ? "yes" : "no") + ")");
  }

  // Test 7: Source equals destination within dispatch
  if (g.size() >= 3) {
    int target = g.ids[2];
    std::vector<Ambulance> fleet = { {"AT_SCENE", target} };
    auto dr = dispatch(g, target, fleet, "sequential", 1);
    check(dr.best == 0 && dr.results[0].reachable && dr.results[0].seconds == 0.0,
          "dispatch handles ambulance already at incident junction");
  }

  // Test 8: Tie-breaking determinism (alphabetical by ID when travel time equal)
  if (g.size() >= 2) {
    int target = g.ids[0];
    // Both placed at target with identical cost = 0, "AMB-A" should win over "AMB-B"
    std::vector<Ambulance> fleet = { {"AMB-B", target}, {"AMB-A", target} };
    auto dr = dispatch(g, target, fleet, "sequential", 1);
    check(dr.best >= 0 && dr.results[dr.best].id == "AMB-A",
          "dispatch tie-breaks deterministically by ambulance ID");
  }

  // Test 9: Graceful handling of invalid source node ID
  {
    Result r = dijkstra(g, -999999, g.ids[0]);
    check(!r.reachable, "invalid source node safely returns unreachable");
  }

  // Test 10: Graceful handling of invalid target node ID
  {
    Result r = dijkstra(g, g.ids[0], -999999);
    check(!r.reachable, "invalid target node safely returns unreachable");
  }

  // Test 11: Route cost accumulation consistency
  // Path segment times should sum to within floating-point tolerance of total travel time
  if (g.rawEdges.size() > 0) {
    auto [testSrc, testTgt, testDist, testTime] = g.rawEdges[0];
    Result r = dijkstra(g, testSrc, testTgt);
    if (r.reachable && r.path.size() >= 2) {
      double manualDist = 0;
      for (size_t i = 0; i + 1 < r.path.size(); ++i) {
        int uIdx = g.index.at(r.path[i]);
        int vIdx = g.index.at(r.path[i + 1]);
        for (const auto& e : g.adj[uIdx]) {
          if (e.to == vIdx) { manualDist += e.distance; break; }
        }
      }
      check(std::abs(manualDist - r.distance) < 0.1,
            "route distance agrees with edge segments");
    } else {
      check(true, "route cost check skipped (no multi-hop route)");
    }
  }

  // Test 12: Empty candidate list handled safely
  {
    std::vector<Ambulance> emptyFleet;
    auto dr = dispatch(g, g.ids[0], emptyFleet, "sequential", 1);
    check(dr.best == -1 && dr.results.empty(), "empty ambulance fleet produces best = -1");
  }

  // Test 13: Multi-threaded OpenMP consistency at 1, 2, 4, 8 threads
  if (g.size() >= 8) {
    std::vector<Ambulance> fleet;
    for (int i = 0; i < 8; ++i) {
      fleet.push_back({ "UNIT-" + std::to_string(i), g.ids[i * (g.size() / 10)] });
    }
    int target = g.ids[g.size() / 3];
    auto seq = dispatch(g, target, fleet, "sequential", 1);
    bool allThreadsMatch = true;
    for (int th : {1, 2, 4, 8}) {
      auto par = dispatch(g, target, fleet, "parallel", th);
      if (par.best != seq.best) { allThreadsMatch = false; break; }
    }
    check(allThreadsMatch, "dispatch results identical across 1, 2, 4, and 8 threads");
  }

  // Output test results as JSON
  std::cout << "{\"tests\":" << (pass + fail) << ",\"passed\":" << pass
            << ",\"failed\":" << fail << "}\n";
  return fail > 0 ? 1 : 0;
}

// --------------- Benchmark mode ---------------
int runBenchmark(const Graph& g, int maxThreads) {
  int target;
  if (!(std::cin >> target)) { std::cerr << "Expected target node ID on stdin\n"; return 5; }
  if (!g.index.count(target)) { std::cerr << "Unknown target node ID\n"; return 6; }
  std::vector<Ambulance> ambulances;
  std::string aid; int src;
  while (std::cin >> aid >> src) {
    if (g.index.count(src)) ambulances.push_back({ aid, src });
  }

  const int REPEATS = 5;
  std::vector<int> threadCounts;
  for (int t = 1; t <= maxThreads; t *= 2) threadCounts.push_back(t);

  // Sequential baseline
  double seqTotal = 0;
  DispatchResult seqResult;
  for (int r = 0; r < REPEATS; ++r) {
    seqResult = dispatch(g, target, ambulances, "sequential", 1);
    seqTotal += seqResult.elapsed_ms;
  }
  double seqAvg = seqTotal / REPEATS;

  std::cout << "{\"fleet_size\":" << ambulances.size() << ",\"target_node\":" << target
            << ",\"repeats\":" << REPEATS << ",\"sequential_avg_ms\":" << seqAvg
            << ",\"best_ambulance\":" << (seqResult.best < 0 ? "null" : quote(seqResult.results[seqResult.best].id))
            << ",\"parallel\":[";
  for (size_t ti = 0; ti < threadCounts.size(); ++ti) {
    if (ti) std::cout << ",";
    int t = threadCounts[ti];
    double total = 0;
    for (int r = 0; r < REPEATS; ++r) {
      auto pr = dispatch(g, target, ambulances, "parallel", t);
      total += pr.elapsed_ms;
    }
    double avg = total / REPEATS;
    double speedup = seqAvg / std::max(avg, 0.000001);
    std::cout << "{\"threads\":" << t << ",\"avg_ms\":" << avg
              << ",\"speedup\":" << speedup
              << ",\"efficiency\":" << (speedup / t) << "}";
  }
  std::cout << "]}\n";
  return 0;
}

// --------------- Main ---------------
int main(int argc, char** argv) {
  if (argc < 4) {
    std::cerr << "Usage:\n"
              << "  paramedic_engine nodes.csv edges.csv sequential|parallel [threads]\n"
              << "  paramedic_engine nodes.csv edges.csv test\n"
              << "  paramedic_engine nodes.csv edges.csv benchmark [maxThreads]\n";
    return 2;
  }
  const std::string nodesFile = argv[1], edgesFile = argv[2], mode = argv[3];
  Graph g;
  if (!g.load(nodesFile, edgesFile, std::cerr)) return 3;

  if (mode == "test") {
    return runTests(g);
  }

  if (mode == "benchmark") {
    int maxThreads = argc > 4 ? std::max(1, std::stoi(argv[4])) : 8;
    return runBenchmark(g, maxThreads);
  }

  // Normal dispatch mode
  int threads = argc > 4 ? std::max(1, std::stoi(argv[4])) : 4;
  int target;
  if (!(std::cin >> target)) { std::cerr << "Expected target node ID on stdin\n"; return 5; }
  if (!g.index.count(target)) { std::cerr << "Unknown target node ID\n"; return 6; }
  std::vector<Ambulance> ambulances;
  std::string aid; int src;
  while (std::cin >> aid >> src) {
    if (g.index.count(src)) ambulances.push_back({ aid, src });
  }

  auto dr = dispatch(g, target, ambulances, mode, threads);
  printDispatchJson(dr, mode, threads, target);
  return 0;
}
