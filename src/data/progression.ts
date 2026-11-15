import type { BuildingType } from './buildings';
import type { ResourceId } from './resources';
import { TECHS } from './research';

/**
 * Player progression — pure data. XP comes from finished buildings, exploration missions
 * and goals; ranks unlock new buildings and longer missions.
 */

export type RankId =
  | 'junior_pioneer'
  | 'astronaut_candidate'
  | 'mars_engineer'
  | 'rover_pilot'
  | 'settlement_commander'
  | 'mission_specialist'
  | 'flight_engineer'
  | 'expedition_leader'
  | 'base_director'
  | 'flight_director'
  | 'hero_of_mars';

export interface RankDefinition {
  /** 1-based, stored in saves as `progression.level` (always re-worked out from XP on load). */
  level: number;
  id: RankId;
  title: string;
  xp: number;
  icon: string;
  /** Most bases the player may run (home base included). */
  maxBases: number;
  /** Crew rovers that can be out on expeditions at once. */
  crewRovers: number;
  /** Orbiters that can map regions at once. */
  orbiters: number;
  /** Multiplier on how far a founding convoy may drive. */
  convoyRange: number;
  /** What reaching this rank unlocks (shown to the player). */
  perks: string[];
}

/**
 * The rank ladder (gameplay values). Every rank unlocks something: buildings
 * (BuildingDefinition.unlockRank), research projects (TechDefinition.rank), long-range
 * expeditions (RegionReward.rank), outposts, and more bases, rovers and orbiters.
 * The XP of the original three ranks (0 / 120 / 400) is kept so old saves lose nothing.
 */
export const RANKS: RankDefinition[] = [
  {
    level: 1, id: 'junior_pioneer', title: 'Junior Pioneer', xp: 0, icon: '🧑‍🚀', maxBases: 2, crewRovers: 1, orbiters: 1, convoyRange: 1,
    perks: ['Habitats, solar farms, greenhouses, drills, diggers and refineries', 'Orbital maps and one crew rover for nearby expeditions'],
  },
  {
    level: 2, id: 'astronaut_candidate', title: 'Astronaut Candidate', xp: 50, icon: '🎒', maxBases: 2, crewRovers: 2, orbiters: 1, convoyRange: 1,
    perks: ['Storage Silo & Tanks', 'A second crew rover', 'Remote outposts at explored finds'],
  },
  {
    level: 3, id: 'mars_engineer', title: 'Mars Engineer', xp: 120, icon: '🛠️', maxBases: 3, crewRovers: 2, orbiters: 1, convoyRange: 1,
    perks: ['Battery Bank — power through the night', 'MOXIE Oxygen Maker — oxygen from the air', 'Up to 3 bases'],
  },
  {
    level: 4, id: 'rover_pilot', title: 'Rover Pilot', xp: 250, icon: '🚙', maxBases: 3, crewRovers: 2, orbiters: 1, convoyRange: 1,
    perks: ['Cargo Hauler Garage — trucks between bases', 'Pipeline Pump Station — share goods between bases'],
  },
  {
    level: 5, id: 'settlement_commander', title: 'Settlement Commander', xp: 400, icon: '🎖️', maxBases: 4, crewRovers: 2, orbiters: 1, convoyRange: 1,
    perks: ['Research Lab plans', 'Long-range expeditions to the polar ice caps', 'Up to 4 bases'],
  },
  {
    level: 6, id: 'mission_specialist', title: 'Mission Specialist', xp: 650, icon: '🔬', maxBases: 5, crewRovers: 2, orbiters: 1, convoyRange: 1,
    perks: ['Research: Megadigger, Big Dome and Glacier Mine', 'Up to 5 bases'],
  },
  {
    level: 7, id: 'flight_engineer', title: 'Flight Engineer', xp: 950, icon: '⚙️', maxBases: 5, crewRovers: 2, orbiters: 2, convoyRange: 1,
    perks: ['Research: Fission power and Orbiter Mk III', 'A second orbiter — map two regions at once'],
  },
  {
    level: 8, id: 'expedition_leader', title: 'Expedition Leader', xp: 1350, icon: '🧭', maxBases: 6, crewRovers: 3, orbiters: 2, convoyRange: 1.25,
    perks: ['Research: Hematite Strip Mine', 'A third crew rover', 'Founding convoys drive 25% farther', 'Up to 6 bases'],
  },
  {
    level: 9, id: 'base_director', title: 'Base Director', xp: 1850, icon: '🏛️', maxBases: 8, crewRovers: 3, orbiters: 2, convoyRange: 1.25,
    perks: ['Research: Lava-Tube Habitat and Deep Aquifer Drill', 'Up to 8 bases'],
  },
  {
    level: 10, id: 'flight_director', title: 'Flight Director', xp: 2500, icon: '🎧', maxBases: 10, crewRovers: 4, orbiters: 3, convoyRange: 1.5,
    perks: ['A fourth crew rover and a third orbiter', 'Founding convoys drive 50% farther', 'Up to 10 bases'],
  },
  {
    level: 11, id: 'hero_of_mars', title: 'Hero of Mars', xp: 3300, icon: '🌟', maxBases: 12, crewRovers: 4, orbiters: 3, convoyRange: 1.5,
    perks: ['The golden laurel badge', 'Up to 12 bases — a whole Mars network'],
  },
];

