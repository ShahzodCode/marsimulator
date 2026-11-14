import { GROWTH_PER_SOL, POPULATION } from '../data/population';

export interface GrowthResult {
  colonists: number;
  /** 0..1 progress towards the next baby. */
  growth: number;
  births: number;
  /** Why the base is not growing right now, or null. */
  paused: 'no_beds' | 'no_pair' | 'shortage' | null;
}

/**
 * Families grow into free beds (data/population.ts). Pure: no store, no clock.
 */
export const PopulationManager = {
  /** Half of the colonists are women. */
  women(colonists: number): number {
    return Math.floor(colonists / 2);
  },

  /** New colonists per sol right now (0 when growth is paused). */
  ratePerSol(colonists: number, beds: number): number {
    const free = beds - colonists;
    if (free <= 0 || colonists < 2) return 0;
    return colonists * GROWTH_PER_SOL * (1 + (POPULATION.emptyBedBoost * free) / beds);
  },

  /** Sols until the next baby at today's rate, or null when paused. */
  solsToNext(colonists: number, beds: number, growth: number): number | null {
    const r = PopulationManager.ratePerSol(colonists, beds);
    return r > 0 ? Math.max(0, 1 - growth) / r : null;
  },

  /**
   * One step. `shortage` = the base is out of food, water or oxygen: families wait until
   * it is safe again.
   */
  step(colonists: number, beds: number, growth: number, dt: number, shortage: boolean): GrowthResult {
    if (colonists < 2 || PopulationManager.women(colonists) < 1) return { colonists, growth, births: 0, paused: 'no_pair' };
    if (beds - colonists <= 0) return { colonists, growth, births: 0, paused: 'no_beds' };
    if (shortage) return { colonists, growth, births: 0, paused: 'shortage' };
    if (dt <= 0) return { colonists, growth, births: 0, paused: null };
    let g = growth + PopulationManager.ratePerSol(colonists, beds) * dt;
    let c = colonists;
    let births = 0;
    while (g >= 1 && c < beds) {
      g -= 1;
      c += 1;
      births += 1;
    }
    // A full base keeps no "half a baby" waiting.
    if (c >= beds) g = 0;
    return { colonists: c, growth: g, births, paused: null };
  },
};
