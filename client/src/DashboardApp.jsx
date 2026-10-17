import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Activity, Ambulance, ArrowUpRight, Clock3, Cpu, Crosshair, Gauge, GitBranch, MapPin, Play, Radio, Route, ShieldCheck, Zap, Wifi, WifiOff } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

const DEMO_NODES = [
  [1,12.9560,77.6990],[2,12.9580,77.7020],[3,12.9600,77.7050],[4,12.9530,77.7030],
  [5,12.9550,77.7070],[6,12.9580,77.7100],[7,12.9510,77.7080],[8,12.9530,77.7120],
  [9,12.9560,77.7140],[10,12.9600,77.7140],[11,12.9620,77.7100],[12,12.9640,77.7050],
  [13,12.9490,77.7040],[14,12.9480,77.7100],[15,12.9510,77.7160],[16,12.9630,77.7160]
].map(([id,lat,lon]) => ({ id, lat, lon }));

const PAIRS = [
  [1,2,420,43.2],[2,3,460,55.2],[1,4,390,46.8],[4,5,430,61.92],[5,6,400,41.14],
  [4,7,510,91.8],[7,8,450,64.8],[8,9,420,50.4],[9,10,500,51.43],[3,6,560,67.2],
  [6,9,460,66.24],[3,12,520,53.49],[12,11,480,57.6],[11,10,510,61.2],[13,4,480,86.4],
  [13,14,520,74.88],[14,8,540,64.8],[14,15,560,100.8],[15,9,490,58.8],[10,16,430,61.92],
  [16,11,470,56.4],[2,4,390,93.6],[5,8,530,63.6]
];
const DEMO_EDGES = PAIRS.flatMap(([a,b,d,t],i) => [
  { id: i*2+1, source: a, target: b, distanceM: d, timeS: t, roadType: 'local' },
  { id: i*2+2, source: b, target: a, distanceM: d, timeS: t, roadType: 'local' }
]);
const DEMO_FLEET = [
  { id: 'AMB-01', nodeId: 1, available: true },
  { id: 'AMB-02', nodeId: 6, available: true },
  { id: 'AMB-03', nodeId: 13, available: true },
  { id: 'AMB-04', nodeId: 10, available: true },
  { id: 'AMB-05', nodeId: 15, available: false }
];

const makeIcon = (symbol, cls) => L.divIcon({
  className: 'map-marker-wrap',
  html: `<div class="map-marker ${cls}">${symbol}</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});
const ambulanceIcon = makeIcon('✚', 'ambulance-marker');
const unavailableIcon = makeIcon('✚', 'busy-marker');
const accidentIcon = makeIcon('!', 'accident-marker');

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}m ${s}s` : `${s}s`;
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNodeClient(latlng, nodes) {
  let result = null, best = Infinity;
  for (const n of nodes) {
    const d = haversineM(latlng.lat, latlng.lng, n.lat, n.lon);
    if (d < best) { best = d; result = n; }
  }
  return result;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    }
  });
  return null;
}

function FitRoute({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points?.length > 1) {
      map.fitBounds(points, { padding: [42, 42], maxZoom: 15 });
    }
  }, [points, map]);
  return null;
}

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

function Metric({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span className={`metric-icon ${accent || ''}`}><Icon size={17} /></span>
        <span className="metric-label">{label}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-sub">{sub}</div>
    </div>
  );
}

