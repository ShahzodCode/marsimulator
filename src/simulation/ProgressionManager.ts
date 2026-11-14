import { GOALS, rankForXp, type GoalDefinition, type RankDefinition } from '../data/progression';
import type { GameState, Progression } from '../state/types';

/** XP, ranks and goals — data-driven and independent of the UI. */
export const ProgressionManager = {
  /** Adds XP once (a milestone id prevents granting the same reward twice). */
  grant(p: Progression, amount: number, milestone?: string): { progression: Progression; rankUp: RankDefinition | null } {
    if (milestone && p.milestones.includes(milestone)) return { progression: p, rankUp: null };
    const xp = p.xp + amount;
    const rank = rankForXp(xp);
    const progression: Progression = { level: Math.max(p.level, rank.level), xp, milestones: milestone ? [...p.milestones, milestone] : p.milestones };
    return { progression, rankUp: rank.level > p.level ? rank : null };
  },

  /** How far a goal is: current value and target. */
  goalProgress(state: Pick<GameState, 'stats' | 'buildings' | 'discoveredRegions' | 'exploredRegions'>, goal: GoalDefinition): { current: number; target: number } {
    const c = goal.condition;
    switch (c.kind) {
      case 'produce':
        return { current: state.stats.produced[c.resource] ?? 0, target: c.amount };
      case 'buildings':
        return { current: state.buildings.filter((b) => !b.starter && b.isOperational).length, target: c.count };
      case 'has_building':
        return { current: state.buildings.some((b) => b.type === c.type && b.isOperational) ? 1 : 0, target: 1 };
      case 'regions':
        return { current: Object.values(state.discoveredRegions).filter(Boolean).length, target: c.count };
      case 'explored':
        return { current: Object.values(state.exploredRegions).filter(Boolean).length, target: c.count };
    }
  },

  /** Goals reached now that were not rewarded before. */
  newlyReached(state: Pick<GameState, 'stats' | 'buildings' | 'discoveredRegions' | 'exploredRegions' | 'progression'>): GoalDefinition[] {
    return GOALS.filter((g) => {
      if (state.progression.milestones.includes(g.id)) return false;
      const { current, target } = ProgressionManager.goalProgress(state, g);
      return current >= target;
    });
  },
};
