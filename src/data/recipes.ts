import type { ResourceId } from './resources';

/**
 * Production recipes — pure data. A facility runs one cycle of each of its recipes at a
 * time: inputs are taken when the cycle starts, power is drawn while it runs, outputs are
 * delivered when it finishes (see simulation/ProductionManager).
 *
 * Real numbers are kept as named constants with their source; gameplay scaling is applied
 * through separately named multipliers so the science stays visible.
 */

export type RecipeId =
  | 'electrolysis'
  | 'crops'
  | 'chickens'
  | 'ice_mining'
  | 'excavation'
  | 'iron_smelting'
  | 'moxie'
  | 'mega_excavation'
  | 'strip_mining'
  | 'glacier_mining'
  | 'aquifer_pumping';

/** Optional mined deposit a recipe draws from (water ice for now). */
export type DepositId = 'ice';

export interface ProductionRecipe {
  id: RecipeId;
  name: string;
  /** Kid-friendly one-liner shown in the building card. */
  description: string;
  inputs: Partial<Record<ResourceId, number>>;
  outputs: Partial<Record<ResourceId, number>>;
  /** Electrical power drawn while a cycle is running (kW). */
  energyKw: number;
  /** Length of one cycle in sols. */
  durationSols: number;
  /** Each cycle also removes this much (kg) from a deposit. */
  deposit?: { id: DepositId; amount: number };
  /** Only runs while this other recipe of the same building is running (chickens eat crop scraps). */
  requires?: RecipeId;
}

/** One cycle is a quarter of a sol (10 s of real time at 1×). */
const CYCLE = 0.25;
/** Hours in one sol (24 h 39 min 35 s — NASA Mars Fact Sheet). */
export const SOL_HOURS = 24.6597;

// ---------------------------------------------------------------------------
// Science constants
// ---------------------------------------------------------------------------

/**
 * Water electrolysis: 2 H₂O → 2 H₂ + O₂. By mass, 9 kg of water gives 8 kg of oxygen and
 * 1 kg of hydrogen. Practical electrolysers need ≈ 50 kWh per kg of hydrogen
 * (thermodynamic minimum 39.4 kWh/kg, higher heating value).
 */
export const ELECTROLYSIS = { waterPerO2: 9 / 8, h2PerO2: 1 / 8, kwhPerKgH2: 50 };

/**
 * MOXIE (Perseverance, 2021–2023) made 6–12 g of O₂ per hour from CO₂. NASA's full-scale
 * concept for a crewed mission: 2–3 kg O₂ per hour using ≈ 25 kW. Our unit is 1/10 of that.
 */
export const MOXIE_FULL_SCALE = { kgO2PerHour: 2.5, kw: 25 };
export const MOXIE_SCALE = 0.1;

/**
 * Laying hens (estimate, poultry-science averages): ≈ 0.25 L water per hen per day and
 * roughly 0.8 eggs of ≈ 60 g per hen per day. 20 hens live in the starter coop.
 */
export const HENS = { count: 20, waterKgPerDay: 0.25, eggKgPerDay: 0.05 };

/** Mars soil is ≈ 18 % FeO by mass (rover APXS measurements) — refineries sort iron-rich grains first. */
export const REFINERY_YIELD = 0.25;

const o2PerCycle = 2; // kg, electrolysis
const h2PerCycle = o2PerCycle * ELECTROLYSIS.h2PerO2;
const moxieO2PerCycle = MOXIE_FULL_SCALE.kgO2PerHour * MOXIE_SCALE * SOL_HOURS * CYCLE;

