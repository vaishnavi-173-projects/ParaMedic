import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CENTER } from '../config.js';
import { buildDemoGraph } from '../lib/graph.js';
import { apiConfigured, dispatchDemo, dispatchViaApi, fetchAmbulances } from '../lib/api.js';
import { useReducedMotion } from '../lib/hooks.js';

// Fallback simulated positions if API is offline
const DEFAULT_AMBULANCES = [
  { id: 'AMB-01', lat: 12.9552, lng: 77.6985 },
  { id: 'AMB-02', lat: 12.9461, lng: 77.6794 },
  { id: 'AMB-03', lat: 12.9338, lng: 77.6921 },
  { id: 'AMB-04', lat: 12.9409, lng: 77.7042 },
  { id: 'AMB-05', lat: 12.9316, lng: 77.6762 },
];
const BASE = { lat: 12.956, lng: 77.708 };

const icon = (cls, label) =>
  L.divIcon({ className: '', html: `<span class="pin ${cls}">${label || ''}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

const fmt = (s) => (s == null ? '—' : s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

export default function Demo() {
  const mapEl = useRef(null);
  const map = useRef(null);
  const layers = useRef({});
  const reduce = useReducedMotion();
  const graph = useMemo(() => buildDemoGraph(), []);

  const [ambulances, setAmbulances] = useState(DEFAULT_AMBULANCES);
  const [incident, setIncident] = useState(null);
  const [mode, setMode] = useState('parallel');
  const [threads, setThreads] = useState(4);
  const [status, setStatus] = useState('idle'); // idle | loading | done | empty | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLiveApi, setIsLiveApi] = useState(apiConfigured);

  // Load real fleet positions on mount if API available
  useEffect(() => {
    let active = true;
    fetchAmbulances().then((fleet) => {
      if (!active || !fleet || !fleet.length) return;
      const valid = fleet
        .filter((a) => a.lat != null && a.lon != null)
        .slice(0, 10)
        .map((a) => ({
          id: a.id,
          lat: a.lat,
          lng: a.lon,
          nodeId: a.nodeId,
          available: a.available !== false,
        }));
      if (valid.length > 0) {
        setAmbulances(valid);
        setIsLiveApi(true);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Create the map once.
  useEffect(() => {
    const m = L.map(mapEl.current, { center: MAP_CENTER, zoom: 13, zoomControl: true, tap: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(m);
    layers.current.amb = L.layerGroup().addTo(m);
    layers.current.route = L.layerGroup().addTo(m);
    L.marker([BASE.lat, BASE.lng], { icon: icon('base', 'H'), title: 'Dispatch base (Bengaluru OSM center)', keyboard: false }).addTo(m);
    m.on('click', (e) => setIncident({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    setTimeout(() => m.invalidateSize(), 0);
    return () => m.remove();
  }, []);

  // Ambulance + incident markers.
  useEffect(() => {
    const g = layers.current.amb;
    if (!g) return;
    g.clearLayers();
    ambulances.forEach((a) => {
      const isSel = result?.selected?.id === a.id;
      const label = a.id.replace('AMB-', '').replace(/^0+/, '');
      L.marker([a.lat, a.lng], {
        icon: icon(isSel ? 'amb sel' : 'amb', label),
        title: `${a.id} (simulated position)`,
        keyboard: false,
      }).addTo(g);
    });
    if (incident) {
      L.marker([incident.lat, incident.lng], { icon: icon('inc', '!'), title: 'Incident location' }).addTo(g);
    }
  }, [incident, result, ambulances]);

  // Route drawing.
  useEffect(() => {
    const g = layers.current.route;
    if (!g) return;
    g.clearLayers();
    if (status !== 'done' || !result) return;

    result.candidates.forEach((c) => {
      if (c.id !== result.selected?.id && c.path?.length > 1) {
        L.polyline(c.path, { color: '#8a8f93', weight: 3, opacity: 0.55, dashArray: '4 6' }).addTo(g);
      }
    });

    const p = result.selected?.path;
    if (p?.length > 1) {
      const line = L.polyline(p, { color: '#c6f432', weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(g);
      map.current.fitBounds(line.getBounds(), { padding: [50, 50] });
      const el = line.getElement?.();
      if (el && !reduce && el.getTotalLength) {
        const len = el.getTotalLength();
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = len;
        el.getBoundingClientRect();
        el.style.transition = 'stroke-dashoffset 900ms cubic-bezier(.3,.7,.2,1)';
        el.style.strokeDashoffset = 0;
      }
    }
  }, [status, result, reduce]);

  const run = async () => {
    if (!incident) return;
    setStatus('loading');
    setError('');
    try {
      let out;
      if (isLiveApi) {
        out = await dispatchViaApi({ incident, ambulances, mode, threads }, AbortSignal.timeout(15000));
      } else {
        out = dispatchDemo(graph, incident, ambulances);
      }
      if (out.empty) {
        setResult(null);
        setStatus('empty');
        return;
      }
      setResult(out);
      setStatus('done');
    } catch (e) {
      // Fallback to in-browser demo if API failed
      if (isLiveApi) {
        try {
          const fallback = dispatchDemo(graph, incident, ambulances);
          if (!fallback.empty) {
            setResult(fallback);
            setStatus('done');
            return;
          }
        } catch {}
      }
      setError(e.message || 'Request failed');
      setStatus('error');
    }
  };

  const reset = () => {
    setIncident(null);
    setResult(null);
    setStatus('idle');
    setError('');
    map.current?.setView(MAP_CENTER, 13);
  };

  return (
    <div className="demo-grid">
      <div className="map-wrap">
        <div ref={mapEl} className="map" role="application" aria-label="Interactive road map. Click or tap to place an incident." />
        {!incident && <p className="map-hint">Tap the map to place an incident</p>}
      </div>

      <aside className="panel" aria-live="polite">
        <p className={`badge ${isLiveApi ? 'live' : 'demo'}`}>
          {isLiveApi ? 'Connected to C++ / OpenMP Routing API' : 'Demo mode: in-browser graph, not the OSM engine'}
        </p>

        <fieldset className="modes" disabled={!isLiveApi}>
          <legend>Execution mode</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {['sequential', 'parallel'].map((m) => (
              <label key={m}>
                <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                <span>{m === 'parallel' ? 'Parallel (OpenMP)' : 'Sequential'}</span>
              </label>
            ))}
          </div>

          {mode === 'parallel' && isLiveApi && (
            <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Threads:</span>
              {[1, 2, 4, 8].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setThreads(t)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--line)',
                    background: threads === t ? 'var(--lime)' : 'var(--panel)',
                    color: threads === t ? '#000' : 'var(--text)',
                    fontWeight: threads === t ? 700 : 400,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {!isLiveApi && <small>Available once the Express bridge is connected (port 4000).</small>}
        </fieldset>

        <div className="actions">
          <button className="btn primary" onClick={run} disabled={!incident || status === 'loading'}>
            {status === 'loading' ? 'Calculating…' : 'Calculate dispatch'}
          </button>
          <button className="btn ghost" onClick={reset}>Reset demo</button>
        </div>

        {status === 'idle' && (
          <p className="msg">
            {incident ? 'Incident placed. Calculate dispatch to evaluate candidate routes.' : 'Click any road junction on the map to place an emergency incident.'}
          </p>
        )}
        {status === 'loading' && <p className="msg" role="status">Evaluating candidate routes with OpenMP…</p>}
        {status === 'empty' && <p className="msg warn" role="status">No ambulance has a route to that point. Move the incident closer to a road.</p>}
        {status === 'error' && <p className="msg err" role="alert">Error: {error}. Check that the routing API is running on port 4000.</p>}

        {status === 'done' && result && (
          <div className="result">
            <h3>Selected: {result.selected.id}</h3>
            <dl>
              <dt>Estimated travel time</dt><dd>{fmt(result.selected.eta)}</dd>
              <dt>Compute time (measured)</dt><dd>{result.executionMs != null ? `${result.executionMs.toFixed(2)} ms` : 'not reported'}</dd>
              {result.threads != null && (<><dt>OpenMP Threads</dt><dd>{result.threads}</dd></>)}
            </dl>
            <table>
              <caption>Candidates by estimated travel time</caption>
              <thead><tr><th scope="col">Ambulance</th><th scope="col">Estimate</th></tr></thead>
              <tbody>
                {[...result.candidates].sort((a, b) => a.eta - b.eta).map((c) => (
                  <tr key={c.id} className={c.id === result.selected.id ? 'sel' : ''}>
                    <td>{c.id}{c.id === result.selected.id ? ' (selected)' : ''}</td>
                    <td>{fmt(c.eta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="fine">Estimated travel time comes from static road-speed assumptions. It is not a measured response time.</p>
          </div>
        )}
        <p className="fine">Ambulance positions are simulated. No live GPS or live traffic is used.</p>
      </aside>
    </div>
  );
}
