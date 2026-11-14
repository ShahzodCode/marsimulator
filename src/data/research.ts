/**
 * The research tree. Research Labs make research points (RP); each project costs RP and
 * unlocks buildings or upgrades. Costs are game values. Real science behind a project is in
 * its `fact` (sources in docs/sources.md).
 */

export type TechId =
  | 'dust_cleaning'
  | 'fission'
  | 'regolith_bricks'
  | 'megadigger'
  | 'strip_mine'
  | 'better_drills'
  | 'glacier_mine'
  | 'deep_aquifer'
  | 'hydroponics'
  | 'big_dome'
  | 'lava_habitat'
  | 'orbiter_mk2'
  | 'orbiter_mk3'
  | 'long_range';

export type BranchId = 'energy' | 'mining' | 'water' | 'life' | 'orbit' | 'transport';

export interface BranchDefinition {
  id: BranchId;
  name: string;
  icon: string;
  color: string;
}

export const BRANCHES: BranchDefinition[] = [
  { id: 'orbit', name: 'Orbit', icon: '🛰️', color: '#5fe3ff' },
  { id: 'water', name: 'Water', icon: '💧', color: '#6aa8ff' },
  { id: 'mining', name: 'Mining', icon: '⛏️', color: '#e2a35a' },
  { id: 'energy', name: 'Energy', icon: '⚡', color: '#ffd34d' },
  { id: 'life', name: 'Life', icon: '🌱', color: '#6dff8a' },
  { id: 'transport', name: 'Transport', icon: '🚙', color: '#ff8a5f' },
];

export interface TechDefinition {
  id: TechId;
  branch: BranchId;
  name: string;
  icon: string;
  /** Research points needed. */
  cost: number;
  /** All of these must be finished first. */
  requires: TechId[];
  /** What it does, in plain words. */
  effect: string;
  /** Real science behind it. */
  fact: string;
}

