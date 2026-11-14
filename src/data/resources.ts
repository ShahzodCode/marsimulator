/**
 * Resource definitions.
 *
 * Stock resources are stored in a single global inventory (Stage 1 – no logistics yet).
 * Energy is a *flow* (kW generated vs. consumed), not a stock, so it is handled separately.
 *
 * Per-colonist needs are simplified game values, rounded from public NASA life-support
 * planning figures (roughly 0.84 kg oxygen and ~1.8 kg food per crew member per day).
 */

export type ResourceId = 'regolith' | 'iron' | 'water' | 'oxygen' | 'food';

export const RESOURCE_IDS: ResourceId[] = ['regolith', 'iron', 'water', 'oxygen', 'food'];

export interface ResourceDefinition {
  id: ResourceId;
  name: string;
  unit: string;
  color: string;
  /** Short, kid-friendly explanation shown in tooltips. */
  description: string;
  /** Warn when stock would run out within this many sols. */
  warnSols: number;
  /** Colonists need this to stay healthy (shown as critical when empty). */
  vital: boolean;
}

export const RESOURCES: Record<ResourceId, ResourceDefinition> = {
  regolith: {
    id: 'regolith',
    name: 'Regolith',
    unit: 't',
    color: '#d9824b',
    description: 'Loose Martian dust and rock. Builders pack it into bricks and use it as radiation shielding.',
    warnSols: 0,
    vital: false,
  },
  iron: {
    id: 'iron',
    name: 'Iron',
    unit: 't',
    color: '#a9b4c2',
    description: 'Mars is red because its soil contains iron oxide (rust). Refineries turn it into metal for construction.',
    warnSols: 0,
    vital: false,
  },
  water: {
    id: 'water',
    name: 'Water',
    unit: 'kg',
    color: '#4fb3ff',
    description: 'Mars has water frozen as ice underground and at the poles. We drink it, grow plants with it and split it into oxygen.',
    warnSols: 25,
    vital: true,
  },
  oxygen: {
    id: 'oxygen',
    name: 'Oxygen',
    unit: 'kg',
    color: '#7fe3d4',
    description: 'The Martian air is about 95% carbon dioxide, so we must make oxygen to breathe inside our buildings.',
    warnSols: 25,
    vital: true,
  },
  food: {
    id: 'food',
    name: 'Food',
    unit: 'kg',
    color: '#9ad35a',
    description: 'Grown in greenhouses with plants and chickens. Each colonist eats about 1.8 kg of food per sol.',
    warnSols: 25,
    vital: true,
  },
};

/** Simplified consumption per colonist per sol (game values). */
export const COLONIST_NEEDS_PER_SOL: Record<ResourceId, number> = {
  regolith: 0,
  iron: 0,
  water: 2.0,
  oxygen: 0.84,
  food: 1.8,
};

export const STARTING_RESOURCES: Record<ResourceId, number> = {
  regolith: 400,
  iron: 220,
  water: 1500,
  oxygen: 700,
  food: 450,
};

export const STARTING_COLONISTS = 6;

export function formatAmount(value: number): string {
  const v = Math.max(0, value);
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return Math.floor(v).toString();
  return v.toFixed(v >= 10 ? 0 : 1);
}

export function formatRate(value: number): string {
  if (Math.abs(value) < 0.05) return '±0';
  const sign = value > 0 ? '+' : '−';
  const a = Math.abs(value);
  return `${sign}${a >= 10 ? a.toFixed(0) : a.toFixed(1)}`;
}
