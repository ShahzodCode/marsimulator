import { BUILDINGS, type BuildingType } from './buildings';
import type { ResourceId } from './resources';
import type { RankId } from './progression';

type Cost = Partial<Record<ResourceId, number>>;

/**
 * The research tree. Research Labs make research points (RP); each project goes through
 * four development stages (modelled on NASA's Technology Readiness Levels) and unlocks
 * buildings or upgrades. Costs are game values. Real science behind a project is in its
 * `fact` (sources in docs/sources.md).
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
  /** Rank needed before a lab may start it (data/progression.ts). */
  rank?: RankId;
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
    cost: 240,
    requires: [],
    effect: 'X-ray view down to 5 km · maps regions twice as fast · confirms “likely” finds from orbit',
    fact: 'Mars Express carries MARSIS, a radar whose long waves reach about 3–5 km into the ground.',
  },
  {
    id: 'orbiter_mk3',
    branch: 'orbit',
    name: 'Orbiter Mk III: crust sounder',
    icon: '🌐',
    cost: 630,
    requires: ['orbiter_mk2'],
    rank: 'flight_engineer',
    effect: 'X-ray view down to 20 km · reveals deep groundwater',
    fact: 'Future technology. Today the deep water was found by InSight’s seismometer listening to marsquakes, not from orbit.',
  },
  // Water
  {
    id: 'better_drills',
    branch: 'water',
    name: 'Better ice drills',
    icon: '🧊',
    cost: 120,
    requires: [],
    effect: 'Every Ice Drill makes 25% more water',
    fact: 'NASA tests Mars ice drills in Antarctica and the Arctic, where the ground is frozen too.',
  },
  {
    id: 'glacier_mine',
    branch: 'water',
    name: 'Glacier Mine',
    icon: '🏔️',
    cost: 330,
    requires: ['better_drills'],
    rank: 'mission_specialist',
    effect: 'Unlocks the Glacier Mine (icy sites only)',
    fact: 'The South Pole station on Earth melts its drinking water out of the ice with a “Rodriguez well”.',
  },
  {
    id: 'deep_aquifer',
    branch: 'water',
    name: 'Deep Aquifer Drill',
    icon: '🌊',
    cost: 900,
    requires: ['glacier_mine', 'orbiter_mk3'],
    rank: 'base_director',
    effect: 'Unlocks the Deep Aquifer Drill (where the radar orbiter found deep water)',
    fact: 'InSight’s data suggests water 11.5–20 km down, enough to cover Mars 1–2 km deep.',
  },
  // Mining
  {
    id: 'regolith_bricks',
    branch: 'mining',
    name: 'Regolith bricks',
    icon: '🧱',
    cost: 135,
    requires: [],
    effect: 'All buildings cost 15% less regolith and iron',
    fact: 'Scientists have baked Mars-like soil into bricks stronger than concrete.',
  },
  {
    id: 'megadigger',
    branch: 'mining',
    name: 'Bucket-Wheel Megadigger',
    icon: '⚙️',
    cost: 300,
    requires: ['regolith_bricks'],
    rank: 'mission_specialist',
    effect: 'Unlocks the Megadigger: 5× the regolith of an excavator',
    fact: 'Bucket-wheel excavators are the biggest land machines ever built on Earth.',
  },
  {
    id: 'strip_mine',
    branch: 'mining',
    name: 'Hematite Strip Mine',
    icon: '⛏️',
    cost: 450,
    requires: ['megadigger'],
    rank: 'expedition_leader',
    effect: 'Unlocks the Strip Mine (hematite sites only)',
    fact: 'Opportunity found hematite “blueberries” at Meridiani, and orbiters see up to 20% hematite there.',
  },
  // Energy
  {
    id: 'dust_cleaning',
    branch: 'energy',
    name: 'Self-cleaning panels',
    icon: '🧹',
    cost: 150,
    requires: [],
    effect: 'All solar output +15%',
    fact: 'Dust slowly covered Opportunity’s and InSight’s panels; lucky gusts of wind sometimes cleaned them.',
  },
  {
    id: 'fission',
    branch: 'energy',
    name: 'Compact fission power',
    icon: '⚛️',
    cost: 540,
    requires: ['dust_cleaning'],
    rank: 'flight_engineer',
    effect: 'Unlocks the Fission Reactor: 40 kW day and night',
    fact: 'NASA’s KRUSTY test reactor ran in 2018; Mars plans use several 10 kW units together.',
  },
  // Life
  {
    id: 'hydroponics',
    branch: 'life',
    name: 'Advanced hydroponics',
    icon: '🥬',
    cost: 135,
    requires: [],
    effect: 'Greenhouses grow 30% more food',
    fact: 'On the Space Station, astronauts grow lettuce in the “Veggie” chamber with LED light and no soil.',
  },
  {
    id: 'big_dome',
    branch: 'life',
    name: 'Big Dome',
    icon: '🏟️',
    cost: 360,
    requires: ['hydroponics'],
    rank: 'mission_specialist',
    effect: 'Unlocks the Big Dome: 18 beds',
    fact: 'Bigger domes mean more space per person, which matters on a long mission.',
  },
  {
    id: 'lava_habitat',
    branch: 'life',
    name: 'Lava-tube habitat',
    icon: '🕳️',
    cost: 570,
    requires: ['big_dome'],
    rank: 'base_director',
    effect: 'Unlocks the Lava-Tube Habitat: 30 beds (cave sites only)',
    fact: 'HiRISE has photographed pits on Arsia Mons that may be skylights into lava tubes.',
  },
  // Transport
  {
    id: 'long_range',
    branch: 'transport',
    name: 'Long-range convoys',
    icon: '🛣️',
    cost: 225,
    requires: [],
    effect: 'Founding convoys can drive 50% farther',
    fact: 'NASA’s pressurised rover concept is designed to let two astronauts live in it for days at a time.',
  },
];

