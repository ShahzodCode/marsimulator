import type { BuildingType } from './buildings';
import type { ResourceId } from './resources';

/**
 * Player progression — pure data. XP comes from finished buildings, exploration missions
 * and goals; ranks unlock new buildings and longer missions.
 */

export type RankId = 'junior_pioneer' | 'mars_engineer' | 'settlement_commander';

export interface RankDefinition {
  /** 1-based, stored in saves as `progression.level`. */
  level: number;
  id: RankId;
  title: string;
  xp: number;
  icon: string;
  /** What reaching this rank unlocks (shown to the player). */
  perks: string[];
}

export const RANKS: RankDefinition[] = [
  { level: 1, id: 'junior_pioneer', title: 'Junior Pioneer', xp: 0, icon: '🧑‍🚀', perks: ['Habitats, solar farms, greenhouses, drills, diggers, refineries and silos', 'Survey missions to nearby regions'] },
  { level: 2, id: 'mars_engineer', title: 'Mars Engineer', xp: 120, icon: '🛠️', perks: ['Battery Bank — power through the night', 'MOXIE Oxygen Maker — oxygen from the air'] },
  { level: 3, id: 'settlement_commander', title: 'Settlement Commander', xp: 400, icon: '🎖️', perks: ['Long-range missions to the polar ice caps', 'Research Lab plans'] },
];

/** Kept for older UI code: the ranks double as levels. */
export const LEVELS = RANKS;

export const XP_REWARDS = {
  buildingComplete: 20,
};

export const RESEARCH_UNLOCK_LEVEL = 3;

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
  | { kind: 'regions'; count: number };

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
  { id: 'goal-explore-2', title: 'Explore 2 new regions', hint: 'Send survey rovers from the Exploration panel.', icon: '🛰️', xp: 40, condition: { kind: 'regions', count: 3 } },
  { id: 'goal-food', title: 'Grow 300 kg of food', hint: 'The greenhouse needs water and electricity.', icon: '🥕', xp: 40, condition: { kind: 'produce', resource: 'food', amount: 300 } },
  { id: 'goal-oxygen', title: 'Make 250 kg of oxygen', hint: 'The Life-Support Plant splits water into oxygen.', icon: '💨', xp: 40, condition: { kind: 'produce', resource: 'oxygen', amount: 250 } },
  { id: 'goal-iron', title: 'Smelt 40 t of iron', hint: 'An Iron Refinery turns regolith into iron.', icon: '🔩', xp: 40, condition: { kind: 'produce', resource: 'iron', amount: 40 } },
  { id: 'goal-water', title: 'Mine 500 kg of water', hint: 'The Ice Drill melts buried ice.', icon: '🧊', xp: 40, condition: { kind: 'produce', resource: 'water', amount: 500 } },
  { id: 'goal-battery', title: 'Build a Battery Bank', hint: 'Unlocked at Mars Engineer rank.', icon: '🔋', xp: 50, condition: { kind: 'has_building', type: 'battery_bank' } },
  { id: 'goal-builder', title: 'Build 6 new buildings', hint: 'Grow the settlement!', icon: '🏘️', xp: 60, condition: { kind: 'buildings', count: 6 } },
  { id: 'goal-explore-7', title: 'Explore 6 new regions', hint: 'Each new region shows the next ones you can reach.', icon: '🗺️', xp: 60, condition: { kind: 'regions', count: 7 } },
];

/** Upcoming technologies (research system arrives in a later stage). */
export const TECHNOLOGIES = [
  { id: 'nuclear', name: 'Compact Fission Power', icon: '⚛️', description: 'Steady power day and night — even during dust storms.' },
  { id: 'bricks', name: 'Regolith Bricks', icon: '🧱', description: 'Sinter Martian soil into strong bricks to build cheaper habitats.' },
  { id: 'hydroponics', name: 'Advanced Hydroponics', icon: '🥬', description: 'Grow more food with less water by feeding roots directly.' },
  { id: 'sabatier', name: 'Rocket Fuel Plant', icon: '🚀', description: 'Combine stored hydrogen with carbon dioxide to make methane rocket fuel.' },
  { id: 'rovers', name: 'Long-Range Rovers', icon: '🚙', description: 'Faster survey missions that can travel farther.' },
];
