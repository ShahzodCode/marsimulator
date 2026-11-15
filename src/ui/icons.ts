import type { BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import type { BranchId, StageDefinition, TechId } from '../data/research';

/** Inline SVG icons (no external assets). */

const svg = (body: string, view = '0 0 24 24') =>
  `<svg viewBox="${view}" aria-hidden="true" focusable="false">${body}</svg>`;

export const RESOURCE_ICONS: Record<ResourceId, string> = {
  regolith: svg('<path d="M3 18l4-7 3 4 3-6 8 9z" fill="currentColor"/><circle cx="7" cy="7" r="1.5" fill="currentColor" opacity=".6"/>'),
  iron: svg('<path d="M4 15l4-6h12l-4 6z" fill="currentColor"/><path d="M4 15h12v3H4z" fill="currentColor" opacity=".65"/><path d="M16 15l4-6v3l-4 6z" fill="currentColor" opacity=".45"/>'),
  water: svg('<path d="M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11z" fill="currentColor"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" stroke="#fff" stroke-width="1.4" fill="none" opacity=".7" stroke-linecap="round"/>'),
  oxygen: svg('<circle cx="9" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="16.5" r="1.6" fill="currentColor"/>'),
  food: svg('<path d="M12 7c-4-3-9 0-8 5 .7 4 4 8 8 8s7.3-4 8-8c1-5-4-8-8-5z" fill="currentColor"/><path d="M12 7c0-2 1-3.5 3-4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'),
  hydrogen: svg('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8v8M15 8v8M9 12h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
};

const HUD_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

/**
 * Line-art glyphs for the top resource bar: one weight, one ink colour, so the
 * bar reads as a single quiet strip rather than a row of coloured badges.
 */
export const HUD_ICONS: Record<ResourceId | 'energy' | 'crew', string> = {
  // Boulder with a fracture line and a pebble.
  regolith: svg(`<g ${HUD_STROKE}><path d="M3.5 18.5l2.2-7 4.6-3.8 5.4 1.6 3.3 4.9-.9 4.3z"/><path d="M10.3 7.7l1.4 4.6-3.2 2.4M11.7 12.3l4.1 1"/><circle cx="20" cy="6" r="1.2"/></g>`),
  // A stacked pair of ingots.
  iron: svg(`<g ${HUD_STROKE}><path d="M3 19l2-4h9l2 4z"/><path d="M8 15l2-4h9l2 4-2 4"/></g>`),
  // Droplet with a ripple inside.
  water: svg(`<g ${HUD_STROKE}><path d="M12 3c3.8 4.7 6.2 8.1 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 11.1 8.2 7.7 12 3z"/><path d="M8.8 15.2c1-.8 2.1-.8 3.2 0s2.2.8 3.2 0"/></g>`),
  // A rising stream of bubbles (O₂).
  oxygen: svg(`<g ${HUD_STROKE}><circle cx="9" cy="15" r="5"/><circle cx="17" cy="8.5" r="2.8"/><circle cx="19" cy="15.5" r="1.2"/><path d="M7 14.3a2 2 0 0 1 2-1.9"/></g>`),
  // A two-leaf sprout growing from soil.
  food: svg(`<g ${HUD_STROKE}><path d="M4 20h16"/><path d="M12 20v-8"/><path d="M12 12C12 8 9.5 6 5.5 6c0 4 2.5 6 6.5 6z"/><path d="M12 13.5c0-3.3 2.2-5.5 6.5-5.5 0 3.6-2.4 5.5-6.5 5.5z"/></g>`),
  // An atom: nucleus and two orbits.
  hydrogen: svg(`<g ${HUD_STROKE}><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></g>`),
  // A lightning bolt inside a ring, like a power gauge.
  energy: svg(`<g ${HUD_STROKE}><circle cx="12" cy="12" r="9"/><path d="M13 6.5l-4.2 6.2h3.6l-1.4 4.8 4.2-6.2h-3.6z"/></g>`),
  // An astronaut helmet with visor.
  crew: svg(`<g ${HUD_STROKE}><path d="M5 17.5V12a7 7 0 0 1 14 0v5.5"/><path d="M3.5 20.5h17l-1.5-3h-14z"/><path d="M8 12.5a4 3 0 0 1 8 0v1a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 13.5z"/></g>`),
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
  search: svg('<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  back: svg('<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  trophy: svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 14h4v3h3v3H7v-3h3z" fill="currentColor"/>'),
  target: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="2"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  people: svg('<circle cx="9" cy="8" r="3.2" fill="currentColor"/><circle cx="17" cy="9" r="2.5" fill="currentColor" opacity=".7"/><path d="M3 20a6 6 0 0 1 12 0zM14 20a5 5 0 0 1 8 0z" fill="currentColor"/>'),
  satellite: svg('<rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/><rect x="2" y="10" width="6" height="4" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="16" y="10" width="6" height="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 15v3m-3 2a3 3 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  rover: svg('<rect x="4" y="8" width="14" height="6" rx="1.5" fill="currentColor"/><circle cx="7" cy="17" r="2.2" fill="currentColor"/><circle cx="15" cy="17" r="2.2" fill="currentColor"/><path d="M16 8V4h3" stroke="currentColor" stroke-width="1.8" fill="none"/>'),
  save: svg('<path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="8" y="3" width="7" height="5" fill="currentColor"/><rect x="8" y="13" width="8" height="5" rx="1" fill="currentColor" opacity=".6"/>'),
  user: svg('<circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21a8 8 0 0 1 16 0z" fill="currentColor"/>'),
  load: svg('<path d="M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 4v11m-5-5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
};

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** Building icons from the mars-assets-v2 pack (assets/mars-assets-v2/icons, CC0). */
export const BUILDING_ICONS: Record<BuildingType, string> = {
  habitat: svg(`<g ${STROKE}><path d="M3 19a9 9 0 0 1 18 0z" fill="currentColor" fill-opacity=".3"/><path d="M10 19v-4a2 2 0 0 1 4 0v4M2 19h20M12 4v3"/><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none"/></g>`),
  solar_farm: svg(`<g ${STROKE}><path d="M3 17l3-8h12l3 8z" fill="currentColor" fill-opacity=".3"/><path d="M12 9v8M4.5 13h15M12 17v4M8 21h8"/><circle cx="19" cy="4" r="2" fill="currentColor" stroke="none"/></g>`),
  life_support: svg(`<g ${STROKE}><path d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 8 2.3C20 15.4 12 20 12 20z" fill="currentColor" fill-opacity=".3"/><path d="M6 12h3l1.5-3 2.5 6 1.5-3h3.5"/></g>`),
  greenhouse: svg(`<g ${STROKE}><path d="M3 20v-8l9-7 9 7v8z" fill="currentColor" fill-opacity=".3"/><path d="M12 20v-6M12 16c-3 0-4-1.5-4-4 3 0 4 1.5 4 4zM12 14c0-2 1-3.5 4-3.5 0 2.5-1.5 3.5-4 3.5"/></g>`),
  regolith_excavator: svg(`<g ${STROKE}><circle cx="8" cy="10" r="4" fill="currentColor" fill-opacity=".3"/><path d="M8 4v2M8 14v2M2 10h2M12 10h2M11 12l8 6M2 20h20"/><path d="M14 20l3-4 3 4z" fill="currentColor" stroke="none"/></g>`),
  iron_refinery: svg(`<g ${STROKE}><path d="M5 20V9l3-5h8l3 5v11z" fill="currentColor" fill-opacity=".3"/><path d="M9 20v-5h6v5M9 9h6M2 20h20"/><path d="M10.5 12h3"/></g>`),
  ice_drill: svg(`<g ${STROKE}><path d="M8 3h8v5H8z" fill="currentColor" fill-opacity=".3"/><path d="M12 8v6M9.5 10.5l5 2M9.5 13l5 2M12 15v3M2 18h20"/><path d="M12 19.5l1.7 2.2a1.9 1.9 0 1 1-3.4 0z" fill="currentColor" stroke="none"/></g>`),
  storage_depot: svg(`<g ${STROKE}><path d="M3 20V11a9 6 0 0 1 18 0v9z" fill="currentColor" fill-opacity=".3"/><path d="M8 20v-6h8v6M8 17h8M2 20h20"/></g>`),
  battery_bank: svg(`<g ${STROKE}><path d="M4 7h16v13H4z" fill="currentColor" fill-opacity=".3"/><path d="M8 7V4M16 7V4"/><path d="M13 9l-4 5h3l-1 4 4-5h-3z" fill="currentColor" stroke="none"/></g>`),
  moxie_unit: svg(`<g ${STROKE}><path d="M3 9h12v11H3z" fill="currentColor" fill-opacity=".3"/><circle cx="9" cy="14.5" r="3"/><path d="M9 11.5v6M6 14.5h6"/><circle cx="19" cy="6" r="2.5"/><circle cx="19.5" cy="13" r="1.5" fill="currentColor" stroke="none"/></g>`),
  storage_silo: svg(`<g ${STROKE}><path d="M4 20V8l4-4 4 4v12z" fill="currentColor" fill-opacity=".3"/><path d="M4 12h8M4 16h8M2 20h20"/><circle cx="17.5" cy="15.5" r="3.5"/></g>`),
  research_lab: svg(`<g ${STROKE}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" fill="currentColor" fill-opacity=".3"/><path d="M7 15h10"/></g>`),
  fission_reactor: svg(`<g ${STROKE}><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 10V4a8 8 0 0 0-7 4zM13.7 13l5.2 3a8 8 0 0 0 0-8.1zM10.3 13l-5.2 3a8 8 0 0 0 7 4z" fill="currentColor" fill-opacity=".35"/></g>`),
  megadigger: svg(`<g ${STROKE}><circle cx="7" cy="9" r="5" fill="currentColor" fill-opacity=".3"/><path d="M7 4v10M2 9h10M10.5 12.5l7.5 3.5M13 20h9v-4h-6z"/></g>`),
  strip_mine: svg(`<g ${STROKE}><path d="M2 8h20l-3 4H5zM5 12l2 4h10l2-4M7 16l2 4h6l2-4" fill="currentColor" fill-opacity=".3"/></g>`),
  glacier_mine: svg(`<g ${STROKE}><path d="M2 20l6-11 3 4 4-8 7 15z" fill="currentColor" fill-opacity=".3"/><path d="M12 13v7M10 18l2 2 2-2"/></g>`),
  deep_aquifer_drill: svg(`<g ${STROKE}><path d="M9 2h6l-1 8h-4z" fill="currentColor" fill-opacity=".3"/><path d="M12 10v8M2 14h20"/><path d="M12 18.5l2 2.5a2.4 2.4 0 1 1-4 0z" fill="currentColor" stroke="none"/></g>`),
  big_dome: svg(`<g ${STROKE}><path d="M2 20a10 10 0 0 1 20 0z" fill="currentColor" fill-opacity=".3"/><path d="M7 20a5 7 0 0 1 10 0M12 10v10M1 20h22"/></g>`),
  lava_habitat: svg(`<g ${STROKE}><path d="M2 20c0-7 4-12 10-12s10 5 10 12z" fill="currentColor" fill-opacity=".3"/><path d="M8 20v-5a4 4 0 0 1 8 0v5"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/></g>`),
  pump_station: svg(`<g ${STROKE}><path d="M3 8h7v12H3z" fill="currentColor" fill-opacity=".3"/><path d="M10 12h11M10 16h11M14 12v8M19 12v8M2 20h20"/><circle cx="6.5" cy="5" r="2"/></g>`),
  cargo_garage: svg(`<g ${STROKE}><path d="M2 20V11a10 7 0 0 1 20 0v9z" fill="currentColor" fill-opacity=".3"/><path d="M7 20v-5h10v5"/><circle cx="9" cy="19" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.2" fill="currentColor" stroke="none"/></g>`),
};

const LINE = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
const line = (body: string) => svg(`<g ${LINE}>${body}</g>`);
/** Soft fill for the main shape of a line icon. */
const TINT = 'fill="currentColor" fill-opacity=".22"';

/** Research branches: one line glyph each (data/research.ts BRANCHES). */
export const BRANCH_ICONS: Record<BranchId, string> = {
  // A planet with an orbit and a satellite riding it.
  orbit: line(`<circle cx="12" cy="12" r="4.5" ${TINT}/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-24 12 12)"/><circle cx="20.2" cy="8.2" r="1.3" fill="currentColor"/>`),
  // Droplet with a shine.
  water: line(`<path d="M12 3c3.8 4.7 6.2 8.1 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 11.1 8.2 7.7 12 3z" ${TINT}/><path d="M9.2 14.6a2.8 2.8 0 0 0 2.4 2.6"/>`),
  // Pickaxe.
  mining: line(`<path d="M4.5 9.5C8 5.5 14.5 4.6 19.5 7" ${TINT}/><path d="M12.6 6.6L5 20.5"/><path d="M4.5 9.5l1.4-2.6M19.5 7l-2.9-.2"/>`),
  // Lightning bolt.
  energy: line(`<path d="M13.5 2.5L5 13.5h6l-1.2 8 8.7-11.2h-6z" ${TINT}/>`),
  // Sprout with two leaves.
  life: line(`<path d="M12 21v-9"/><path d="M12 12C12 7.5 9.3 5 4.5 5c0 4.6 2.8 7 7.5 7z" ${TINT}/><path d="M12 14.5c0-3.8 2.5-6.2 7.5-6.2 0 4.1-2.7 6.2-7.5 6.2z" ${TINT}/>`),
  // Pressurised rover.
  transport: line(`<path d="M3 15V10.5A3.5 3.5 0 0 1 6.5 7H15l4 4h1.5a.5.5 0 0 1 .5.5V15z" ${TINT}/><path d="M7 7V5M14 10h4"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>`),
};

/** One glyph per technology, so the tree reads at a glance without emoji. */
export const TECH_ICONS: Record<TechId, string> = {
  // Orbiter beaming radar waves down into the ground.
  orbiter_mk2: line(`<rect x="9.5" y="3" width="5" height="4" rx="1" ${TINT}/><path d="M3 5h5M16 5h5M12 7v2"/><path d="M7 13a7 4 0 0 0 10 0M5 16.5a9 5 0 0 0 14 0M3.5 20a11 6 0 0 0 17 0"/>`),
  // A planet cut open, layers showing, with a probe line to the core.
  orbiter_mk3: line(`<circle cx="12" cy="12" r="9" ${TINT}/><path d="M12 3a9 9 0 0 1 9 9h-9z" fill="currentColor" fill-opacity=".55"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>`),
  // A twist drill bit biting into ice.
  better_drills: line(`<path d="M9 3h6v4H9z" ${TINT}/><path d="M12 7v1.5M9.5 9.5l5 2-5 2 5 2-2.5 1L12 21l-1.5-4.5"/><path d="M3 19l2-1.5M21 19l-2-1.5M4 14.5l1.8.3M20 14.5l-1.8.3"/>`),
  // Ice-capped mountain with a melt well.
  glacier_mine: line(`<path d="M2 20l6.5-12 3.5 5 3-4 7 11z" ${TINT}/><path d="M6.5 11.7l2 1.5 1.8-2.2 1.7 2M12 13v7M10 18l2 2 2-2"/>`),
  // Drill string down to a deep water layer.
  deep_aquifer: line(`<path d="M9 2.5h6l-1 4h-4z" ${TINT}/><path d="M12 6.5V16M3 10h18"/><path d="M3 18.5c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0" /><path d="M3 21.5c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0 3-1.2 4.5 0 3 1.2 4.5 0"/>`),
  // A little brick wall.
  regolith_bricks: line(`<path d="M3 6h18v13H3z" ${TINT}/><path d="M3 10.3h18M3 14.6h18M9 6v4.3M15 6v4.3M6 10.3v4.3M12 10.3v4.3M18 10.3v4.3M9 14.6V19M15 14.6V19"/>`),
  // Bucket wheel with scoops.
  megadigger: line(`<circle cx="11" cy="11" r="6" ${TINT}/><circle cx="11" cy="11" r="1.5"/><path d="M11 5v4.5M11 12.5V17M5 11h4.5M12.5 11H17"/><path d="M8.5 3.3l5 0-1 2h-3zM8.5 18.7h5l-1-2h-3zM3.3 8.5v5l2-1v-3zM16.5 15l4.5 5.5"/>`),
  // Stepped open pit.
  strip_mine: line(`<path d="M2 7h20l-3 4.5H5z" ${TINT}/><path d="M5 11.5l2.2 4h9.6l2.2-4M7.2 15.5L9 19.5h6l1.8-4"/><circle cx="12" cy="17.6" r=".9" fill="currentColor"/>`),
  // Solar panel with a wiper sweeping dust off.
  dust_cleaning: line(`<path d="M3 17l3-9h12l3 9z" ${TINT}/><path d="M12 8v9M4.5 12.5h15M12 17v3.5M9 20.5h6"/><path d="M15 4.5l2.5-2M18.5 5l2.5-.5M16.5 7l1.5 1.2" /><circle cx="6" cy="4" r="1" fill="currentColor"/>`),
  // Atom.
  fission: line(`<ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(90 12 12)"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`),
  // Leafy plant under an LED bar, with water drops at the roots.
  hydroponics: line(`<path d="M4 3.5h16"/><path d="M7 5.5v1M12 5.5v1M17 5.5v1" opacity=".7"/><path d="M12 19v-6M12 13c-3.5 0-5.5-1.8-5.5-4.5 3.5 0 5.5 1.8 5.5 4.5zM12 15c0-3 2-4.8 5.5-4.8 0 3-2 4.8-5.5 4.8z" ${TINT}/><path d="M8 21.5h8"/>`),
  // Ribbed glass dome.
  big_dome: line(`<path d="M2 19.5a10 10 0 0 1 20 0z" ${TINT}/><path d="M7 19.5a5 8.5 0 0 1 10 0M12 9.5v10M3.3 14.5h17.4M1 19.5h22"/>`),
  // A cave arch with a warm window inside.
  lava_habitat: line(`<path d="M2 20c0-7.5 4.5-13 10-13s10 5.5 10 13z" ${TINT}/><path d="M7.5 20v-4.5a4.5 4.5 0 0 1 9 0V20"/><rect x="10.5" y="15" width="3" height="2.4" rx=".5" fill="currentColor"/><path d="M6 6.5l1.5 1.5M18 6.5L16.5 8M12 3.5v2"/>`),
  // Winding road with a destination pin.
  long_range: line(`<path d="M5 21c0-4 7-4 7-8s-6-4-6-7" /><path d="M9 21c0-4 7-4 7-8s-6-4-6-7" opacity=".55"/><path d="M18 2.5a3 3 0 0 1 3 3c0 2.2-3 5-3 5s-3-2.8-3-5a3 3 0 0 1 3-3z" ${TINT}/><circle cx="18" cy="5.5" r=".9" fill="currentColor"/>`),
};

/** The four development stages (data/research.ts STAGES). */
export const STAGE_ICONS: Record<StageDefinition['id'], string> = {
  // A light bulb: the idea.
  concept: line(`<path d="M9 17.5h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1 1.3 1 2.2v1.5h5.2V16c0-.9.3-1.6 1-2.2A6 6 0 0 0 12 3z" ${TINT}/>`),
  // A lab flask with bubbles.
  prototype: line(`<path d="M9.5 3h5M10.5 3v6l-5 8.8A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.2l-5-8.8V3" ${TINT}/><path d="M7.5 15h9"/><circle cx="11" cy="17.5" r=".8" fill="currentColor"/><circle cx="14" cy="18.2" r=".6" fill="currentColor"/>`),
  // A flag planted on rough ground: tested outside.
  field_test: line(`<path d="M2 20l5-5 3.5 3 4-6L22 20z" ${TINT}/><path d="M14.5 12V3l5 2.5-5 2.5"/>`),
  // A rocket: ready to fly.
  mission_ready: line(`<path d="M12 2.5c3 2.4 4.5 5.8 4.5 9.5v4h-9v-4c0-3.7 1.5-7.1 4.5-9.5z" ${TINT}/><circle cx="12" cy="9.5" r="1.6"/><path d="M7.5 13l-3 3v3l3-1.5M16.5 13l3 3v3l-3-1.5M10 18.5l2 3 2-3"/>`),
};

export const MISC_ICONS = {
  // A check inside a ring.
  done: line(`<circle cx="12" cy="12" r="9" ${TINT}/><path d="M7.8 12.3l2.8 2.8 5.6-5.8"/>`),
  // Research points: a flask with a spark.
  rp: line(`<path d="M9.5 3h5M10.5 3v6l-5 8.8A2 2 0 0 0 7.2 21h9.6a2 2 0 0 0 1.7-3.2l-5-8.8V3"/><path d="M12 12.5l-1.3 2.6h2.6L12 17.7"/>`),
  // Hourglass.
  time: line(`<path d="M6 3h12M6 21h12M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9"/>`),
  // A crate of parts being shipped.
  materials: line(`<path d="M4 8l8-4 8 4v9l-8 4-8-4z" ${TINT}/><path d="M4 8l8 4 8-4M12 12v9"/>`),
  // A building outline, for "unlocks a building".
  building: line(`<path d="M4 21V9l6-4v16M10 21V11l10 3v7" ${TINT}/><path d="M2 21h20M6.5 12h1M6.5 15.5h1M13 16h1M16.5 17h1"/>`),
  // An up-arrow on a bar, for "upgrade".
  upgrade: line(`<path d="M12 20V6M6.5 11.5L12 6l5.5 5.5"/><path d="M4 21h16"/>`),
  pause: line(`<circle cx="12" cy="12" r="9" ${TINT}/><path d="M10 9v6M14 9v6"/>`),
  question: line(`<circle cx="12" cy="12" r="9" ${TINT}/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="16.8" r=".9" fill="currentColor"/>`),
};