/** Kept for older UI code: the ranks double as levels. */
export const LEVELS = RANKS;

export const XP_REWARDS = {
  buildingComplete: 20,
};

/** Rank that unlocks the Research Lab and the research panel. */
export const RESEARCH_UNLOCK_RANK: RankId = 'settlement_commander';
/** Rank that unlocks remote outposts. */
export const OUTPOST_UNLOCK_RANK: RankId = 'astronaut_candidate';

export function rankForXp(xp: number): RankDefinition {
  let cur = RANKS[0];
  for (const r of RANKS) if (xp >= r.xp) cur = r;
  return cur;
}

export const levelForXp = rankForXp;

export function nextLevel(level: number): RankDefinition | null {
  return RANKS.find((l) => l.level === level + 1) ?? null;
}

export function rankById(id: RankId): RankDefinition {
  return RANKS.find((r) => r.id === id)!;
}

/** The rank at a saved level (clamped to the ladder). */
export function rankAtLevel(level: number): RankDefinition {
  return RANKS[Math.max(0, Math.min(RANKS.length, Math.floor(level)) - 1)] ?? RANKS[0];
}

/** True when the player's current level has reached the rank. */
export function hasRank(level: number, id: RankId | undefined): boolean {
  return !id || level >= rankById(id).level;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export type GoalCondition =
  | { kind: 'produce'; resource: ResourceId; amount: number }
  | { kind: 'buildings'; count: number }
  | { kind: 'has_building'; type: BuildingType }
  | { kind: 'regions'; count: number }
  | { kind: 'explored'; count: number }
  /** Bases running, home base included. */
  | { kind: 'bases'; count: number }
  /** Research projects finished. */
  | { kind: 'research'; count: number }
  | { kind: 'outposts'; count: number };

export interface GoalDefinition {
  id: string;
  title: string;
  hint: string;
  icon: string;
  xp: number;
  condition: GoalCondition;
}

export const GOALS: GoalDefinition[] = [
  { id: 'goal-first-build', title: 'Build something new', hint: 'Open Build and place any building.', icon: '🏗️', xp: 30, condition: { kind: 'buildings', count: 1 } },
  { id: 'goal-dig', title: 'Dig 150 t of regolith', hint: 'A Regolith Excavator digs up Martian soil.', icon: '⛏️', xp: 30, condition: { kind: 'produce', resource: 'regolith', amount: 150 } },
  { id: 'goal-explore-2', title: 'Map 2 new regions from orbit', hint: 'Open Exploration, pick a region and press “Map from orbit”.', icon: '🛰️', xp: 40, condition: { kind: 'regions', count: 3 } },
  { id: 'goal-food', title: 'Grow 300 kg of food', hint: 'The greenhouse needs water and electricity.', icon: '🥕', xp: 40, condition: { kind: 'produce', resource: 'food', amount: 300 } },
  { id: 'goal-oxygen', title: 'Make 250 kg of oxygen', hint: 'The Life-Support Plant splits water into oxygen.', icon: '💨', xp: 40, condition: { kind: 'produce', resource: 'oxygen', amount: 250 } },
  { id: 'goal-iron', title: 'Smelt 40 t of iron', hint: 'An Iron Refinery turns regolith into iron.', icon: '🔩', xp: 40, condition: { kind: 'produce', resource: 'iron', amount: 40 } },
  { id: 'goal-water', title: 'Mine 500 kg of water', hint: 'The Ice Drill melts buried ice.', icon: '🧊', xp: 40, condition: { kind: 'produce', resource: 'water', amount: 500 } },
  { id: 'goal-battery', title: 'Build a Battery Bank', hint: 'Unlocked at Mars Engineer rank.', icon: '🔋', xp: 50, condition: { kind: 'has_building', type: 'battery_bank' } },
  { id: 'goal-builder', title: 'Build 6 new buildings', hint: 'Grow the settlement!', icon: '🏘️', xp: 60, condition: { kind: 'buildings', count: 6 } },
  { id: 'goal-explore-7', title: 'Send a crew to 2 new regions', hint: 'Map a region next to home, then send the crew rover there.', icon: '🗺️', xp: 60, condition: { kind: 'explored', count: 3 } },
  // Later goals: they carry the player up the higher ranks.
  { id: 'goal-outpost', title: 'Set up a remote outpost', hint: 'Unlocked at Astronaut Candidate. Explore an icy or rocky find, then build an outpost there.', icon: '⛺', xp: 60, condition: { kind: 'outposts', count: 1 } },
  { id: 'goal-second-base', title: 'Found a second base', hint: 'Map a region to find base sites, then send a founding convoy.', icon: '🚩', xp: 80, condition: { kind: 'bases', count: 2 } },
  { id: 'goal-first-research', title: 'Finish a research project', hint: 'Unlocked at Settlement Commander: build a Research Lab and pick a project.', icon: '🔬', xp: 80, condition: { kind: 'research', count: 1 } },
  { id: 'goal-explore-10', title: 'Send crews to 10 new regions', hint: 'Keep pushing the frontier outward.', icon: '🧭', xp: 120, condition: { kind: 'explored', count: 11 } },
  { id: 'goal-builder-20', title: 'Build 20 new buildings', hint: 'Every base counts.', icon: '🏙️', xp: 120, condition: { kind: 'buildings', count: 20 } },
  { id: 'goal-iron-big', title: 'Smelt 400 t of iron', hint: 'More refineries — or a strip mine on hematite.', icon: '🏭', xp: 120, condition: { kind: 'produce', resource: 'iron', amount: 400 } },
  { id: 'goal-research-6', title: 'Finish 6 research projects', hint: 'More labs run more projects at once.', icon: '🧪', xp: 150, condition: { kind: 'research', count: 6 } },
  { id: 'goal-four-bases', title: 'Run 4 bases', hint: 'Unlocked at Settlement Commander.', icon: '🌐', xp: 150, condition: { kind: 'bases', count: 4 } },
  { id: 'goal-map-20', title: 'Map 20 regions from orbit', hint: 'A second orbiter (Flight Engineer) maps twice as many at once.', icon: '🛰️', xp: 150, condition: { kind: 'regions', count: 20 } },
  { id: 'goal-research-all', title: 'Finish every research project', hint: 'The top projects unlock at Base Director.', icon: '🏆', xp: 300, condition: { kind: 'research', count: TECHS.length } },
];
