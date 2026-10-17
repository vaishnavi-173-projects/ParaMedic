import { useEffect, useState } from 'react';
import { goTo } from '../lib/scroll.js';
import { DASHBOARD_URL } from '../config.js';

const LINKS = [
  ['how', 'How it works', 'story'],
  ['demo', 'Live demo', 'demo'],
  ['perf', 'Performance', 'perf'],
  ['status', 'System status', 'status'],
];

export default function Nav({ onNavigateDashboard }) {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > window.innerHeight * 0.3);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const ids = ['story', 'architecture', 'demo', 'perf', 'status'];
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' }
    );
    ids.forEach((id) => document.getElementById(id) && io.observe(document.getElementById(id)));
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKey); io.disconnect(); };
  }, []);

  const go = (id) => (e) => { e.preventDefault(); setOpen(false); goTo(id); };

  const handleOpenApp = (e) => {
    if (onNavigateDashboard) {
      e.preventDefault();
      setOpen(false);
      onNavigateDashboard();
    }
  };

  return (
    <header className={`nav ${solid || open ? 'solid' : ''}`}>
      <a className="brand" href="#story" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
        <span className="mark" aria-hidden="true" />ParaMedic
      </a>
      <button className="burger" aria-expanded={open} aria-controls="nav-links" onClick={() => setOpen(!open)}>
        <span className="sr">{open ? 'Close menu' : 'Open menu'}</span>
        <i /><i /><i />
      </button>
      <nav id="nav-links" className={open ? 'open' : ''} aria-label="Primary">
        {LINKS.map(([id, label, sec]) => (
          <a key={id} href={`#${id}`} onClick={go(id)} aria-current={active === sec || (id === 'how' && active === 'architecture') ? 'true' : undefined}>
            {label}
          </a>
        ))}
        <a className="btn primary small" href={DASHBOARD_URL} onClick={handleOpenApp}>Open app</a>
      </nav>
    </header>
  );
}
