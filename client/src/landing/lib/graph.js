// In-browser DEMO road graph. This is NOT the OpenStreetMap graph from the routing engine.
// It is a small deterministic lattice laid over the Marathahalli–Bellandur area so the demo
// still works when no API is connected. Routes are real Dijkstra results on this lattice.
const ROWS = 16, COLS = 16;
const S = 12.9285, N = 12.9585, W = 77.672, E = 77.708;

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function buildDemoGraph() {
  const r = rng(42);
  const nodes = [];
  for (let i = 0; i < ROWS; i++)
    for (let j = 0; j < COLS; j++)
      nodes.push([S + ((N - S) * i) / (ROWS - 1) + (r() - 0.5) * 0.0009, W + ((E - W) * j) / (COLS - 1) + (r() - 0.5) * 0.0009]);
  const adj = nodes.map(() => []);
  const id = (i, j) => i * COLS + j;
  const hav = (a, b) => {
    const R = 6371000, p = Math.PI / 180;
    const dLat = (b[0] - a[0]) * p, dLng = (b[1] - a[1]) * p;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * p) * Math.cos(b[0] * p) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  const link = (a, b) => {
    if (r() < 0.12) return; // some missing streets so routes are not trivially straight
    const arterial = r() < 0.25;
    const speed = (arterial ? 38 : 20) / 3.6; // assumed static speeds, m/s
    const t = hav(nodes[a], nodes[b]) / speed;
    adj[a].push([b, t]);
    adj[b].push([a, t]);
  };
  for (let i = 0; i < ROWS; i++)
    for (let j = 0; j < COLS; j++) {
      if (j + 1 < COLS) link(id(i, j), id(i, j + 1));
      if (i + 1 < ROWS) link(id(i, j), id(i + 1, j));
    }
  return { nodes, adj };
}

export function nearestNode(g, [lat, lng]) {
  let best = 0, bd = Infinity;
  g.nodes.forEach((n, i) => {
    const d = (n[0] - lat) ** 2 + (n[1] - lng) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// Plain Dijkstra with a binary heap. Weights are estimated travel time in seconds.
export function dijkstra(g, src, dst) {
  const dist = new Float64Array(g.nodes.length).fill(Infinity);
  const prev = new Int32Array(g.nodes.length).fill(-1);
  const heap = [[0, src]];
  dist[src] = 0;
  const push = (x) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        let l = 2 * i + 1, rr = l + 1, m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (rr < heap.length && heap[rr][0] < heap[m][0]) m = rr;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    if (u === dst) break;
    for (const [v, w] of g.adj[u]) {
      if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; push([dist[v], v]); }
    }
  }
  if (!Number.isFinite(dist[dst])) return null;
  const path = [];
  for (let n = dst; n !== -1; n = prev[n]) path.push(g.nodes[n]);
  return { seconds: dist[dst], path: path.reverse() };
}
