/**
 * Families on Mars (game values, set by the design: no one is recruited from Earth).
 *
 * Half of the colonists are women. With free beds a base grows by half every 90 sols; empty
 * beds speed it up, and with no free bed nobody new is born. For comparison, a real human
 * pregnancy lasts about 9 months (about 270 sols): the game speeds families up, just like it
 * speeds up the orbiter and the rovers.
 */
export const POPULATION = {
  /** +50 % … */
  growth: 0.5,
  /** … every 90 sols. */
  periodSols: 90,
  /** Rate × (1 + boost × share of empty beds): a brand-new empty dome roughly triples it. */
  emptyBedBoost: 2,
};

/** Base growth rate per colonist per sol: (1 + growth)^(1/period) − 1, as a continuous rate. */
export const GROWTH_PER_SOL = Math.log(1 + POPULATION.growth) / POPULATION.periodSols;
