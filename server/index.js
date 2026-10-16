import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const app = express();
app.use(cors());
app.use(express.json());

const dataDir = resolve(root, 'engine/data');
const nodesPath = resolve(dataDir, 'nodes.csv');
const edgesPath = resolve(dataDir, 'edges.csv');
const metadataPath = resolve(dataDir, 'graph_metadata.json');

// Locate the C++ engine binary — MSVC puts it in build/Release/
const exeCandidates = process.platform === 'win32'
  ? [resolve(root, 'engine/build/Release/paramedic_engine.exe'), resolve(root, 'engine/build/paramedic_engine.exe')]
  : [resolve(root, 'engine/build/paramedic_engine')];
const exe = exeCandidates.find(p => existsSync(p)) || exeCandidates[0];

// --------------- CSV + metadata helpers ---------------
function parseCsvLines(path) {
  const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(1);
  return lines.map(line => line.split(','));
}
function loadMetadata() {
  try { return JSON.parse(readFileSync(metadataPath, 'utf8')); } catch { return {}; }
}

// --------------- Graph loading ---------------
let _graphCache = null;
let _validNodeSet = null;

function graph() {
  if (_graphCache) return _graphCache;
  const nodes = parseCsvLines(nodesPath).filter(r => r.length >= 3)
    .map(r => ({ id: Number(r[0]), lat: Number(r[1]), lon: Number(r[2]) }));
  const edges = parseCsvLines(edgesPath).filter(r => r.length >= 7)
    .map(r => ({
      id: Number(r[0]),
      source: Number(r[1]),
      target: Number(r[2]),
      distanceM: Number(r[3]),
      roadType: r[4],
      speedKmh: Number(r[5]),
      timeS: Number(r[6])
    }));
  const meta = loadMetadata();
  _validNodeSet = new Set(nodes.map(n => n.id));
  _graphCache = {
    nodes,
    edges,
    datasetType: meta.dataset_type || 'unknown',
    nodeCount: nodes.length,
    edgeCount: edges.length,
    metadata: meta
  };
  return _graphCache;
}

function isValidNode(nodeId) {
  if (!_validNodeSet) graph();
  return _validNodeSet.has(Number(nodeId));
}

function invalidateGraphCache() {
  _graphCache = null;
  _validNodeSet = null;
}

// --------------- Nearest-node snapping (Haversine) ---------------
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function snapToNode(lat, lon) {
  const g = graph();
  let best = null, bestDist = Infinity;
  for (const n of g.nodes) {
    const d = haversineM(lat, lon, n.lat, n.lon);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best ? { nodeId: best.id, lat: best.lat, lon: best.lon, snapDistM: Number(bestDist.toFixed(2)) } : null;
}

// --------------- Simulated ambulance fleet ---------------
function buildFleet() {
  const g = graph();
  const meta = loadMetadata();
  const isOSM = meta.dataset_type === 'openstreetmap_derived';

  if (!isOSM) {
    return [
      { id: 'AMB-01', nodeId: 1, available: true },
      { id: 'AMB-02', nodeId: 6, available: true },
      { id: 'AMB-03', nodeId: 13, available: true },
      { id: 'AMB-04', nodeId: 10, available: true },
      { id: 'AMB-05', nodeId: 15, available: false },
    ];
  }

  // Real OSM graph: distribute 10 ambulances across the network
  const count = 10;
  const step = Math.max(1, Math.floor(g.nodes.length / count));
  const fleet = [];
  for (let i = 0; i < count; i++) {
    const nodeIdx = Math.min(i * step, g.nodes.length - 1);
    const node = g.nodes[nodeIdx];
    fleet.push({
      id: `AMB-${String(i + 1).padStart(2, '0')}`,
      nodeId: node.id,
      available: i !== count - 1, // last ambulance is unavailable for testing
    });
  }
  return fleet;
}

let _fleet = null;
function getFleet() {
  if (!_fleet) _fleet = buildFleet();
  return _fleet;
}

// --------------- Engine execution ---------------
function runEngine(targetNode, ambulances, mode = 'parallel', threads = 4) {
  return new Promise((resolvePromise, reject) => {
    if (!existsSync(exe)) {
      const err = new Error('C++ routing engine executable not found. Run scripts/build.ps1 or build.sh first.');
      err.code = 'ENGINE_UNAVAILABLE';
      return reject(err);
    }
    const child = spawn(exe, [nodesPath, edgesPath, mode, String(threads)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', errText = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Routing engine execution timed out after 30 seconds.'));
    }, 30000);

    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => errText += d);
    child.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
    child.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) {
        const msg = errText.trim() || `Engine exited with code ${code}`;
        const err = new Error(msg);
        err.exitCode = code;
        return reject(err);
      }
      try {
        resolvePromise(JSON.parse(out));
      } catch (e) {
        reject(new Error(`Failed to parse engine JSON output: ${out.slice(0, 100)}`));
      }
    });

    const stdinData = `${targetNode}\n${ambulances.map(a => `${a.id} ${a.nodeId}`).join('\n')}\n`;
    child.stdin.end(stdinData);
  });
}

