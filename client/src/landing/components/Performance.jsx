import { useEffect, useState } from 'react';
import { loadBenchmarks } from '../lib/api.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export default function Performance() {
  const [rows, setRows] = useState(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    loadBenchmarks().then((r) => { setRows(r); setState('ok'); }).catch(() => setState('empty'));
  }, []);

  if (state === 'loading') return <p className="msg" role="status">Loading benchmark results…</p>;

  if (state === 'empty')
    return (
      <div className="empty">
        <h3>No benchmark data connected</h3>
        <p>This section only shows measured results. Export your benchmark output and save it as <code>public/benchmarks.json</code>:</p>
        <pre>{`[
  { "label": "100 candidates", "candidates": 100, "threads": 8,
    "sequentialMs": <measured>, "parallelMs": <measured> }
]`}</pre>
        <p>Speedup is calculated here as sequentialMs ÷ parallelMs. Rows must come from the same workload. See <code>README.md</code>.</p>
      </div>
    );

  const valid = rows
    .map((r, i) => ({ ...r, seq: num(r.sequentialMs), par: num(r.parallelMs), i }))
    .filter((r) => r.seq && r.par);
  if (!valid.length)
    return <p className="msg err" role="alert">benchmarks.json was found, but no row has numeric sequentialMs and parallelMs.</p>;
  const max = Math.max(...valid.map((r) => Math.max(r.seq, r.par)));

  return (
    <div className="perf">
      <figure>
        <figcaption>Execution time per workload (lower is better)</figcaption>
        <div className="bars" role="img" aria-label="Bar chart comparing sequential and parallel execution time for each workload">
          {valid.map((r) => (
            <div key={r.i} className="grp">
              <div className="pair">
                <span className="bar seq" style={{ height: `${(r.seq / max) * 100}%` }} title={`Sequential ${r.seq} ms`} />
                <span className="bar par" style={{ height: `${(r.par / max) * 100}%` }} title={`Parallel ${r.par} ms`} />
              </div>
              <span className="lbl">{r.label || `Run ${r.i + 1}`}</span>
            </div>
          ))}
        </div>
        <div className="legend"><span><i className="seq" />Sequential</span><span><i className="par" />Parallel (OpenMP)</span></div>
      </figure>
      <table>
        <thead>
          <tr><th scope="col">Workload</th><th scope="col">Candidates</th><th scope="col">Threads</th><th scope="col">Sequential</th><th scope="col">Parallel</th><th scope="col">Speedup</th></tr>
        </thead>
        <tbody>
          {valid.map((r) => (
            <tr key={r.i}>
              <th scope="row">{r.label || `Run ${r.i + 1}`}</th>
              <td>{r.candidates ?? '—'}</td>
              <td>{r.threads ?? '—'}</td>
              <td>{r.seq} ms</td>
              <td>{r.par} ms</td>
              <td className="hl">{(r.seq / r.par).toFixed(2)}×</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
