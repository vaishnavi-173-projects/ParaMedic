// Progress points inside the pinned story where each chapter starts.
export const HOW_AT = 0.47;

export function goTo(id) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduce ? 'auto' : 'smooth';
  let top;
  const story = document.getElementById('story');
  if (id === 'how' && story && story.dataset.mode === 'scrub') {
    const range = story.offsetHeight - window.innerHeight;
    top = story.offsetTop + range * HOW_AT;
  } else {
    const el = document.getElementById(id === 'how' ? 'story' : id);
    if (!el) return;
    top = el.getBoundingClientRect().top + window.scrollY - (id === 'how' ? 0 : 56);
  }
  window.scrollTo({ top, behavior });
  history.replaceState(null, '', `#${id}`);
}
