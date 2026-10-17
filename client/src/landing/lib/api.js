import { API_BASE, DISPATCH_ENDPOINT, BENCHMARK_URL } from '../config.js';
import { dijkstra, nearestNode } from './graph.js';

export const apiConfigured = Boolean(API_BASE);

/*
 * INTEGRATION POINT — real routing engine adapter.
 *
 * Handles both the backend's native schema and the demo format.
 */
export function normalise(raw) {
  if (!raw) return { empty: true };

  // Real backend response format
  if (raw.best_ambulance) {
    const cands = raw.candidates || [];
    const sel = cands.find((c) => c.ambulance_id === raw.best_ambulance);
    if (!sel || !sel.reachable) return { empty: true };

    return {
      empty: false,
      selected: {
        id: sel.ambulance_id,
        eta: sel.travel_time_s,
        path: sel.routeCoordinates || [],
      },
      candidates: cands
        .filter((c) => c.reachable)
        .map((c) => ({
          id: c.ambulance_id,
          eta: c.travel_time_s,
          path: c.routeCoordinates || [],
        })),
      executionMs: raw.elapsed_ms != null ? raw.elapsed_ms : null,
      threads: raw.threads != null ? raw.threads : null,
      source: 'api',
    };
  }

  // Fallback / legacy demo format
  const sel = raw.selected || raw.best || raw.selectedAmbulance;
  if (!sel) return { empty: true };
  const eta = (c) => c.etaSeconds ?? c.estimatedTimeSeconds ?? (c.estimatedMinutes != null ? c.estimatedMinutes * 60 : c.eta ?? null);
  const path = (c) => c.path || c.route || c.geometry || [];
  return {
    empty: false,
    selected: { id: sel.id, eta: eta(sel), path: path(sel) },
    candidates: (raw.candidates || [sel]).map((c) => ({ id: c.id, eta: eta(c), path: path(c) })),
    executionMs: raw.executionMs ?? raw.timeMs ?? null,
    threads: raw.threads ?? null,
    source: 'api',
  };
}

export async function dispatchViaApi(payload, signal) {
  const body = {
    lat: payload.incident?.lat,
    lon: payload.incident?.lng ?? payload.incident?.lon,
    mode: payload.mode || 'parallel',
    threads: payload.threads || (payload.mode === 'sequential' ? 1 : 4),
    ambulances: payload.ambulances,
  };

  const res = await fetch(`${API_BASE}${DISPATCH_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Routing API responded ${res.status}`);
  return normalise(await res.json());
}

export function dispatchDemo(graph, incident, ambulances) {
  const t0 = performance.now();
  const dst = nearestNode(graph, [incident.lat, incident.lng]);
  const candidates = ambulances
    .map((a) => {
      const r = dijkstra(graph, nearestNode(graph, [a.lat, a.lng]), dst);
      return r ? { id: a.id, eta: r.seconds, path: r.path } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.eta - b.eta);
  if (!candidates.length) return { empty: true };
  return { empty: false, selected: candidates[0], candidates, executionMs: performance.now() - t0, threads: 1, source: 'demo' };
}

export async function checkApi() {
  if (!apiConfigured) return 'not-configured';
  try {
    const r = await fetch(`${API_BASE}/api/health`, { method: 'GET' });
    return r.ok ? 'reachable' : 'error';
  } catch {
    return 'unreachable';
  }
}

export async function fetchAmbulances() {
  if (!apiConfigured) return null;
  try {
    const r = await fetch(`${API_BASE}/api/ambulances`, { method: 'GET' });
    if (!r.ok) return null;
    const data = await r.json();
    return data.ambulances || null;
  } catch {
    return null;
  }
}

export async function loadBenchmarks() {
  const r = await fetch(BENCHMARK_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error('missing');
  const j = await r.json();
  const rows = Array.isArray(j) ? j : j.runs || j.benchmarks;
  if (!Array.isArray(rows) || !rows.length) throw new Error('empty');
  return rows;
}
