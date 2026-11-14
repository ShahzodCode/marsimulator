/**
 * Material resource definitions.
 *
 * Material resources live in one global inventory for now (Stage 2). Electricity is NOT a
 * material: it is a flow (kW) plus stored battery energy (kWh), handled by PowerManager.
 *
 * Crew needs come from NASA's Life Support Baseline Values and Assumptions Document
 * (BVAD, NASA/TP-2015-218570 Rev2, 2022), crew consumables tables:
 *   - metabolic oxygen ≈ 0.84 kg per crew-member per day
 *   - potable water ≈ 2.5 kg + hygiene water ≈ 0.4 kg per crew-member per day
 *   - food ≈ 1.7–2.4 kg per crew-member per day as shipped (depends on hydration); 1.8 used here
 * Water recovery: NASA reported 98 % total water recovery on the ISS in June 2023
 * (Water Recovery System + Brine Processor Assembly).
 */

export type ResourceId = 'regolith' | 'iron' | 'water' | 'oxygen' | 'food' | 'hydrogen';

export const RESOURCE_IDS: ResourceId[] = ['regolith', 'iron', 'water', 'oxygen', 'food', 'hydrogen'];

/** How a resource would physically move once logistics exist (Stage 3). Electricity is never here. */
export type TransportKind = 'solid' | 'fluid';

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
  /** Shown as a chip in the top bar. */
  hud: boolean;
  /** Pipes (fluid) or conveyors / cargo rovers (solid) in a later stage. */
  transport: TransportKind;
  /**
   * A byproduct that is safely released when its tanks are full, so it never blocks the
   * process that makes it (hydrogen from electrolysis).
   */
  ventWhenFull?: boolean;
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
    hud: true,
    transport: 'solid',
  },
  iron: {
    id: 'iron',
    name: 'Iron',
    unit: 't',
    color: '#a9b4c2',
    description: 'Mars is red because its soil contains iron oxide (rust). Refineries turn it into metal for construction.',
    warnSols: 0,
    vital: false,
    hud: true,
    transport: 'solid',
  },
  water: {
    id: 'water',
    name: 'Water',
    unit: 'kg',
    color: '#4fb3ff',
    description: 'Mars has water frozen as ice underground and at the poles. We drink it, grow plants with it and split it into oxygen.',
    warnSols: 25,
    vital: true,
    hud: true,
    transport: 'fluid',
  },
  oxygen: {
    id: 'oxygen',
    name: 'Oxygen',
    unit: 'kg',
    color: '#7fe3d4',
    description: 'The Martian air is about 95% carbon dioxide, so we must make oxygen to breathe inside our buildings.',
    warnSols: 25,
    vital: true,
    hud: true,
    transport: 'fluid',
  },
  food: {
    id: 'food',
    name: 'Food',
    unit: 'kg',
    color: '#9ad35a',
    description: 'Grown in the greenhouse — vegetables from the plants and eggs from the chickens. Each colonist eats about 1.8 kg of food per sol.',
    warnSols: 25,
    vital: true,
    hud: true,
    transport: 'solid',
  },
  hydrogen: {
    id: 'hydrogen',
    name: 'Hydrogen',
    unit: 'kg',
    color: '#c9b8ff',
    description: 'Left over when water is split into oxygen. It is kept in tanks for future rocket fuel — when the tanks are full, the extra is safely let out.',
    warnSols: 0,
    vital: false,
    hud: false,
    transport: 'fluid',
    ventWhenFull: true,
  },
};

/** Per-colonist needs per sol before recycling (BVAD Rev2 values, see header). */
export const COLONIST_NEEDS_PER_SOL: Record<ResourceId, number> = {
  regolith: 0,
  iron: 0,
  water: 2.9,
  oxygen: 0.84,
  food: 1.8,
  hydrogen: 0,
};

/** Share of used water the life-support plant recovers (ISS 2023: 98 %). Only while it is powered. */
export const WATER_RECOVERY = 0.98;

/**
 * Starting stock: roughly two months of food, water and oxygen in reserve, plus enough
 * materials for two or three new buildings. Chosen so the starter base runs a surplus
 * of every vital resource from sol 1 (checked by the "starting settlement" test).
 */
export const STARTING_RESOURCES: Record<ResourceId, number> = {
  regolith: 400,
  iron: 240,
  water: 1500,
  oxygen: 700,
  food: 600,
  hydrogen: 0,
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

/** Empty resource record (all zero). */
export function emptyResources(): Record<ResourceId, number> {
  return { regolith: 0, iron: 0, water: 0, oxygen: 0, food: 0, hydrogen: 0 };
}