/** A step on the way from idea to working machine (NASA Technology Readiness Levels). */
export interface StageDefinition {
  id: 'concept' | 'prototype' | 'field_test' | 'mission_ready';
  name: string;
  /** The NASA readiness levels this stage covers. */
  trl: string;
  /** What happens in this stage, in plain words. */
  blurb: string;
  /** Share of the project's research points spent in this stage. */
  share: number;
  /** Materials for test hardware, as a share of the project's RP (game values). */
  materials: Cost;
}

export const STAGES: StageDefinition[] = [
  {
    id: 'concept',
    name: 'Concept study',
    trl: 'TRL 1–2',
    blurb: 'Scientists work out the idea on paper and check the physics.',
    share: 0.15,
    materials: {},
  },
  {
    id: 'prototype',
    name: 'Lab prototype',
    trl: 'TRL 3–4',
    blurb: 'Engineers build a small working model and test it in the lab.',
    share: 0.3,
    materials: { iron: 0.1, regolith: 0.15 },
  },
  {
    id: 'field_test',
    name: 'Field test',
    trl: 'TRL 5–6',
    blurb: 'A full-size test unit goes outside into real Mars dust, cold and thin air.',
    share: 0.35,
    materials: { iron: 0.15, water: 0.05 },
  },
  {
    id: 'mission_ready',
    name: 'Mission ready',
    trl: 'TRL 7–9',
    blurb: 'The design is proven, written up and approved for every base.',
    share: 0.2,
    materials: {},
  },
];

/** Research points needed to finish one stage of a project. */
export function stageRp(tech: TechDefinition, stage: number): number {
  return Math.round(tech.cost * STAGES[stage].share);
}

/** Materials paid when a stage starts (prototype and test hardware). */
export function stageMaterials(tech: TechDefinition, stage: number): Cost {
  const out: Cost = {};
  for (const [id, f] of Object.entries(STAGES[stage].materials) as [ResourceId, number][]) {
    out[id] = Math.max(5, Math.round((tech.cost * f) / 5) * 5);
  }
  return out;
}

/** Research points already spent on a project (all earlier stages plus this one). */
export function rpDone(tech: TechDefinition, stage: number, progress: number): number {
  let rp = progress;
  for (let i = 0; i < stage; i++) rp += stageRp(tech, i);
  return rp;
}

/** How deep a project sits in the tree (0 = no prerequisites). */
export function techTier(id: TechId): number {
  const t = TECH_BY_ID[id];
  return t.requires.length ? 1 + Math.max(...t.requires.map(techTier)) : 0;
}

export const TECH_BY_ID: Record<TechId, TechDefinition> = Object.fromEntries(TECHS.map((t) => [t.id, t])) as Record<TechId, TechDefinition>;

export function hasTech(completed: readonly string[], id: TechId | undefined): boolean {
  return !id || completed.includes(id);
}

/**
 * How many projects can run side by side: one per finished Research Lab, at any base.
 * Working labs pool their research points and share them out between the running projects.
 */
export function labSlots(baseBuildings: readonly (readonly { type: BuildingType; isOperational: boolean }[])[]): number {
  let n = 0;
  for (const list of baseBuildings) for (const b of list) if (b.isOperational && BUILDINGS[b.type].researchPerSol) n++;
  return n;
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
