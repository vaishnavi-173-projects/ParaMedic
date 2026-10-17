import { lazy, Suspense } from 'react';
import Nav from './components/Nav.jsx';
import ScrubStage from './components/ScrubStage.jsx';
import Architecture from './components/Architecture.jsx';
import Status from './components/Status.jsx';
import { goTo } from './lib/scroll.js';
import { useNearViewport } from './lib/hooks.js';
import { DASHBOARD_URL } from './config.js';
import './landing.css';

// Map and benchmark code load only when the visitor gets near them.
const Demo = lazy(() => import('./components/Demo.jsx'));
const Performance = lazy(() => import('./components/Performance.jsx'));

function Lazy({ children, minHeight }) {
  const [ref, near] = useNearViewport();
  return (
    <div ref={ref} style={{ minHeight }}>
      {near && <Suspense fallback={<p className="msg" role="status">Loading…</p>}>{children}</Suspense>}
    </div>
  );
}

export default function LandingPage({ onNavigateDashboard }) {
  const handleOpenDashboard = (e) => {
    if (onNavigateDashboard) {
      e.preventDefault();
      onNavigateDashboard();
    }
  };

  return (
    <div className="landing-root">
      <a className="skip" href="#demo" onClick={(e) => { e.preventDefault(); goTo('demo'); }}>
        Skip to live demo
      </a>
      <Nav onNavigateDashboard={onNavigateDashboard} />
      <main>
        <ScrubStage />

        <section id="architecture" className="block">
          <div className="wrap">
            <h2>How a request travels</h2>
            <p className="sub">Select a stage to see what it does.</p>
            <Architecture />
          </div>
        </section>

        <section id="demo" className="block alt">
          <div className="wrap">
            <h2>Try a dispatch</h2>
            <p className="sub">
              Place an incident on the map and see which simulated ambulance has the lowest estimated travel time evaluated via OpenMP.
            </p>
            <Lazy minHeight={620}>
              <Demo />
            </Lazy>
          </div>
        </section>

        <section id="perf" className="block">
          <div className="wrap">
            <h2>Parallelism you can measure.</h2>
            <p className="sub">Sequential versus OpenMP on matching workloads. Only measured results appear here.</p>
            <Lazy minHeight={300}>
              <Performance />
            </Lazy>
          </div>
        </section>

        <section id="status" className="block alt">
          <div className="wrap">
            <h2>What is real and what is simulated</h2>
            <Status />
          </div>
        </section>

        <section className="closing">
          <div className="wrap">
            <h2>Better dispatch begins with a better decision.</h2>
            <p>Explore the route. Understand the computation. See the result.</p>
            <div className="cta-row">
              <a className="btn primary" href={DASHBOARD_URL} onClick={handleOpenDashboard}>
                Open ParaMedic Dashboard
              </a>
              <button className="btn ghost" onClick={() => goTo('perf')}>
                Explore the performance lab
              </button>
            </div>
          </div>
        </section>
      </main>
      <footer className="foot">
        <div className="wrap">
          <strong>ParaMedic</strong>
          <span>
            Parallel ambulance dispatch and route optimization. C++17, OpenMP, Node.js, React, Leaflet. Map data © OpenStreetMap contributors.
          </span>
        </div>
      </footer>
    </div>
  );
}
