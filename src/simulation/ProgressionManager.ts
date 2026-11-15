import { GOALS, rankForXp, type GoalDefinition, type RankDefinition } from '../data/progression';
import type { GameState, Progression } from '../state/types';

type GoalState = Pick<GameState, 'stats' | 'buildings' | 'discoveredRegions' | 'exploredRegions'> &
  Partial<Pick<GameState, 'otherBases' | 'research' | 'outposts'>>;

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
  goalProgress(state: GoalState, goal: GoalDefinition): { current: number; target: number } {
    const c = goal.condition;
    switch (c.kind) {
      case 'produce':
        return { current: state.stats.produced[c.resource] ?? 0, target: c.amount };
      case 'buildings': {
        // Every base counts.
        const lists = [state.buildings, ...(state.otherBases ?? []).map((b) => b.buildings)];
        return { current: lists.reduce((n, l) => n + l.filter((b) => !b.starter && b.isOperational).length, 0), target: c.count };
      }
      case 'has_building':
        return { current: state.buildings.some((b) => b.type === c.type && b.isOperational) ? 1 : 0, target: 1 };
      case 'regions':
        return { current: Object.values(state.discoveredRegions).filter(Boolean).length, target: c.count };
      case 'explored':
        return { current: Object.values(state.exploredRegions).filter(Boolean).length, target: c.count };
      case 'bases':
        return { current: 1 + (state.otherBases?.length ?? 0), target: c.count };
      case 'research':
        return { current: state.research?.completed.length ?? 0, target: c.count };
      case 'outposts':
        return { current: state.outposts?.length ?? 0, target: c.count };
    }
  },

  /** Goals reached now that were not rewarded before. */
  newlyReached(state: GoalState & Pick<GameState, 'progression'>): GoalDefinition[] {
    return GOALS.filter((g) => {
      if (state.progression.milestones.includes(g.id)) return false;
      const { current, target } = ProgressionManager.goalProgress(state, g);
      return current >= target;
    });
  },
};
