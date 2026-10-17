import { useEffect, useRef } from 'react';
import { useIsNarrow, useReducedMotion } from '../lib/hooks.js';
import { goTo } from '../lib/scroll.js';

const STEPS = [
  ['Identify', 'Locate the incident and list the available ambulances.'],
  ['Calculate', 'Build candidate routes on the weighted road graph (edge weight = estimated travel time).'],
  ['Evaluate in parallel', 'Each candidate route calculation is independent, so OpenMP runs them concurrently.'],
  ['Compare', 'Rank candidates by estimated travel time.'],
  ['Present', 'Return the selected ambulance and its route to the map.'],
];

// [fadeInStart, fullIn, fullOut, fadeOutEnd] on 0..1 scroll progress
const WINDOWS = {
  hero: [-1, -1, 0.14, 0.2],
  problem: [0.2, 0.26, 0.4, 0.46],
  how: [0.46, 0.5, 0.87, 0.92],
  handoff: [0.92, 0.96, 1.1, 1.2],
};

const win = (p, [a, b, c, d]) => (p < a ? 0 : p < b ? (p - a) / (b - a) : p <= c ? 1 : p < d ? 1 - (p - c) / (d - c) : 0);

export default function ScrubStage() {
  const reduce = useReducedMotion();
  const narrow = useIsNarrow();
  const scrub = !reduce && !narrow;

  const root = useRef(null);
  const video = useRef(null);
  const chapters = useRef({});
  const stepEls = useRef([]);
  const bar = useRef(null);

  // Scroll-scrubbed playback: one rAF loop, no React re-renders while scrolling.
  useEffect(() => {
    const v = video.current;
    const el = root.current;
    if (!v || !el) return;
    v.muted = true;

    if (!scrub) {
      v.loop = true;
      if (!reduce) v.play().catch(() => {}); // autoplay can be refused; the poster stays visible
      return () => v.pause();
    }

    v.pause();
    let raf = 0;
    let visible = true;
    let current = 0;
    let lastSeek = 0;
    let seeking = false;
    const onSeeked = () => (seeking = false);
    v.addEventListener('seeked', onSeeked);

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const range = el.offsetHeight - window.innerHeight;
      const rect = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, range)));

      const dur = v.duration;
      if (Number.isFinite(dur) && dur > 0) {
        const target = p * dur;
        current += (target - current) * 0.2; // ease toward target so wheel steps don't look jumpy
        if (Math.abs(target - current) < 0.01) current = target;
        // throttle: never queue a new seek while one is in flight, and cap to ~30/s
        if (!seeking && now - lastSeek > 33 && Math.abs(v.currentTime - current) > 0.02) {
          seeking = true;
          lastSeek = now;
          try { v.currentTime = current; } catch { seeking = false; }
        }
      }

      for (const [k, node] of Object.entries(chapters.current)) {
        if (!node) continue;
        const o = win(p, WINDOWS[k]);
        node.style.opacity = o;
        node.style.transform = `translateY(${(1 - o) * 14}px)`;
        node.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      }
      const active = Math.min(STEPS.length - 1, Math.max(0, Math.floor(((p - 0.5) / 0.38) * STEPS.length)));
      stepEls.current.forEach((s, i) => s && s.classList.toggle('on', p >= 0.5 && i <= active));
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      v.removeEventListener('seeked', onSeeked);
    };
  }, [scrub, reduce]);

  const setCh = (k) => (n) => (chapters.current[k] = n);
  const mobileSrc = narrow ? '/media/BG-scrub-mobile.mp4' : '/media/BG-scrub.mp4';

  return (
    <section id="story" ref={root} className={`story ${scrub ? 'scrub' : 'static'}`} data-mode={scrub ? 'scrub' : 'static'} aria-label="ParaMedic story">
      <div className="pin">
        <div className="vid">
          <video
            ref={video}
            key={mobileSrc}
            src={mobileSrc}
            poster="/media/poster.jpg"
            muted
            playsInline
            preload={scrub ? 'auto' : 'metadata'}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div className="shade" />
          <div className="vignette" />
        </div>
        {scrub && <div className="progress" aria-hidden="true"><i ref={bar} /></div>}

        <div className="chapter hero" ref={setCh('hero')}>
          <p className="kicker">Parallel ambulance dispatch</p>
          <h1>Every Second Has a Route.</h1>
          <p className="lede">
            Parallel intelligence for smarter ambulance dispatch. Evaluate candidate routes, compare estimated travel times and make a more informed dispatch decision.
          </p>
          <div className="cta-row">
            <button className="btn primary" onClick={() => goTo('demo')}>Explore ParaMedic</button>
            <button className="btn ghost" onClick={() => goTo('how')}>See how it works</button>
          </div>
          <span className="scroll-cue" aria-hidden="true">Scroll</span>
        </div>

        <div className="chapter problem" ref={setCh('problem')}>
          <h2>When an emergency happens, every decision matters.</h2>
          <p>
            A road incident is reported. Several ambulances are available, each at a different place on a different road. Picking one by straight-line distance ignores how the road network is actually connected. The useful question is which ambulance has the lowest estimated travel time along real roads.
          </p>
        </div>

        <div className="chapter how" ref={setCh('how')}>
          <h2>Evaluate routes. Compare candidates. Select intelligently.</h2>
          <ol className="steps">
            {STEPS.map(([t, d], i) => (
              <li key={t} ref={(n) => (stepEls.current[i] = n)}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ol>
          <p className="note">Parallelism is across candidate ambulances. Each Dijkstra run is a normal single-threaded search.</p>
        </div>

        <div className="chapter handoff" ref={setCh('handoff')}>
          <p>Now run it on the road map.</p>
        </div>
      </div>

      {!scrub && (
        <div className="static-copy">
          <div className="wrap">
            <h2>When an emergency happens, every decision matters.</h2>
            <p>A road incident is reported. Several ambulances are available. The useful question is which one has the lowest estimated travel time along real roads, not which one is closest on a straight line.</p>
            <h2 id="how-static">Evaluate routes. Compare candidates. Select intelligently.</h2>
            <ol className="steps">
              {STEPS.map(([t, d]) => (
                <li key={t} className="on"><strong>{t}</strong><span>{d}</span></li>
              ))}
            </ol>
            <p className="note">Parallelism is across candidate ambulances. Each Dijkstra run is a normal single-threaded search.</p>
          </div>
        </div>
      )}
    </section>
  );
}
