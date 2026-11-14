import { storageCapacity, type BuildingType } from '../data/buildings';
import { HOME_REGION_ID, REGIONS } from '../data/regions';
import { STARTING_COLONISTS, STARTING_RESOURCES, emptyResources, type ResourceId } from '../data/resources';
import { DEPOT, SETTLEMENT, STARTING_BUILDINGS } from '../data/settlement';
import { STARTING_ICE_RESERVE } from '../data/missions';
import { HOME_SITE_ID, SITE_BY_ID, sitesIn, startingIce } from '../data/baseSites';
import { footprintRect, rectCenter } from '../settlement/PlacementRules';
import { starterRoads } from '../settlement/RoadRules';
import { patchOffsetToLatLon } from '../planet/terrainGen';
import { PowerManager } from '../simulation/PowerManager';
import { BASE_KEYS, type BaseData, type BaseMeta, type BuildingInstance, type GameState } from './types';

/** Pure constructors for game data (no store, no rendering). */

let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** Lat / lon of a grid position at the home base. */
export function gridToLatLon(x: number, y: number): { lat: number; lon: number } {
  const out = patchOffsetToLatLon(x * SETTLEMENT.cellSize, y * SETTLEMENT.cellSize, [0, 0]);
  return { lat: out[0], lon: out[1] };
}

const DEG = Math.PI / 180;
/** Planet radius in scene units (see planet/constants: R = 100). */
const R_UNITS = 100;

/** Lat / lon of a grid position at a base centred on (lat0, lon0): tangent plane projected onto the sphere. */
export function gridToLatLonAt(lat0: number, lon0: number, x: number, y: number): { lat: number; lon: number } {
  const p = lat0 * DEG;
  const l = lon0 * DEG;
  const up = [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)];
  const east = [Math.cos(l), 0, -Math.sin(l)];
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]];
  const c = SETTLEMENT.cellSize;
  const v = [0, 1, 2].map((i) => up[i] * R_UNITS + east[i] * x * c + north[i] * y * c);
  const len = Math.hypot(v[0], v[1], v[2]);
  const lat = Math.asin(v[1] / len) / DEG;
  const lon = Math.atan2(v[0], v[2]) / DEG;
  return { lat, lon };
}

export function makeBuilding(
  type: BuildingType,
  gridX: number,
  gridY: number,
  rotation: number,
  complete: boolean,
  sol: number,
  origin?: { lat: number; lon: number },
): BuildingInstance {
  const c = rectCenter(footprintRect(type, gridX, gridY, rotation));
  const ll = origin ? gridToLatLonAt(origin.lat, origin.lon, c.x, c.y) : gridToLatLon(c.x, c.y);
  return {
    id: makeId(type),
    type,
    latitude: ll.lat,
    longitude: ll.lon,
    gridX,
    gridY,
    rotation,
    level: 1,
    constructionProgress: complete ? 1 : 0,
    isOperational: complete,
    enabled: true,
    status: complete ? 'operational' : 'under_construction',
    efficiency: complete ? 1 : 0,
    statusNote: null,
    recipes: {},
    powered: complete,
    placedAtSol: sol,
    connected: false,
    stored: {},
  };
}

/** The first base, at Jezero crater. */
export const HOME_BASE: BaseMeta = {
  id: 'base-jezero',
  name: SETTLEMENT.name,
  siteId: HOME_SITE_ID,
  lat: SETTLEMENT.lat,
  lon: SETTLEMENT.lon,
  foundedSol: 0,
};

/** The active base as a stand-alone record (meta + its per-base fields). */
export function activeBaseData(s: GameState): BaseData {
  const out = { ...s.base } as BaseData;
  for (const k of BASE_KEYS) (out as unknown as Record<string, unknown>)[k] = s[k];
  return out;
}

/** State with `data` as the active base (per-base fields copied to the top level). */
export function withActiveBase(s: GameState, data: BaseData, others: BaseData[]): GameState {
  const { id, name, siteId, lat, lon, foundedSol } = data;
  const next = { ...s, base: { id, name, siteId, lat, lon, foundedSol }, otherBases: others } as GameState;
  for (const k of BASE_KEYS) (next as unknown as Record<string, unknown>)[k] = data[k];
  return next;
}

