import type { ResourceId } from '../data/resources';

/** Inline SVG icons (no external assets). */

const svg = (body: string, view = '0 0 24 24') =>
  `<svg viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`;

export const RESOURCE_ICONS: Record<ResourceId, string> = {
  regolith: svg('<path d="M3 18l4-7 3 4 3-6 8 9z" fill="currentColor"/><circle cx="7" cy="7" r="1.5" fill="currentColor" opacity=".6"/>'),
  iron: svg('<path d="M4 15l4-6h12l-4 6z" fill="currentColor"/><path d="M4 15h12v3H4z" fill="currentColor" opacity=".65"/><path d="M16 15l4-6v3l-4 6z" fill="currentColor" opacity=".45"/>'),
  water: svg('<path d="M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11z" fill="currentColor"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" stroke="#fff" stroke-width="1.4" fill="none" opacity=".7" stroke-linecap="round"/>'),
  oxygen: svg('<circle cx="9" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16.5" r="1.6" fill="currentColor"/>'),
  food: svg('<path d="M12 7c-4-3-9 0-8 5 .7 4 4 8 8 8s7.3-4 8-8c1-5-4-8-8-5z" fill="currentColor"/><path d="M12 7c0-2 1-3.5 3-4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
};

export const ICONS = {
  energy: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>'),
  play: svg('<path d="M7 5l12 7-12 7z" fill="currentColor"/>'),
  build: svg('<path d="M3 21h18M5 21V10l7-5 7 5v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 21v-6h4v6" fill="none" stroke="currentColor" stroke-width="2"/>'),
  explore: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor"/>'),
  missions: svg('<path d="M5 19l3-9 4 4 4-10 3 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="5" cy="19" r="2" fill="currentColor"/>'),
  research: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M7.5 15h9" stroke="currentColor" stroke-width="2"/>'),
  settlement: svg('<path d="M3 20h18" stroke="currentColor" stroke-width="2"/><path d="M5 20a5 5 0 0 1 10 0" fill="currentColor"/><rect x="15" y="12" width="5" height="8" rx="1" fill="currentColor" opacity=".7"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  minus: svg('<path d="M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  home: svg('<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="currentColor"/>'),
  globe: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  target: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  people: svg('<circle cx="9" cy="8" r="3.2" fill="currentColor"/><circle cx="17" cy="9" r="2.5" fill="currentColor" opacity=".7"/><path d="M3 20a6 6 0 0 1 12 0zM14 20a5 5 0 0 1 8 0z" fill="currentColor"/>'),
  rover: svg('<rect x="4" y="8" width="14" height="6" rx="1.5" fill="currentColor"/><circle cx="7" cy="17" r="2.2" fill="currentColor"/><circle cx="15" cy="17" r="2.2" fill="currentColor"/><path d="M16 8V4h3" stroke="currentColor" stroke-width="1.8" fill="none"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="8" y="3" width="7" height="5" fill="currentColor"/><rect x="8" y="13" width="8" height="5" rx="1" fill="currentColor" opacity=".6"/>'),
  load: svg('<path d="M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 4v11m-5-5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
};