export const RECIPES: Record<RecipeId, ProductionRecipe> = {
  electrolysis: {
    id: 'electrolysis',
    name: 'Split water into oxygen',
    description: 'Electricity splits water into oxygen to breathe and hydrogen for later.',
    inputs: { water: o2PerCycle * ELECTROLYSIS.waterPerO2 },
    outputs: { oxygen: o2PerCycle, hydrogen: h2PerCycle },
    // 50 kWh per kg H₂, spread over the cycle: ≈ 2 kW.
    energyKw: (h2PerCycle * ELECTROLYSIS.kwhPerKgH2) / (CYCLE * SOL_HOURS),
    durationSols: CYCLE,
  },
  crops: {
    id: 'crops',
    name: 'Grow vegetables',
    description: 'Plants under grow-lights turn water, light and carbon dioxide into food — and a little oxygen.',
    // Most water the plants breathe out is caught again; this is what ends up inside the food.
    inputs: { water: 0.75 },
    outputs: { food: 3.5, oxygen: 0.25 },
    energyKw: 8, // LED grow-lights and heating (game estimate)
    durationSols: CYCLE,
  },
  chickens: {
    id: 'chickens',
    name: 'Chicken coop',
    description: 'Twenty hens live safely inside the greenhouse. They eat plant scraps, drink water and lay eggs.',
    inputs: { water: HENS.count * HENS.waterKgPerDay * CYCLE },
    outputs: { food: HENS.count * HENS.eggKgPerDay * CYCLE },
    energyKw: 0.5, // warm lamps and fresh air for the coop (estimate)
    durationSols: CYCLE,
    requires: 'crops',
  },
  ice_mining: {
    id: 'ice_mining',
    name: 'Mine ground ice',
    description: 'Drills into buried ice, melts it and cleans the water.',
    inputs: {},
    outputs: { water: 6 },
    energyKw: 3, // drilling, plus melting ice (334 kJ/kg) and warming it (game estimate)
    durationSols: CYCLE,
    deposit: { id: 'ice', amount: 6 },
  },
  excavation: {
    id: 'excavation',
    name: 'Dig regolith',
    description: 'Robot diggers scoop up loose Martian soil.',
    inputs: {},
    outputs: { regolith: 6 },
    energyKw: 4,
    durationSols: CYCLE,
  },
  iron_smelting: {
    id: 'iron_smelting',
    name: 'Smelt iron',
    description: 'A hot furnace pulls iron out of rusty regolith.',
    inputs: { regolith: 4 },
    outputs: { iron: 4 * REFINERY_YIELD },
    energyKw: 10,
    durationSols: CYCLE,
  },
  moxie: {
    id: 'moxie',
    name: 'Oxygen from the air',
    description: 'Like NASA’s MOXIE on Perseverance: splits carbon dioxide from the Martian air into oxygen.',
    inputs: {},
    outputs: { oxygen: moxieO2PerCycle },
    energyKw: MOXIE_FULL_SCALE.kw * MOXIE_SCALE,
    durationSols: CYCLE,
  },
  // Research mega-buildings (game values): each does one job very well, at a price.
  mega_excavation: {
    id: 'mega_excavation',
    name: 'Bucket-wheel digging',
    description: 'A giant wheel of buckets eats through the ground non-stop.',
    inputs: {},
    outputs: { regolith: 30 },
    energyKw: 22,
    durationSols: CYCLE,
  },
  strip_mining: {
    id: 'strip_mining',
    name: 'Mine hematite',
    description: 'Scrapes up hematite, an iron mineral, and roasts it straight into iron.',
    inputs: {},
    outputs: { iron: 8, regolith: 4 },
    energyKw: 30,
    durationSols: CYCLE,
  },
  glacier_mining: {
    id: 'glacier_mining',
    name: 'Melt glacier ice',
    description: 'Hot water drills melt a cavern into the buried ice and pump the water up.',
    inputs: {},
    outputs: { water: 30 },
    energyKw: 18,
    durationSols: CYCLE,
    deposit: { id: 'ice', amount: 30 },
  },
  aquifer_pumping: {
    id: 'aquifer_pumping',
    name: 'Pump deep groundwater',
    description: 'Lifts warm, salty water from kilometres down and cleans it.',
    inputs: {},
    outputs: { water: 40 },
    energyKw: 45,
    durationSols: CYCLE,
  },
};

/** Net change per sol for one recipe running non-stop. */
export function recipeRatePerSol(r: ProductionRecipe, id: ResourceId): number {
  return ((r.outputs[id] ?? 0) - (r.inputs[id] ?? 0)) / r.durationSols;
}
