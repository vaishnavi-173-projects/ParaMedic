import { useEffect, useRef, useState } from 'react';

export function useReducedMotion() {
  const [r, setR] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setR(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return r;
}

export function useIsNarrow(px = 760) {
  const [n, setN] = useState(() => window.innerWidth < px);
  useEffect(() => {
    const f = () => setN(window.innerWidth < px);
    window.addEventListener('resize', f, { passive: true });
    return () => window.removeEventListener('resize', f);
  }, [px]);
  return n;
}

// Fires once when the element nears the viewport (used to lazy-mount heavy sections).
export function useNearViewport(margin = '400px') {
  const ref = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near];
}
