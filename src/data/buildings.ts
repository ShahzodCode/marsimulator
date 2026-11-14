import type { ResourceId } from './resources';

/**
 * Building definitions — pure data, completely separate from rendering.
 * Footprints are in settlement grid cells (x = east, y = north) for rotation 0.
 * Production / consumption values are per sol (simplified game balance).
 */

export type BuildingType =
  | 'habitat'
  | 'solar_farm'
  | 'life_support'
  | 'greenhouse'
  | 'regolith_excavator'
  | 'iron_refinery'
  | 'ice_drill'
  | 'storage_depot';

export type BuildingCategory = 'living' | 'energy' | 'life_support' | 'food' | 'industry' | 'storage';

export interface BuildingDefinition {
  id: BuildingType;
  name: string;
  shortName: string;
  description: string;
  funFact: string;
  icon: string;
  /** Key of the procedural model factory used by the renderer. */
  model: BuildingType;
  category: BuildingCategory;
  constructionCost: Partial<Record<ResourceId, number>>;
  /** Construction time in sols. */
  buildTimeSols: number;
  footprint: { width: number; height: number };
  /** kW: positive = generation, negative = consumption. */
  energy: number;
  production: Partial<Record<ResourceId, number>>;
  consumption: Partial<Record<ResourceId, number>>;
  housing: number;
  /** How much of each resource this building can hold for the whole colony. */
  storage: Partial<Record<ResourceId, number>>;
  /** Shown in the construction menu. */
  buildable: boolean;
}

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  habitat: {
    id: 'habitat',
    name: 'Habitat Dome',
    shortName: 'Habitat',
    description: 'A pressurised home where colonists sleep, eat, study and relax. Thick walls protect them from radiation and the cold.',
    funFact: 'Mars has no global magnetic field, so habitats need extra shielding — regolith piled on top works well!',
    icon: '🏠',
    model: 'habitat',
    category: 'living',
    constructionCost: { regolith: 150, iron: 90 },
    buildTimeSols: 1.0,
    footprint: { width: 8, height: 8 },
    energy: -8,
    production: {},
    consumption: {},
    housing: 6,
    storage: {},
    buildable: true,
  },
  solar_farm: {
    id: 'solar_farm',
    name: 'Solar Farm',
    shortName: 'Solar',
    description: 'Rows of solar panels that turn sunlight into electricity for the whole settlement.',
    funFact: 'Mars is farther from the Sun than Earth, so sunlight there is a bit less than half as strong.',
    icon: '☀️',
    model: 'solar_farm',
    category: 'energy',
    constructionCost: { iron: 60, regolith: 30 },
    buildTimeSols: 0.6,
    footprint: { width: 10, height: 7 },
    energy: 40,
    production: {},
    consumption: {},
    housing: 0,
    storage: {},
    buildable: true,
  },
  life_support: {
    id: 'life_support',
    name: 'Life-Support Plant',
    shortName: 'Life Support',
    description: 'Cleans and recycles water and makes breathable oxygen by splitting water molecules with electricity.',
    funFact: 'Splitting 9 kg of water gives about 8 kg of oxygen and 1 kg of hydrogen.',
    icon: '💨',
    model: 'life_support',
    category: 'life_support',
    constructionCost: { iron: 80, regolith: 40 },
    buildTimeSols: 0.8,
    footprint: { width: 6, height: 6 },
    energy: -12,
    production: { oxygen: 6, water: 9 },
    consumption: {},
    housing: 0,
    storage: {},
    buildable: true,
  },
  greenhouse: {
    id: 'greenhouse',
    name: 'Greenhouse & Chicken Coop',
    shortName: 'Greenhouse',
    description: 'A sealed, heated greenhouse with crops under grow-lights and a protected coop where chickens lay eggs.',
    funFact: 'Plants and animals can’t survive outside on Mars — the air is too thin and cold — so everything lives inside.',
    icon: '🌱',
    model: 'greenhouse',
    category: 'food',
    constructionCost: { regolith: 80, iron: 50, water: 60 },
    buildTimeSols: 0.8,
    footprint: { width: 10, height: 6 },
    energy: -10,
    production: { food: 12, oxygen: 1.5 },
    consumption: { water: 3 },
    housing: 0,
    storage: {},
    buildable: true,
  },
  regolith_excavator: {
    id: 'regolith_excavator',
    name: 'Regolith Excavator',
    shortName: 'Excavator',
    description: 'Robotic diggers that scoop up Martian soil and sort it for building materials.',
    funFact: 'Martian regolith is very fine and sticky — dust storms can cover whole regions for weeks.',
    icon: '⛏️',
    model: 'regolith_excavator',
    category: 'industry',
    constructionCost: { iron: 40 },
    buildTimeSols: 0.5,
    footprint: { width: 6, height: 6 },
    energy: -6,
    production: { regolith: 24 },
    consumption: {},
    housing: 0,
    storage: {},
    buildable: true,
  },
  iron_refinery: {
    id: 'iron_refinery',
    name: 'Iron Refinery',
    shortName: 'Refinery',
    description: 'A hot furnace that pulls iron out of rusty regolith so we can build more structures.',
    funFact: 'Iron oxide in the dust is what gives Mars its famous red colour.',
    icon: '🔩',
    model: 'iron_refinery',
    category: 'industry',
    constructionCost: { regolith: 60, iron: 30 },
    buildTimeSols: 0.7,
    footprint: { width: 6, height: 6 },
    energy: -14,
    production: { iron: 6 },
    consumption: { regolith: 16 },
    housing: 0,
    storage: {},
    buildable: true,
  },
  ice_drill: {
    id: 'ice_drill',
    name: 'Ice Drill',
    shortName: 'Ice Drill',
    description: 'Drills down to frozen ground ice, melts it and pumps clean water to the colony.',
    funFact: 'Orbiting spacecraft have found ice buried just below the surface in many places on Mars.',
    icon: '🧊',
    model: 'ice_drill',
    category: 'life_support',
    constructionCost: { iron: 50, regolith: 20 },
    buildTimeSols: 0.6,
    footprint: { width: 5, height: 5 },
    energy: -10,
    production: { water: 14 },
    consumption: {},
    housing: 0,
    storage: {},
    buildable: true,
  },
  storage_depot: {
    id: 'storage_depot',
    name: 'Central Storage Depot',
    shortName: 'Storage',
    description: 'The heart of the base. Every road starts here, and everything the colony makes is stored here — but only up to its limit, so watch the bars!',
    funFact: 'Water and oxygen are kept in pressurised tanks, because in Mars’s thin, cold air water would boil away or freeze.',
    icon: '📦',
    model: 'storage_depot',
    category: 'storage',
    constructionCost: {},
    buildTimeSols: 0,
    footprint: { width: 6, height: 6 },
    energy: 0,
    production: {},
    consumption: {},
    housing: 0,
    storage: { regolith: 1500, iron: 800, water: 4000, oxygen: 2000, food: 1500 },
    // There is one depot, at the centre of the base: it cannot be built again.
    buildable: false,
  },
};

export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];

/** Footprint after applying a 90° rotation step (0..3). */
export function rotatedFootprint(type: BuildingType, rotation: number): { width: number; height: number } {
  const fp = BUILDINGS[type].footprint;
  return rotation % 2 === 1 ? { width: fp.height, height: fp.width } : { ...fp };
}

/** Total amount of each resource the colony can hold (sum over working storage buildings). */
export function storageCapacity(buildings: readonly { type: BuildingType; isOperational: boolean }[]): Record<ResourceId, number> {
  const cap: Record<ResourceId, number> = { regolith: 0, iron: 0, water: 0, oxygen: 0, food: 0 };
  for (const b of buildings) {
    if (!b.isOperational) continue;
    for (const [id, v] of Object.entries(BUILDINGS[b.type].storage) as [ResourceId, number][]) cap[id] += v;
  }
  return cap;
}