function attachCoordinates(result) {
  const nodesById = new Map(graph().nodes.map(n => [n.id, n]));
  if (result.candidates) {
    result.candidates = result.candidates.map(c => ({
      ...c,
      routeCoordinates: (c.path || []).map(id => {
        const n = nodesById.get(id);
        return n ? [n.lat, n.lon] : null;
      }).filter(Boolean),
    }));
  }
  return result;
}

// --------------- REST API Routes ---------------

// GET /api/health
app.get('/api/health', (_req, res) => {
  const hasExe = existsSync(exe);
  const hasNodes = existsSync(nodesPath);
  res.json({
    ok: true,
    engineBuilt: hasExe,
    project: 'ParaMedic',
    graphLoaded: hasNodes,
    nodeCount: graph().nodeCount,
    edgeCount: graph().edgeCount,
    datasetType: graph().datasetType
  });
});

// GET /api/graph
app.get('/api/graph', (_req, res) => {
  try {
    res.json(graph());
  } catch (e) {
    res.status(500).json({ error: 'Failed to load graph data.' });
  }
});

// GET /api/ambulances
app.get('/api/ambulances', (_req, res) => {
  try {
    res.json({
      ambulances: getFleet(),
      note: 'Simulated fleet positions. Not connected to real emergency dispatch.'
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve ambulance fleet.' });
  }
});

// POST /api/snap
app.post('/api/snap', (req, res) => {
  try {
    const lat = Number(req.body?.lat);
    const lon = Number(req.body?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'Invalid coordinates: lat and lon must be valid finite numbers.' });
    }
    const snapped = snapToNode(lat, lon);
    if (!snapped) {
      return res.status(404).json({ error: 'No road nodes available for snapping.' });
    }
    res.json(snapped);
  } catch (e) {
    res.status(500).json({ error: 'Error snapping coordinate to nearest road node.' });
  }
});