export const TECHS: TechDefinition[] = [
  // Orbit
  {
    id: 'orbiter_mk2',
    branch: 'orbit',
    name: 'Orbiter Mk II: deep radar',
    icon: '📡',
    cost: 160,
    requires: [],
    effect: 'X-ray view down to 5 km · maps regions twice as fast · confirms “likely” finds from orbit',
    fact: 'Mars Express carries MARSIS, a radar whose long waves reach about 3–5 km into the ground.',
  },
  {
    id: 'orbiter_mk3',
    branch: 'orbit',
    name: 'Orbiter Mk III: crust sounder',
    icon: '🌐',
    cost: 420,
    requires: ['orbiter_mk2'],
    effect: 'X-ray view down to 20 km · reveals deep groundwater',
    fact: 'Future technology. Today the deep water was found by InSight’s seismometer listening to marsquakes, not from orbit.',
  },
  // Water
  {
    id: 'better_drills',
    branch: 'water',
    name: 'Better ice drills',
    icon: '🧊',
    cost: 80,
    requires: [],
    effect: 'Every Ice Drill makes 25% more water',
    fact: 'NASA tests Mars ice drills in Antarctica and the Arctic, where the ground is frozen too.',
  },
  {
    id: 'glacier_mine',
    branch: 'water',
    name: 'Glacier Mine',
    icon: '🏔️',
    cost: 220,
    requires: ['better_drills'],
    effect: 'Unlocks the Glacier Mine (icy sites only)',
    fact: 'The South Pole station on Earth melts its drinking water out of the ice with a “Rodriguez well”.',
  },
  {
    id: 'deep_aquifer',
    branch: 'water',
    name: 'Deep Aquifer Drill',
    icon: '🌊',
    cost: 600,
    requires: ['glacier_mine', 'orbiter_mk3'],
    effect: 'Unlocks the Deep Aquifer Drill (where the radar orbiter found deep water)',
    fact: 'InSight’s data suggests water 11.5–20 km down, enough to cover Mars 1–2 km deep.',
  },
  // Mining
  {
    id: 'regolith_bricks',
    branch: 'mining',
    name: 'Regolith bricks',
    icon: '🧱',
    cost: 90,
    requires: [],
    effect: 'All buildings cost 15% less regolith and iron',
    fact: 'Scientists have baked Mars-like soil into bricks stronger than concrete.',
  },
  {
    id: 'megadigger',
    branch: 'mining',
    name: 'Bucket-Wheel Megadigger',
    icon: '⚙️',
    cost: 200,
    requires: ['regolith_bricks'],
    effect: 'Unlocks the Megadigger: 5× the regolith of an excavator',
    fact: 'Bucket-wheel excavators are the biggest land machines ever built on Earth.',
  },
  {
    id: 'strip_mine',
    branch: 'mining',
    name: 'Hematite Strip Mine',
    icon: '⛏️',
    cost: 300,
    requires: ['megadigger'],
    effect: 'Unlocks the Strip Mine (hematite sites only)',
    fact: 'Opportunity found hematite “blueberries” at Meridiani, and orbiters see up to 20% hematite there.',
  },
  // Energy
  {
    id: 'dust_cleaning',
    branch: 'energy',
    name: 'Self-cleaning panels',
    icon: '🧹',
    cost: 100,
    requires: [],
    effect: 'All solar output +15%',
    fact: 'Dust slowly covered Opportunity’s and InSight’s panels; lucky gusts of wind sometimes cleaned them.',
  },
  {
    id: 'fission',
    branch: 'energy',
    name: 'Compact fission power',
    icon: '⚛️',
    cost: 360,
    requires: ['dust_cleaning'],
    effect: 'Unlocks the Fission Reactor: 40 kW day and night',
    fact: 'NASA’s KRUSTY test reactor ran in 2018; Mars plans use several 10 kW units together.',
  },
  // Life
  {
    id: 'hydroponics',
    branch: 'life',
    name: 'Advanced hydroponics',
    icon: '🥬',
    cost: 90,
    requires: [],
    effect: 'Greenhouses grow 30% more food',
    fact: 'On the Space Station, astronauts grow lettuce in the “Veggie” chamber with LED light and no soil.',
  },
  {
    id: 'big_dome',
    branch: 'life',
    name: 'Big Dome',
    icon: '🏟️',
    cost: 240,
    requires: ['hydroponics'],
    effect: 'Unlocks the Big Dome: 18 beds',
    fact: 'Bigger domes mean more space per person, which matters on a long mission.',
  },
  {
    id: 'lava_habitat',
    branch: 'life',
    name: 'Lava-tube habitat',
    icon: '🕳️',
    cost: 380,
    requires: ['big_dome'],
    effect: 'Unlocks the Lava-Tube Habitat: 30 beds (cave sites only)',
    fact: 'HiRISE has photographed pits on Arsia Mons that may be skylights into lava tubes.',
  },
  // Transport
  {
    id: 'long_range',
    branch: 'transport',
    name: 'Long-range convoys',
    icon: '🛣️',
    cost: 150,
    requires: [],
    effect: 'Founding convoys can drive 50% farther',
    fact: 'NASA’s pressurised rover concept is designed to let two astronauts live in it for days at a time.',
  },
];

export const TECH_BY_ID: Record<TechId, TechDefinition> = Object.fromEntries(TECHS.map((t) => [t.id, t])) as Record<TechId, TechDefinition>;

export function hasTech(completed: readonly string[], id: TechId | undefined): boolean {
  return !id || completed.includes(id);
}

export function canResearch(completed: readonly string[], id: TechId): boolean {
  return !completed.includes(id) && TECH_BY_ID[id].requires.every((r) => completed.includes(r));
}

/** Orbiter generations, from the real radars they are modelled on. */
export interface OrbiterTier {
  tier: 1 | 2 | 3;
  name: string;
  /** Deepest the X-ray view reaches (km). */
  maxDepthKm: number;
  /** Real instrument it is modelled on. */
  basis: string;
  scanSpeed: number;
}

export const ORBITERS: OrbiterTier[] = [
  { tier: 1, name: 'Orbiter Mk I', maxDepthKm: 1, basis: 'Like SHARAD on NASA’s Mars Reconnaissance Orbiter: sees up to about 1 km down, very sharp (15 m layers).', scanSpeed: 1 },
  { tier: 2, name: 'Orbiter Mk II', maxDepthKm: 5, basis: 'Like MARSIS on Mars Express: long radio waves reach about 3–5 km down, but the picture is blurrier.', scanSpeed: 2 },
  { tier: 3, name: 'Orbiter Mk III', maxDepthKm: 20, basis: 'Future technology: a crust sounder deep enough to see the water InSight’s marsquake data points to.', scanSpeed: 2 },
];

export function orbiterFor(completed: readonly string[]): OrbiterTier {
  if (completed.includes('orbiter_mk3')) return ORBITERS[2];
  if (completed.includes('orbiter_mk2')) return ORBITERS[1];
  return ORBITERS[0];
}
