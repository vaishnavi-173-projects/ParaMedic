import { useEffect, useState } from 'react';
import { API_BASE, GRAPH_FACTS } from '../config.js';
import { checkApi } from '../lib/api.js';

const API_TEXT = {
  'not-configured': ['Not connected', 'Set VITE_API_BASE to use the real routing engine. The demo uses an in-browser graph.'],
  reachable: ['Reachable', `Responded at ${API_BASE}/api/health.`],
  unreachable: ['Unreachable', `No response from ${API_BASE}. Is the Express bridge running?`],
  error: ['Error response', `${API_BASE}/api/health returned an error status.`],
  checking: ['Checking…', ''],
};

export default function Status() {
  const [api, setApi] = useState('checking');
  useEffect(() => { checkApi().then(setApi); }, []);
  const [apiLabel, apiNote] = API_TEXT[api];
  const rows = [
    ['Routing API', apiLabel, apiNote],
    ['Road graph', `${GRAPH_FACTS.nodes.toLocaleString()} nodes, ${GRAPH_FACTS.edges.toLocaleString()} directed edges`, `OpenStreetMap-derived, ${GRAPH_FACTS.area}. Figures as reported by the project.`],
    ['Ambulance positions', 'Simulated', 'There is no live ambulance GPS tracking.'],
    ['Road speeds', 'Static assumptions', 'There is no live traffic integration.'],
  ];
  return (
    <dl className="status">
      {rows.map(([k, v, n]) => (
        <div key={k}><dt>{k}</dt><dd><strong>{v}</strong><span>{n}</span></dd></div>
      ))}
    </dl>
  );
}