function TimingChart({ bench }) {
  if (!bench) {
    return (
      <div className="chart-empty">
        <Gauge size={22} />
        <span>Run the benchmark to compare actual C++ engine timings.</span>
      </div>
    );
  }

  // Normalize benchmark format:
  // Can be { benchmarks: [ { sequential: { avg_ms }, parallel: [ { threads, avg_ms, speedup, efficiency } ] } ] }
  // or { sequential: { elapsed_ms }, results: [ { threads, timeMs, speedup } ] }
  let baseTime = 0;
  let items = [];

  if (bench.benchmarks && bench.benchmarks.length > 0) {
    const firstScenario = bench.benchmarks[0];
    baseTime = Number(firstScenario.sequential?.avg_ms || 0);
    items = [
      { label: 'Sequential baseline', time: baseTime, baseline: true, speedup: 1.0, efficiency: 1.0 },
      ...(firstScenario.parallel || []).map(r => ({
        label: `${r.threads} thread${r.threads === 1 ? '' : 's'}`,
        time: Number(r.avg_ms),
        speedup: Number(r.speedup),
        efficiency: Number(r.efficiency || (r.speedup / r.threads))
      }))
    ];
  } else if (bench.sequential) {
    baseTime = Number(bench.sequential.elapsed_ms || bench.sequential.avg_ms || 0);
    const parList = bench.parallel || bench.results || [];
    items = [
      { label: 'Sequential baseline', time: baseTime, baseline: true, speedup: 1.0, efficiency: 1.0 },
      ...parList.map(r => ({
        label: `${r.threads} thread${r.threads === 1 ? '' : 's'}`,
        time: Number(r.timeMs ?? r.avg_ms ?? r.elapsed_ms ?? 0),
        speedup: Number(r.speedup),
        efficiency: Number(r.efficiency || (r.speedup / r.threads))
      }))
    ];
  }

  const max = Math.max(...items.map(x => x.time), 0.001);

  return (
    <div className="chart-body">
      {items.map((x, i) => (
        <div className="chart-row" key={`${x.label}-${i}`}>
          <div className="chart-row-head">
            <span>{x.label}</span>
            <strong>{x.time.toFixed(3)} <small>ms</small></strong>
          </div>
          <div className="bar-track">
            <div
              className={`bar-fill ${x.baseline ? 'baseline-bar' : ''}`}
              style={{ width: `${Math.max(3, (x.time / max) * 100)}%` }}
            />
          </div>
          {!x.baseline && (
            <div className="speedup-line">
              <span className={`speedup-tag ${x.speedup >= 1 ? 'positive' : 'negative'}`}>
                {x.speedup.toFixed(2)}× speedup
              </span>
              <span className="efficiency-tag">
                {(x.efficiency * 100).toFixed(1)}% eff
              </span>
            </div>
          )}
        </div>
      ))}
      <div className="chart-foot">
        <span>Lower time is better</span>
        <span>Measured by C++ engine</span>
      </div>
    </div>
  );
}

