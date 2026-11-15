import type { ResourceId } from './resources';
import { RECIPES, type RecipeId } from './recipes';
import { POWER_PRIORITY, SOLAR_FARM_PEAK_KW } from './power';
import type { RankId } from './progression';
import type { TechId } from './research';
import type { TraitId } from './baseSites';

/**
 * Building definitions — pure data, completely separate from rendering.
 * Footprints are in settlement grid cells (x = east, y = north) for rotation 0.
 * What a building makes is described by its recipes (data/recipes.ts).
 */

export type BuildingType =
  | 'habitat'
  | 'solar_farm'
  | 'life_support'
  | 'greenhouse'
  | 'regolith_excavator'
  | 'iron_refinery'
  | 'ice_drill'
  | 'storage_depot'
  | 'battery_bank'
  | 'moxie_unit'
  | 'storage_silo'
  | 'research_lab'
  | 'fission_reactor'
  | 'megadigger'
  | 'strip_mine'
  | 'glacier_mine'
  | 'deep_aquifer_drill'
  | 'big_dome'
  | 'lava_habitat'
  | 'pump_station'
  | 'cargo_garage';

export type BuildingCategory = 'living' | 'energy' | 'life_support' | 'food' | 'industry' | 'storage';

export interface BuildingDefinition {
  id: BuildingType;
  name: string;
  shortName: string;
  description: string;
  funFact: string;
  /** Key of the procedural model factory used by the renderer. */
  model: BuildingType;
  category: BuildingCategory;
  constructionCost: Partial<Record<ResourceId, number>>;
  /** Construction time in sols. */
  buildTimeSols: number;
  footprint: { width: number; height: number };
  /** Electricity the building always needs while switched on (kW) — heating, air, lights. */
  basePowerKw: number;
  /** Solar output at noon (kW). */
  solarPeakKw: number;
  /** Battery storage (kWh). */
  batteryKwh: number;
  /** Production recipes this facility runs (all at once). */
  recipes: RecipeId[];
  /** Who gets electricity first when there is not enough (lower = first). */
  powerPriority: number;
  housing: number;
  /** How much of each resource this building can hold for the whole colony. */
  storage: Partial<Record<ResourceId, number>>;
  /** Shown in the construction menu. */
  buildable: boolean;
  /** Rank needed before it appears in the construction menu (data/progression.ts). */
  unlockRank?: RankId;
  /** Research needed before it can be built (data/research.ts). */
  requiresTech?: TechId;
  /** Can only be built at a base whose site has one of these traits (data/baseSites.ts). */
  requiresTrait?: TraitId[];
  /** Steady electricity, day and night, whatever the weather (kW). */
  steadyKw?: number;
  /** Research points per sol while powered. */
  researchPerSol?: number;
  /** Each working one makes the base's solar panels dustier (multiplier on solar). */
  dustSolar?: number;
  /** Shown as the downside in the build menu. */
  con?: string;
}

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  habitat: {
    id: 'habitat',
    name: 'Habitat Dome',
    shortName: 'Habitat',
    description: 'A pressurised home where colonists sleep, eat, study and relax. Thick walls protect them from radiation and the cold.',
    funFact: 'Mars has no global magnetic field, so habitats need extra shielding — regolith piled on top works well!',
    model: 'habitat',
    category: 'living',
    constructionCost: { regolith: 150, iron: 90 },
    buildTimeSols: 1.0,
    footprint: { width: 8, height: 8 },
    basePowerKw: 5,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 6,
    storage: {},
    buildable: true,
  },
  solar_farm: {
    id: 'solar_farm',
    name: 'Solar Farm',
    shortName: 'Solar',
    description: 'Rows of solar panels that turn sunlight into electricity, with batteries that keep the lights on at night.',
    funFact: 'Mars is farther from the Sun than Earth, so sunlight there is a bit less than half as strong.',
    model: 'solar_farm',
    category: 'energy',
    constructionCost: { iron: 60, regolith: 30 },
    buildTimeSols: 0.6,
    footprint: { width: 10, height: 7 },
    basePowerKw: 0,
    solarPeakKw: SOLAR_FARM_PEAK_KW,
    batteryKwh: 300,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 0,
    storage: {},
    buildable: true,
  },
  life_support: {
    id: 'life_support',
    name: 'Life-Support Plant',
    shortName: 'Life Support',
    description: 'Recycles almost all the water the crew uses and makes breathable oxygen by splitting water with electricity.',
    funFact: 'Splitting 9 kg of water gives about 8 kg of oxygen and 1 kg of hydrogen.',
    model: 'life_support',
    category: 'life_support',
    constructionCost: { iron: 80, regolith: 40 },
    buildTimeSols: 0.8,
    footprint: { width: 6, height: 6 },
    basePowerKw: 1,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['electrolysis'],
    powerPriority: POWER_PRIORITY.lifeSupport,
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
    model: 'greenhouse',
    category: 'food',
    constructionCost: { regolith: 80, iron: 50, water: 60 },
    buildTimeSols: 0.8,
    footprint: { width: 10, height: 6 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['crops', 'chickens'],
    powerPriority: POWER_PRIORITY.food,
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
    model: 'regolith_excavator',
    category: 'industry',
    constructionCost: { iron: 40 },
    buildTimeSols: 0.5,
    footprint: { width: 6, height: 6 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['excavation'],
    powerPriority: POWER_PRIORITY.industry,
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
    model: 'iron_refinery',
    category: 'industry',
    constructionCost: { regolith: 60, iron: 30 },
    buildTimeSols: 0.7,
    footprint: { width: 6, height: 6 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['iron_smelting'],
    powerPriority: POWER_PRIORITY.industry,
    housing: 0,
    storage: {},
    buildable: true,
  },
  ice_drill: {
    id: 'ice_drill',
    name: 'Ice Drill',
    shortName: 'Ice Drill',
    description: 'Drills down to buried ice, melts it and pumps clean water to the colony. Exploring icy regions finds more ice to mine.',
    funFact: 'Orbiting spacecraft have found ice buried just below the surface in many places on Mars.',
    model: 'ice_drill',
    category: 'life_support',
    constructionCost: { iron: 50, regolith: 20 },
    buildTimeSols: 0.6,
    footprint: { width: 5, height: 5 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['ice_mining'],
    powerPriority: POWER_PRIORITY.water,
    housing: 0,
    storage: {},
    buildable: true,
  },
  storage_depot: {
    id: 'storage_depot',
    name: 'Central Storage Depot',
    shortName: 'Storage',
    description: 'The heart of the base. Every road starts here, and everything the colony makes is stored here — but only up to its limit, so watch the bars! Its maintenance robots also sweep up a little regolith and iron every few sols, so you can always build again.',
    funFact: 'Water and oxygen are kept in pressurised tanks, because in Mars’s thin, cold air water would boil away or freeze.',
    model: 'storage_depot',
    category: 'storage',
    constructionCost: {},
    buildTimeSols: 0,
    footprint: { width: 6, height: 6 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 0,
    storage: { regolith: 1500, iron: 800, water: 4000, oxygen: 2000, food: 1500, hydrogen: 300 },
    // There is one depot, at the centre of the base: it cannot be built again.
    buildable: false,
  },
  battery_bank: {
    id: 'battery_bank',
    name: 'Battery Bank',
    shortName: 'Battery',
    description: 'Big rechargeable batteries. They fill up with spare solar power during the day and keep everything running through the night.',
    funFact: 'A Martian night lasts about 12 hours, and it gets colder than −70 °C — so night-time power really matters!',
    model: 'battery_bank',
    category: 'energy',
    constructionCost: { iron: 70, regolith: 20 },
    buildTimeSols: 0.5,
    footprint: { width: 4, height: 4 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 600,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 0,
    storage: {},
    buildable: true,
    unlockRank: 'mars_engineer',
  },
  moxie_unit: {
    id: 'moxie_unit',
    name: 'MOXIE Oxygen Maker',
    shortName: 'MOXIE',
    description: 'Breathes in the thin Martian air (mostly carbon dioxide) and splits it to make oxygen — no water needed!',
    funFact: 'NASA’s MOXIE, a toaster-sized experiment on the Perseverance rover, made the first oxygen ever produced on another planet in April 2021.',
    model: 'moxie_unit',
    category: 'life_support',
    constructionCost: { iron: 90, regolith: 30 },
    buildTimeSols: 0.8,
    footprint: { width: 4, height: 4 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['moxie'],
    powerPriority: POWER_PRIORITY.lifeSupport,
    housing: 0,
    storage: {},
    buildable: true,
    unlockRank: 'mars_engineer',
  },
  storage_silo: {
    id: 'storage_silo',
    name: 'Storage Silo & Tanks',
    shortName: 'Silo',
    description: 'Extra bins for regolith, iron and food, plus pressurised tanks for water, oxygen and hydrogen. Build one when the depot gets full.',
    funFact: 'Tanks on Mars are kept warm — otherwise the water inside would freeze solid.',
    model: 'storage_silo',
    category: 'storage',
    constructionCost: { regolith: 120, iron: 40 },
    buildTimeSols: 0.6,
    footprint: { width: 5, height: 5 },
    basePowerKw: 0.5,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 0,
    storage: { regolith: 1000, iron: 500, water: 2000, oxygen: 1000, food: 800, hydrogen: 200 },
    buildable: true,
    unlockRank: 'astronaut_candidate',
  },
  research_lab: {
    id: 'research_lab',
    name: 'Research Lab',
    shortName: 'Lab',
    description: 'Scientists test samples, build prototypes and invent new machines. Pick projects in the Research panel.',
    funFact: 'Curiosity carries a whole chemistry lab in its belly: SAM can bake rock samples and sniff the gases that come out.',
    model: 'research_lab',
    category: 'living',
    constructionCost: { iron: 120, regolith: 80 },
    buildTimeSols: 1.5,
    footprint: { width: 7, height: 6 },
    basePowerKw: 6,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.industry,
    housing: 0,
    storage: {},
    buildable: true,
    unlockRank: 'settlement_commander',
    researchPerSol: 12,
  },
  fission_reactor: {
    id: 'fission_reactor',
    name: 'Compact Fission Reactor',
    shortName: 'Reactor',
    description: 'Four small nuclear reactors give steady electricity day and night — even in the worst dust storm.',
    funFact: 'NASA tested a small space reactor called KRUSTY in 2018. Its plans for Mars use several 10 kW units side by side.',
    model: 'fission_reactor',
    category: 'energy',
    constructionCost: { iron: 400, regolith: 300 },
    buildTimeSols: 8,
    footprint: { width: 6, height: 6 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 0,
    storage: {},
    buildable: true,
    requiresTech: 'fission',
    steadyKw: 40,
    con: 'Very expensive and 8 sols to build',
  },
  megadigger: {
    id: 'megadigger',
    name: 'Bucket-Wheel Megadigger',
    shortName: 'Megadigger',
    description: 'A huge bucket wheel that digs five times faster than an excavator.',
    funFact: 'The biggest bucket-wheel excavators on Earth are taller than a 20-storey building.',
    model: 'megadigger',
    category: 'industry',
    constructionCost: { iron: 220, regolith: 60 },
    buildTimeSols: 6,
    footprint: { width: 8, height: 8 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['mega_excavation'],
    powerPriority: POWER_PRIORITY.industry,
    housing: 0,
    storage: {},
    buildable: true,
    requiresTech: 'megadigger',
    dustSolar: 0.9,
    con: 'Kicks up dust: −10% solar at this base · uses 22 kW',
  },
  strip_mine: {
    id: 'strip_mine',
    name: 'Hematite Strip Mine',
    shortName: 'Strip Mine',
    description: 'Scrapes up hematite and roasts it straight into iron — no refinery needed.',
    funFact: 'Hematite is the same iron ore that steel mills on Earth use.',
    model: 'strip_mine',
    category: 'industry',
    constructionCost: { iron: 260, regolith: 100 },
    buildTimeSols: 8,
    footprint: { width: 9, height: 9 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['strip_mining'],
    powerPriority: POWER_PRIORITY.industry,
    housing: 0,
    storage: {},
    buildable: true,
    requiresTech: 'strip_mine',
    requiresTrait: ['hematite'],
    dustSolar: 0.92,
    con: 'Only on a hematite field · 30 kW · dusty',
  },
  glacier_mine: {
    id: 'glacier_mine',
    name: 'Glacier Mine',
    shortName: 'Glacier Mine',
    description: 'Melts a cavern into buried ice and pumps up five times as much water as an ice drill.',
    funFact: 'This trick is real: the South Pole station on Earth gets its water from a well melted into the ice, called a Rodriguez well.',
    model: 'glacier_mine',
    category: 'life_support',
    constructionCost: { iron: 240, regolith: 80 },
    buildTimeSols: 7,
    footprint: { width: 7, height: 7 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['glacier_mining'],
    powerPriority: POWER_PRIORITY.water,
    housing: 0,
    storage: {},
    buildable: true,
    requiresTech: 'glacier_mine',
    requiresTrait: ['ice_cap', 'buried_glacier', 'ground_ice'],
    con: 'Only on icy sites · 18 kW · empties the ice reserve fast',
  },
  deep_aquifer_drill: {
    id: 'deep_aquifer_drill',
    name: 'Deep Aquifer Drill',
    shortName: 'Aquifer Drill',
    description: 'Future technology: a drill string more than 11 km long reaches water-soaked rock deep in the crust. It never runs dry.',
    funFact: 'The deepest hole ever drilled on Earth, the Kola Superdeep Borehole, is 12.2 km deep and took about 20 years.',
    model: 'deep_aquifer_drill',
    category: 'life_support',
    constructionCost: { iron: 900, regolith: 400 },
    buildTimeSols: 20,
    footprint: { width: 8, height: 8 },
    basePowerKw: 0,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: ['aquifer_pumping'],
    powerPriority: POWER_PRIORITY.water,
    housing: 0,
    storage: {},
    buildable: true,
    requiresTech: 'deep_aquifer',
    requiresTrait: ['deep_water'],
    con: 'Enormous cost · 20 sols to build · 45 kW',
  },
  big_dome: {
    id: 'big_dome',
    name: 'Big Dome',
    shortName: 'Big Dome',
    description: 'A huge habitat with gardens inside and beds for 18 people. Empty beds make families grow faster.',
    funFact: 'Thin Martian air pushes back almost nothing, so a big dome has to be built like a pressure tank.',
    model: 'big_dome',
    category: 'living',
    constructionCost: { regolith: 420, iron: 220 },
    buildTimeSols: 5,
    footprint: { width: 12, height: 12 },
    basePowerKw: 14,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 18,
    storage: {},
    buildable: true,
    requiresTech: 'big_dome',
    con: 'Needs 14 kW for heating and air',
  },
  lava_habitat: {
    id: 'lava_habitat',
    name: 'Lava-Tube Habitat',
    shortName: 'Lava Tube',
    description: 'Homes built inside a natural lava cave. Metres of rock overhead keep out radiation, cold and dust.',
    funFact: 'Martian lava tubes may be much wider than Earth’s, because the low gravity lets caves grow bigger without collapsing.',
    model: 'lava_habitat',
    category: 'living',
    constructionCost: { regolith: 200, iron: 300 },
    buildTimeSols: 10,
    footprint: { width: 10, height: 10 },
    basePowerKw: 8,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.living,
    housing: 30,
    storage: {},
    buildable: true,
    requiresTech: 'lava_habitat',
    requiresTrait: ['lava_tube'],
    con: 'Only at a lava-tube cave · 10 sols to build',
  },
  pump_station: {
    id: 'pump_station',
    name: 'Pipeline Pump Station',
    shortName: 'Pump',
    description: 'Pumps goods into a pipeline to another base and takes in what comes back. Bases joined by a working pipeline share everything: they even each other out, and when one base is short of building materials the other sends them over.',
    funFact: 'The Trans-Alaska Pipeline is 1,287 km long, and more than half of it runs above the ground on stilts because the ground is frozen. Mars ground is frozen too!',
    model: 'pump_station',
    category: 'storage',
    constructionCost: { iron: 70, regolith: 40 },
    buildTimeSols: 0.8,
    footprint: { width: 4, height: 4 },
    basePowerKw: 4,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.industry,
    housing: 0,
    storage: {},
    buildable: true,
    unlockRank: 'rover_pilot',
    con: 'Needs a Pump Station at the other base too',
  },
  cargo_garage: {
    id: 'cargo_garage',
    name: 'Cargo Hauler Garage',
    shortName: 'Garage',
    description: 'Home of three big robotic cargo haulers. Drag the arrow from the garage onto another base, choose what to load, and the haulers drive it there and come back.',
    funFact: 'NASA’s ATHLETE robot has six legs with a wheel on each. It was designed to carry heavy cargo, even whole habitats, across the Moon.',
    model: 'cargo_garage',
    category: 'storage',
    constructionCost: { iron: 110, regolith: 60 },
    buildTimeSols: 1.0,
    footprint: { width: 7, height: 6 },
    basePowerKw: 3,
    solarPeakKw: 0,
    batteryKwh: 0,
    recipes: [],
    powerPriority: POWER_PRIORITY.industry,
    housing: 0,
    storage: {},
    buildable: true,
    unlockRank: 'rover_pilot',
  },
};

export const BUILDING_TYPES = Object.keys(BUILDINGS) as BuildingType[];

/**
 * Safety net (gameplay, not science): the depot's maintenance robots scavenge a small
 * amount of material on a fixed schedule, so a colony that has spent everything can
 * still save up for a new building — there is never a dead end.
 */
export const DEPOT_SUPPLY = {
  everySols: 2,
  amounts: { regolith: 10, iron: 5 } as Partial<Record<ResourceId, number>>,
};

/** Share of the construction cost returned when a building is demolished (energy is never refunded). */
export const DEMOLISH_REFUND = 0.5;

/** Resources returned for demolishing a building of this type. */
export function demolishRefund(type: BuildingType): Partial<Record<ResourceId, number>> {
  const out: Partial<Record<ResourceId, number>> = {};
  for (const [id, v] of Object.entries(BUILDINGS[type].constructionCost) as [ResourceId, number][]) {
    const r = Math.floor(v * DEMOLISH_REFUND);
    if (r > 0) out[id] = r;
  }
  return out;
}

/** Footprint after applying a 90° rotation step (0..3). */
export function rotatedFootprint(type: BuildingType, rotation: number): { width: number; height: number } {
  const fp = BUILDINGS[type].footprint;
  return rotation % 2 === 1 ? { width: fp.height, height: fp.width } : { ...fp };
}

/** Total amount of each resource the colony can hold (sum over working storage buildings). */
export function storageCapacity(buildings: readonly { type: BuildingType; isOperational: boolean }[]): Record<ResourceId, number> {
  const cap: Record<ResourceId, number> = { regolith: 0, iron: 0, water: 0, oxygen: 0, food: 0, hydrogen: 0 };
  for (const b of buildings) {
    if (!b.isOperational) continue;
    for (const [id, v] of Object.entries(BUILDINGS[b.type].storage) as [ResourceId, number][]) cap[id] += v;
  }
  return cap;
}

/** Heating and air scale with the site's cold (living, food and life-support buildings). */
export function basePowerKw(type: BuildingType, heating = 1): number {
  const def = BUILDINGS[type];
  const heated = def.category === 'living' || def.category === 'food' || def.category === 'life_support';
  return def.basePowerKw * (heated ? heating : 1);
}

/** Most power the building can draw when everything in it runs (kW). */
export function maxPowerKw(type: BuildingType, heating = 1): number {
  const def = BUILDINGS[type];
  return basePowerKw(type, heating) + def.recipes.reduce((sum, r) => sum + RECIPES[r].energyKw, 0);
}