// POST /api/dispatch
app.post('/api/dispatch', async (req, res) => {
  try {
    if (!existsSync(exe)) {
      return res.status(503).json({ error: 'Routing engine service is unavailable. Please build the C++ engine.' });
    }

    let targetNode;
    if (req.body?.lat != null && req.body?.lon != null) {
      const lat = Number(req.body.lat);
      const lon = Number(req.body.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: 'lat and lon must be valid finite numbers.' });
      }
      const snapped = snapToNode(lat, lon);
      if (!snapped) return res.status(404).json({ error: 'Cannot snap coordinate to any road junction.' });
      targetNode = snapped.nodeId;
    } else if (req.body?.targetNode != null) {
      targetNode = Number(req.body.targetNode);
      if (!Number.isInteger(targetNode) || targetNode <= 0) {
        return res.status(400).json({ error: 'targetNode must be a positive integer.' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid request: provide either targetNode or lat/lon coordinates.' });
    }

    if (!isValidNode(targetNode)) {
      return res.status(400).json({ error: `Unknown target node ID: ${targetNode}` });
    }

    const threadsInput = req.body?.threads ?? 4;
    const threads = Number(threadsInput);
    if (!Number.isInteger(threads) || threads < 1 || threads > 32) {
      return res.status(400).json({ error: 'threads must be an integer between 1 and 32.' });
    }

    const mode = req.body?.mode === 'sequential' ? 'sequential' : 'parallel';
    const available = getFleet().filter(a => a.available);
    if (available.length === 0) {
      return res.status(400).json({ error: 'No ambulances are currently available for dispatch.' });
    }

    const result = await runEngine(targetNode, available, mode, threads);
    attachCoordinates(result);
    const nodesById = new Map(graph().nodes.map(n => [n.id, n]));
    result.target = nodesById.get(targetNode) ?? null;
    result.datasetType = graph().datasetType;
    res.json(result);
  } catch (e) {
    if (e.code === 'ENGINE_UNAVAILABLE') {
      return res.status(503).json({ error: e.message });
    }
    if (e.message && e.message.includes('Unknown target node ID')) {
      return res.status(400).json({ error: 'Unknown target node ID' });
    }
    res.status(500).json({ error: 'Internal dispatch calculation error.' });
  }
});

// POST /api/benchmark
app.post('/api/benchmark', async (req, res) => {
  try {
    if (!existsSync(exe)) {
      return res.status(503).json({ error: 'Routing engine service is unavailable. Please build the C++ engine.' });
    }

    const defaultTarget = graph().nodes[Math.floor(graph().nodes.length / 2)]?.id || 1;
    const targetNode = req.body?.targetNode != null ? Number(req.body.targetNode) : defaultTarget;
    if (!Number.isInteger(targetNode) || !isValidNode(targetNode)) {
      return res.status(400).json({ error: `Unknown target node ID: ${targetNode}` });
    }

    const maxThreads = Math.max(1, Math.min(32, Number(req.body?.maxThreads ?? 8)));
    const threadCounts = [1, 2, 4, 8].filter(n => n <= maxThreads);
    const fleetSizes = req.body?.fleetSizes || [getFleet().filter(a => a.available).length];
    const repeats = Math.max(1, Math.min(10, Number(req.body?.repeats ?? 3)));

    const benchResults = [];
    for (const fleetSize of fleetSizes) {
      const allAvailable = getFleet().filter(a => a.available);
      const fleet = [];
      for (let i = 0; i < fleetSize; i++) {
        const base = allAvailable[i % allAvailable.length];
        fleet.push({ id: `AMB-${String(i + 1).padStart(3, '0')}`, nodeId: base.nodeId });
      }

      // Sequential baseline
      const seqTimes = [];
      let seqResult = null;
      for (let r = 0; r < repeats; r++) {
        const s = await runEngine(targetNode, fleet, 'sequential', 1);
        seqTimes.push(s.elapsed_ms);
        if (!seqResult) seqResult = s;
      }
      const seqAvg = seqTimes.reduce((a, b) => a + b, 0) / seqTimes.length;

      // Parallel runs
      const parallelResults = [];
      for (const t of threadCounts) {
        const times = [];
        let pResult = null;
        for (let r = 0; r < repeats; r++) {
          const p = await runEngine(targetNode, fleet, 'parallel', t);
          times.push(p.elapsed_ms);
          if (!pResult) pResult = p;
        }
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);
        parallelResults.push({
          threads: t,
          avg_ms: Number(avg.toFixed(4)),
          min_ms: Number(min.toFixed(4)),
          max_ms: Number(max.toFixed(4)),
          speedup: Number((seqAvg / Math.max(avg, 0.000001)).toFixed(4)),
          efficiency: Number(((seqAvg / Math.max(avg, 0.000001)) / t).toFixed(4)),
          best_ambulance: pResult.best_ambulance,
        });
      }

      benchResults.push({
        fleetSize,
        targetNode,
        repeats,
        sequential: {
          avg_ms: Number(seqAvg.toFixed(4)),
          min_ms: Number(Math.min(...seqTimes).toFixed(4)),
          max_ms: Number(Math.max(...seqTimes).toFixed(4)),
          best_ambulance: seqResult.best_ambulance,
        },
        parallel: parallelResults,
      });
    }

    res.json({
      benchmarks: benchResults,
      graphInfo: { nodes: graph().nodeCount, edges: graph().edgeCount, datasetType: graph().datasetType },
      warning: graph().datasetType === 'synthetic_demo_graph_not_real_road_data'
        ? 'Small synthetic graph: benchmark timings are demonstration only. Repeat on a real OSM graph and larger fleets before drawing conclusions.'
        : 'Benchmark timings reflect computational work only. Real-world dispatch involves network latency, traffic, etc.',
    });
  } catch (e) {
    if (e.code === 'ENGINE_UNAVAILABLE') {
      return res.status(503).json({ error: e.message });
    }
    res.status(500).json({ error: 'Internal benchmark execution error.' });
  }
});

// POST /api/reload
app.post('/api/reload', (_req, res) => {
  try {
    invalidateGraphCache();
    _fleet = null;
    res.json({ ok: true, ...graph() });
  } catch (e) {
    res.status(500).json({ error: 'Failed to reload graph cache.' });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`ParaMedic API: http://localhost:${port} (engine: ${existsSync(exe) ? 'found' : 'NOT FOUND'})`));
