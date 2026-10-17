// Single place for integration points.
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {});

export const API_BASE = env.VITE_API_BASE ?? (env.VITE_API_BASE_URL ? env.VITE_API_BASE_URL.replace(/\/api\/?$/, '') : 'http://localhost:4000');
export const DASHBOARD_URL = env.VITE_DASHBOARD_URL || '/dashboard';
export const DISPATCH_ENDPOINT = '/api/dispatch';
export const BENCHMARK_URL = '/benchmarks.json';

// Real project facts (from the project brief). No live GPS or live traffic is claimed anywhere.
export const GRAPH_FACTS = { area: 'Marathahalli–Bellandur, Bengaluru', nodes: 7343, edges: 16614 };
export const MAP_CENTER = [12.956, 77.708];
