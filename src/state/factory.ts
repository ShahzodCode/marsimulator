import { storageCapacity, type BuildingType } from '../data/buildings';
import { HOME_REGION_ID, REGIONS } from '../data/regions';
import { STARTING_COLONISTS, STARTING_RESOURCES, emptyResources } from '../data/resources';
import { SETTLEMENT, STARTING_BUILDINGS } from '../data/settlement';
import { STARTING_ICE_RESERVE } from '../data/missions';
import { footprintRect, rectCenter } from '../settlement/PlacementRules';
import { starterRoads } from '../settlement/RoadRules';
import { patchOffsetToLatLon } from '../planet/terrainGen';
import { PowerManager } from '../simulation/PowerManager';
import type { BuildingInstance, GameState } from './types';

/** Pure constructors for game data (no store, no rendering). */

let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** Lat / lon of a grid position. */
export function gridToLatLon(x: number, y: number): { lat: number; lon: number } {
  const out = patchOffsetToLatLon(x * SETTLEMENT.cellSize, y * SETTLEMENT.cellSize, [0, 0]);
  return { lat: out[0], lon: out[1] };
}

export function makeBuilding(type: BuildingType, gridX: number, gridY: number, rotation: number, complete: boolean, sol: number): BuildingInstance {
  const c = rectCenter(footprintRect(type, gridX, gridY, rotation));
  const ll = gridToLatLon(c.x, c.y);
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

export function createInitialState(): GameState {
  const discovered: Record<string, boolean> = {};
  for (const r of REGIONS) discovered[r.id] = r.id === HOME_REGION_ID;
  const buildings = STARTING_BUILDINGS.map((b) => ({ ...makeBuilding(b.type, b.gridX, b.gridY, b.rotation, true, 0), starter: true }));
  const batteryCapacityKwh = PowerManager.batteryCapacity(buildings);
  return {
    timeSols: 0,
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
    colony: { colonists: STARTING_COLONISTS, housing: 0 },
    buildings,
    // The pre-built starting base comes with its access roads already paved.
    roads: starterRoads(buildings),
    roadMode: false,
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