export default function DashboardApp({ onNavigateHome }) {
  const [graph, setGraph] = useState({
    nodes: DEMO_NODES,
    edges: DEMO_EDGES,
    datasetType: 'synthetic_demo_graph_not_real_road_data'
  });
  const [fleet, setFleet] = useState(DEMO_FLEET);
  const [target, setTarget] = useState(9);
  const [threads, setThreads] = useState(4);
  const [mode, setMode] = useState('parallel');
  const [dispatch, setDispatch] = useState(null);
  const [bench, setBench] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [apiOnline, setApiOnline] = useState(false);
  const [engineReady, setEngineReady] = useState(false);
  const [activeSection, setActiveSection] = useState('dispatch');

  const nodesById = useMemo(() => new Map(graph.nodes.map(n => [Number(n.id), n])), [graph]);
  const available = fleet.filter(a => a.available);
  const accident = nodesById.get(Number(target));

  const mapCenter = useMemo(() => {
    if (!graph.nodes || graph.nodes.length === 0) return [12.956, 77.708];
    const avgLat = graph.nodes.reduce((s, n) => s + n.lat, 0) / graph.nodes.length;
    const avgLon = graph.nodes.reduce((s, n) => s + n.lon, 0) / graph.nodes.length;
    return [avgLat, avgLon];
  }, [graph]);

  const best = dispatch?.candidates?.find(c => c.ambulance_id === dispatch.best_ambulance);
  const routePoints = best?.routeCoordinates?.length
    ? best.routeCoordinates
    : (best?.path || []).map(id => nodesById.get(Number(id))).filter(Boolean).map(n => [n.lat, n.lon]);

  const isRealGraph = /openstreetmap|\bosm\b/i.test(String(graph.datasetType || ''));

  // Load backend data on startup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [gRes, fRes, hRes] = await Promise.all([
          fetch(`${API}/graph`),
          fetch(`${API}/ambulances`),
          fetch(`${API}/health`)
        ]);

        if (!gRes.ok || !fRes.ok || !hRes.ok) throw new Error('API request failed');

        const g = await gRes.json();
        const f = await fRes.json();
        const h = await hRes.json();

        if (cancelled) return;

        if (g.nodes?.length) {
          setGraph({
            ...g,
            edges: (g.edges || []).map(e => ({
              ...e,
              source: Number(e.source),
              target: Number(e.target)
            }))
          });
          // Default target to middle node of loaded network
          setTarget(g.nodes[Math.floor(g.nodes.length / 2)].id);
        }

        if (f.ambulances?.length) {
          setFleet(f.ambulances);
        }

        setApiOnline(true);
        setEngineReady(Boolean(h.engineBuilt));
      } catch (err) {
        if (!cancelled) {
          setApiOnline(false);
          setEngineReady(false);
          setError('Backend API offline. Start the Node.js server to enable real-world routing & OpenMP dispatch.');
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const selectTarget = useCallback((id) => {
    setTarget(Number(id));
    setDispatch(null);
    setBench(null);
    setError('');
  }, []);

  // Map click handler with backend nearest-road snapping
  const handleMapClick = useCallback(async (latlng) => {
    setError('');
    if (apiOnline) {
      try {
        const r = await fetch(`${API}/snap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: latlng.lat, lon: latlng.lng })
        });
        const data = await r.json();
        if (data.nodeId) {
          selectTarget(data.nodeId);
          return;
        }
      } catch (e) {
        // Fall back to client-side snapping if backend call fails
      }
    }
    const n = nearestNodeClient(latlng, graph.nodes);
    if (n) selectTarget(n.id);
  }, [apiOnline, graph.nodes, selectTarget]);

  async function runDispatch() {
    setBusy(true);
    setError('');
    try {
      if (!apiOnline || !engineReady) {
        throw new Error('C++ engine is offline. Start the backend API and build the engine first.');
      }
      const r = await fetch(`${API}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetNode: Number(target),
          threads: Number(threads),
          mode
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Dispatch calculation failed.');
      setDispatch(data);
      setActiveSection('dispatch');
    } catch (e) {
      setError(e.message || 'Unable to calculate dispatch.');
    } finally {
      setBusy(false);
    }
  }

  async function runBenchmark() {
    if (!apiOnline || !engineReady) {
      setError('Build the C++ engine and start the Node API to measure real OpenMP timings.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API}/benchmark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetNode: Number(target),
          maxThreads: 8,
          repeats: 3
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Benchmark calculation failed.');
      setBench(data);
      setActiveSection('benchmark');
    } catch (e) {
      setError(e.message || 'Benchmark run failed.');
    } finally {
      setBusy(false);
    }
  }

  function goTo(section) {
    setActiveSection(section);
    document.getElementById(
      section === 'benchmark' ? 'benchmark-section' :
      section === 'fleet' ? 'fleet-section' : 'dispatch-section'
    )?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Calculate best speedup and baseline from benchmark data
  const bestSpeedup = useMemo(() => {
    if (!bench) return null;
    let list = [];
    if (bench.benchmarks && bench.benchmarks.length > 0) {
      list = bench.benchmarks[0].parallel || [];
    } else if (bench.results) {
      list = bench.results;
    }
    const maxS = Math.max(...list.map(r => Number(r.speedup) || 0), 0);
    return maxS > 0 ? maxS.toFixed(2) : null;
  }, [bench]);

  const baselineMs = useMemo(() => {
    if (!bench) return null;
    if (bench.benchmarks && bench.benchmarks.length > 0) {
      return Number(bench.benchmarks[0].sequential?.avg_ms || 0).toFixed(3);
    }
    if (bench.sequential) {
      return Number(bench.sequential.elapsed_ms || bench.sequential.avg_ms || 0).toFixed(3);
    }
    return null;
  }, [bench]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Ambulance size={23} /></div>
          <div>
            <div className="brand-name">ParaMedic<span className="brand-period">.</span></div>
            <div className="brand-sub">DISPATCH INTELLIGENCE</div>
          </div>
        </div>

        <div className="nav-label">OPERATIONS</div>
        <button
          className={`nav-item ${activeSection === 'dispatch' ? 'active' : ''}`}
          onClick={() => goTo('dispatch')}
        >
          <Activity size={17} /> Live dispatch <span className="live-dot" />
        </button>
        <button
          className={`nav-item ${activeSection === 'fleet' ? 'active' : ''}`}
          onClick={() => goTo('fleet')}
        >
          <Ambulance size={17} /> Fleet status
        </button>
        <button
          className={`nav-item ${activeSection === 'benchmark' ? 'active' : ''}`}
          onClick={() => goTo('benchmark')}
        >
          <GitBranch size={17} /> Parallel benchmark
        </button>

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className={`status-dot ${engineReady ? 'good' : 'bad'}`} />
            <div>
              <strong>{engineReady ? 'Engine online' : apiOnline ? 'API online · engine offline' : 'API offline'}</strong>
              <small>{engineReady ? 'C++17 · OpenMP' : apiOnline ? 'Engine compile required' : 'Start server on :4000'}</small>
            </div>
          </div>
          <div className="demo-note">
            SAFETY NOTICE<br />
            <span>Simulated positions only. Not connected to real emergency services (108/911).</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-pulse" /> EMERGENCY RESPONSE SYSTEM / BENGALURU
            </div>
            <h1>Dispatch <span>control room</span></h1>
            <p className="header-subtitle">
              Find fastest available unit. Dijkstra routing by travel time with OpenMP candidate parallelism.
            </p>
          </div>
          <div className="top-actions">
            <a
              href="/"
              onClick={(e) => {
                if (onNavigateHome) {
                  e.preventDefault();
                  onNavigateHome();
                }
              }}
              className="pill"
              style={{ textDecoration: 'none', cursor: 'pointer', background: '#122b36', color: '#7de6c7' }}
              title="Return to the cinematic landing page"
            >
              ← Overview
            </a>
            <div className={`pill ${engineReady ? 'pill-online' : 'pill-preview'}`}>
              <Radio size={14} />
              {engineReady ? 'ENGINE CONNECTED' : 'BACKEND OFFLINE'}
            </div>
            <div className="avatar">PM</div>
          </div>
        </header>

        <section className="metric-grid">
          <Metric
            icon={Ambulance}
            label="FLEET UNITS"
            value={String(fleet.length).padStart(2, '0')}
            sub={`${available.length} available for dispatch`}
          />
          <Metric
            icon={Clock3}
            label="SELECTED ETA"
            value={best ? fmtTime(best.travel_time_s) : '—'}
            sub="Estimated road travel time"
            accent="mint"
          />
          <Metric
            icon={Route}
            label="ROUTE DISTANCE"
            value={best ? `${(best.distance_m / 1000).toFixed(2)} km` : '—'}
            sub="Recommended route length"
            accent="blue"
          />
          <Metric
            icon={Zap}
            label="ENGINE TIME"
            value={dispatch ? `${Number(dispatch.elapsed_ms).toFixed(3)} ms` : '—'}
            sub={mode === 'parallel' ? `${threads} OpenMP threads` : 'Sequential baseline'}
            accent="amber"
          />
        </section>

        {error && (
          <div className="error-banner">
            <Activity size={15} />
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss message">×</button>
          </div>
        )}

        <section className="workspace" id="dispatch-section">
          <div className="map-panel">
            <div className="panel-head">
              <div>
                <div className="section-kicker">GEOSPATIAL VIEW</div>
                <h2>Road network & fleet</h2>
                <p>{isRealGraph ? 'OpenStreetMap Marathahalli–Bellandur road graph' : 'Sample road graph'} · click map to place incident</p>
              </div>
              <div className="map-legend">
                <span><i className="legend-amb" /> Available</span>
                <span><i className="legend-busy" /> Unavailable</span>
                <span><i className="legend-acc" /> Incident</span>
              </div>
            </div>

            <div className="map-wrap">
              <MapContainer center={mapCenter} zoom={14} scrollWheelZoom className="leaflet-map">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter center={mapCenter} />
                <MapClickHandler onMapClick={handleMapClick} />

                {/* Render road segments */}
                {graph.edges.map((e, i) => {
                  const a = nodesById.get(Number(e.source));
                  const b = nodesById.get(Number(e.target));
                  return a && b ? (
                    <Polyline
                      key={e.id ?? i}
                      positions={[[a.lat, a.lon], [b.lat, b.lon]]}
                      pathOptions={{ color: '#566e85', weight: 2.0, opacity: 0.50 }}
                    />
                  ) : null;
                })}

                {/* Render simulated fleet markers */}
                {fleet.map(a => {
                  const n = nodesById.get(Number(a.nodeId));
                  return n ? (
                    <Marker
                      key={a.id}
                      position={[n.lat, n.lon]}
                      icon={a.available ? ambulanceIcon : unavailableIcon}
                    >
                      <Popup>
                        <div className="map-popup">
                          <strong>{a.id}</strong>
                          <span className={a.available ? 'popup-available' : 'popup-unavailable'}>
                            {a.available ? 'Available for dispatch' : 'Currently unavailable'}
                          </span>
                          <small>Simulated GPS · Node {a.nodeId}</small>
                        </div>
                      </Popup>
                    </Marker>
                  ) : null;
                })}

                {/* Render incident marker */}
                {accident && (
                  <Marker position={[accident.lat, accident.lon]} icon={accidentIcon}>
                    <Popup>
                      <div className="map-popup">
                        <strong>Incident location</strong>
                        <span>Junction Node {target}</span>
                        <small>Click map to change location</small>
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Render winning route polyline */}
                {routePoints.length > 1 && (
                  <>
                    <Polyline
                      positions={routePoints}
                      pathOptions={{ color: '#31d9ad', weight: 6, opacity: 0.94 }}
                    />
                    <Polyline
                      positions={routePoints}
                      pathOptions={{ color: '#d4fff2', weight: 1.5, opacity: 0.85, dashArray: '4 10' }}
                    />
                    <FitRoute points={routePoints} />
                  </>
                )}

                {accident && (
                  <CircleMarker
                    center={[accident.lat, accident.lon]}
                    radius={14}
                    pathOptions={{ color: '#ff8879', weight: 1.5, fillColor: '#ff8879', fillOpacity: 0.16 }}
                  />
                )}
              </MapContainer>

              <div className="map-stamp">
                <span className="live-dot" />
                {isRealGraph ? 'BENGALURU OSM NETWORK' : 'SYNTHETIC NETWORK'}{' '}
                <span>·</span> {graph.nodes.length} nodes / {graph.edges.length} edges
              </div>
              <div className="map-tools">
                <Crosshair size={14} />
                <span>CLICK MAP TO PLACE INCIDENT</span>
              </div>
            </div>

            <div className="map-footer">
              <span>
                <MapPin size={13} /> Incident target: <strong>Node {target}</strong>
              </span>
              <span>
                <span className={`status-dot ${apiOnline ? 'good' : 'bad'}`} />
                {apiOnline ? 'API connected' : 'API offline'}
              </span>
            </div>
          </div>

          <div className="dispatch-panel">
            <div className="panel-head">
              <div>
                <div className="section-kicker">DISPATCH CONFIG</div>
                <h2>Dispatch request</h2>
                <p>Configure route computation</p>
              </div>
              <div className="icon-box"><MapPin size={17} /></div>
            </div>

            <div className="dispatch-content">
              <label className="field-label" htmlFor="incident-node">INCIDENT JUNCTION</label>
              <select
                id="incident-node"
                value={target}
                onChange={e => selectTarget(e.target.value)}
              >
                {graph.nodes.slice(0, 300).map(n => (
                  <option key={n.id} value={n.id}>
                    Node {n.id} · {n.lat.toFixed(4)}, {n.lon.toFixed(4)}
                  </option>
                ))}
              </select>
              <div className="selection-hint">
                <Crosshair size={13} /> Select junction above or click anywhere on map.
              </div>

              <label className="field-label">ROUTE COMPUTATION</label>
              <div className="segmented">
                <button
                  className={mode === 'sequential' ? 'selected' : ''}
                  onClick={() => setMode('sequential')}
                >
                  Sequential
                </button>
                <button
                  className={mode === 'parallel' ? 'selected' : ''}
                  onClick={() => setMode('parallel')}
                >
                  OpenMP parallel
                </button>
              </div>

              {mode === 'parallel' && (
                <>
                  <div className="range-label">
                    <label className="field-label">CPU THREADS</label>
                    <strong>{threads} <span>threads</span></strong>
                  </div>
                  <input
                    aria-label="CPU threads"
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={threads}
                    onChange={e => setThreads(Number(e.target.value))}
                  />
                  <div className="range-scale">
                    <span>1 thread</span>
                    <span>8 threads</span>
                  </div>
                </>
              )}

              <div className="dispatch-summary">
                <div>
                  <span>AVAILABLE UNITS</span>
                  <strong>{available.length} / {fleet.length}</strong>
                </div>
                <div>
                  <span>OPTIMIZATION</span>
                  <strong>Minimum Travel Time</strong>
                </div>
              </div>

              <button
                className="primary-btn"
                disabled={busy || !graph.nodes.length || !engineReady}
                onClick={runDispatch}
              >
                <Play size={15} fill="currentColor" />
                {busy ? 'Calculating routes…' : 'Find fastest ambulance'}
                <ArrowUpRight size={16} />
              </button>

              <div className="divider-line" />

              <div className="result-head">
                <h3>Recommended unit</h3>
                <span className={`result-status ${best ? '' : 'waiting'}`}>
                  {best ? 'ROUTE FOUND' : 'AWAITING DISPATCH'}
                </span>
              </div>

              {best ? (
                <div className="winner-card">
                  <div className="winner-top">
                    <div className="winner-icon"><Ambulance size={20} /></div>
                    <div>
                      <strong>{best.ambulance_id}</strong>
                      <small>Fastest reachable available unit · from Node {best.source_node}</small>
                    </div>
                    <ShieldCheck className="winner-check" size={18} />
                  </div>
                  <div className="winner-stats">
                    <div>
                      <small>ESTIMATED ETA</small>
                      <strong>{fmtTime(best.travel_time_s)}</strong>
                    </div>
                    <div>
                      <small>DISTANCE</small>
                      <strong>{(best.distance_m / 1000).toFixed(2)} km</strong>
                    </div>
                    <div>
                      <small>JUNCTIONS</small>
                      <strong>{best.path?.length || routePoints.length}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <Route size={23} />
                  <div>
                    <strong>No dispatch calculated</strong>
                    <span>Click 'Find fastest ambulance' to evaluate routes.</span>
                  </div>
                </div>
              )}

              {/* Candidate ambulances comparison table */}
              {dispatch && dispatch.candidates && (
                <div className="candidates-list">
                  <div className="candidates-heading">Evaluated candidates ({dispatch.candidates.length})</div>
                  {dispatch.candidates.map(c => (
                    <div
                      key={c.ambulance_id}
                      className={`candidate-row ${c.ambulance_id === dispatch.best_ambulance ? 'best' : ''}`}
                    >
                      <span className="cand-id">{c.ambulance_id}</span>
                      <span>{c.reachable ? fmtTime(c.travel_time_s) : 'Unreachable'}</span>
                      <span>{c.reachable ? `${(c.distance_m / 1000).toFixed(2)} km` : '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="small-note">
                <ShieldCheck size={13} /> ETA uses static road classification speeds, not live traffic.
              </div>
            </div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="panel fleet-panel" id="fleet-section">
            <div className="panel-head">
              <div>
                <div className="section-kicker">UNIT MONITOR</div>
                <h2>Fleet availability</h2>
                <p>Simulated positions · click unit to focus incident nearby</p>
              </div>
              <span className="count-pill">{fleet.length} UNITS</span>
            </div>
            <div className="fleet-table">
              <div className="fleet-row table-heading">
                <span>UNIT ID</span>
                <span>POSITION</span>
                <span>STATUS</span>
              </div>
              {fleet.map(a => (
                <button
                  className="fleet-row fleet-row-button"
                  key={a.id}
                  onClick={() => selectTarget(a.nodeId)}
                  title={`Select Node ${a.nodeId}`}
                >
                  <span className="unit-name">
                    <span className="unit-mini"><Ambulance size={14} /></span>
                    {a.id}
                  </span>
                  <span>Node {a.nodeId}</span>
                  <span className={a.available ? 'available' : 'unavailable'}>
                    <i /> {a.available ? 'Available' : 'Unavailable'}
                  </span>
                </button>
              ))}
            </div>
            <div className="fleet-foot">
              <span><i className="status-dot good" /> {available.length} ready</span>
              <span><i className="status-dot bad" /> {fleet.length - available.length} busy</span>
              <small>Simulated positions.</small>
            </div>
          </div>

          <div className="panel benchmark-panel" id="benchmark-section">
            <div className="panel-head">
              <div>
                <div className="section-kicker">PERFORMANCE LAB</div>
                <h2>Parallel performance</h2>
                <p>Sequential baseline vs OpenMP threads</p>
              </div>
              <div className="icon-box"><Activity size={17} /></div>
            </div>
            <div className="benchmark-intro">
              <div className="bench-icon"><Cpu size={20} /></div>
              <div>
                <strong>Measure route search computation</strong>
                <p>Identical target, fleet and graph weights evaluated across 1, 2, 4 and 8 threads.</p>
              </div>
            </div>

            <button
              className="secondary-btn"
              disabled={busy || !engineReady}
              onClick={runBenchmark}
            >
              <Activity size={16} />
              {busy ? 'Running benchmark suite…' : 'Run benchmark suite'}
              <ArrowUpRight size={15} />
            </button>

            {!engineReady && (
              <div className="benchmark-locked">
                <ShieldCheck size={14} /> Build the engine and start API to run benchmarks.
              </div>
            )}

            <TimingChart bench={bench} />

            {bench && (
              <div className="benchmark-summary">
                <div>
                  <span>BEST SPEEDUP</span>
                  <strong>{bestSpeedup ? `${bestSpeedup}×` : '—'}</strong>
                </div>
                <div>
                  <span>BASELINE</span>
                  <strong>{baselineMs ? `${baselineMs} ms` : '—'}</strong>
                </div>
              </div>
            )}

            {bench?.warning && <p className="warning-text">{bench.warning}</p>}

            <div className="formula-note">
              <span>Speedup</span> = sequential time ÷ parallel time <b>·</b>{' '}
              <span>Efficiency</span> = speedup ÷ threads
            </div>
          </div>
        </section>

        <footer>
          <span>ParaMedic <b>·</b> VTU Parallel Computing Project</span>
          <span>Simulation only — not connected to emergency services</span>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            © OpenStreetMap contributors
          </a>
        </footer>
      </main>
    </div>
  );
}