/** Makes another base the active one (null if there is no such base). */
export function switchBase(s: GameState, id: string): GameState | null {
  if (s.base.id === id) return s;
  const target = s.otherBases.find((b) => b.id === id);
  if (!target) return null;
  const others = [activeBaseData(s), ...s.otherBases.filter((b) => b.id !== id)];
  return { ...withActiveBase(s, target, others), selectedBuildingId: null, construction: { ...s.construction, active: false, buildingType: null }, roadMode: false, pipelineMode: false };
}

/** A brand-new base: the convoy's depot, its cargo in storage and the founding crew. */
export function makeNewBase(siteId: string, sol: number, crew: number, cargo: Partial<Record<ResourceId, number>>): BaseData {
  const site = SITE_BY_ID[siteId];
  const origin = { lat: site.lat, lon: site.lon };
  const depot = { ...makeBuilding('storage_depot', DEPOT.gridX, DEPOT.gridY, 0, true, sol, origin), starter: true };
  const buildings = [depot];
  const storage = storageCapacity(buildings);
  const resources = emptyResources();
  for (const [id, v] of Object.entries(cargo) as [ResourceId, number][]) resources[id] = Math.min(storage[id], v);
  return {
    id: makeId('base'),
    name: `${site.name} Base`,
    siteId,
    lat: site.lat,
    lon: site.lon,
    foundedSol: sol,
    resources,
    storage,
    rates: emptyResources(),
    power: { generationKw: 0, demandKw: 0, suppliedKw: 0, avgGenerationKw: 0, plannedDemandKw: 0, batteryKwh: 0, batteryCapacityKwh: 0, sun: 0, unpowered: 0 },
    deposits: { ice: startingIce(siteId, STARTING_ICE_RESERVE) },
    colony: { colonists: crew, housing: 0, growth: 0 },
    buildings,
    roads: [],
  };
}

export function createInitialState(): GameState {
  const discovered: Record<string, boolean> = {};
  for (const r of REGIONS) discovered[r.id] = r.id === HOME_REGION_ID;
  const sitesSeen: Record<string, 1 | 2> = {};
  for (const site of sitesIn(HOME_REGION_ID)) sitesSeen[site.id] = 1;
  sitesSeen[HOME_SITE_ID] = 2;
  const buildings = STARTING_BUILDINGS.map((b) => ({ ...makeBuilding(b.type, b.gridX, b.gridY, b.rotation, true, 0), starter: true }));
  const batteryCapacityKwh = PowerManager.batteryCapacity(buildings);
  return {
    timeSols: 0,
    base: { ...HOME_BASE },
    otherBases: [],
    sitesSeen,
    research: { completed: [], active: null, progress: 0 },
    paused: true,
    speed: 1,
    started: false,
    resources: { ...STARTING_RESOURCES },
    storage: storageCapacity(buildings),
    rates: emptyResources(),
    power: {
      generationKw: 0,
      demandKw: 0,
      suppliedKw: 0,
      avgGenerationKw: PowerManager.averageGeneration(buildings),
      plannedDemandKw: PowerManager.plannedDemand(buildings),
      // Batteries start full: the colony was charged up before the game begins.
      batteryKwh: batteryCapacityKwh,
      batteryCapacityKwh,
      sun: 0,
      unpowered: 0,
    },
    deposits: { ice: STARTING_ICE_RESERVE },
    stats: { produced: emptyResources() },
    colony: { colonists: STARTING_COLONISTS, housing: 0, growth: 0 },
    buildings,
    // The pre-built starting base comes with its access roads already paved.
    roads: starterRoads(buildings),
    roadMode: false,
    pipelineMode: false,
    pipelines: [],
    shipments: [],
    discoveredRegions: discovered,
    exploredRegions: { ...discovered },
    outposts: [],
    selectedBuildingId: null,
    selectedRegionId: null,
    construction: { active: false, buildingType: null, rotation: 0 },
    progression: { level: 1, xp: 0, milestones: [] },
    missions: [],
    alerts: [],
    activePanel: null,
  };
}
