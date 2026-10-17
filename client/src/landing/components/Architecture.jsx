import { useState } from 'react';

const NODES = [
  ['React + Leaflet frontend', 'Shows the road map, ambulance markers and the incident, and draws the selected route.'],
  ['Node.js / Express API bridge', 'Receives the dispatch request from the browser and passes it to the routing engine.'],
  ['C++17 routing engine', 'Holds the weighted road graph (OpenStreetMap-derived, Marathahalli–Bellandur) and runs the route calculations.'],
  ['Dijkstra + OpenMP candidate evaluation', 'One Dijkstra search per candidate ambulance, with the independent candidates evaluated concurrently. Edge weight is estimated travel time.'],
  ['Selected route + benchmark results', 'The lowest estimated travel time wins. Timing output feeds the performance lab.'],
];

export default function Architecture() {
  const [i, setI] = useState(3);
  return (
    <div className="arch">
      <ol className="flow">
        {NODES.map(([t], k) => (
          <li key={t}>
            <button aria-pressed={i === k} className={i === k ? 'on' : ''} onClick={() => setI(k)}>{t}</button>
          </li>
        ))}
      </ol>
      <div className="arch-detail" aria-live="polite">
        <h3>{NODES[i][0]}</h3>
        <p>{NODES[i][1]}</p>
      </div>
    </div>
  );
}
