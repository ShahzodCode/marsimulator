import { createStore } from 'zustand/vanilla';
import { BUILDINGS, storageCapacity, type BuildingType } from '../data/buildings';
import { REGIONS, HOME_REGION_ID } from '../data/regions';
import { STARTING_COLONISTS, STARTING_RESOURCES, type ResourceId } from '../data/resources';
import { SETTLEMENT, STARTING_BUILDINGS } from '../data/settlement';
import { SURVEY, levelForXp } from '../data/progression';
import { ResourceManager } from '../simulation/ResourceManager';
import { checkPlacement, footprintRect, rectCenter, PROBLEM_TEXT } from '../settlement/PlacementRules';
import { ROAD_COST, ROAD_PROBLEM_TEXT, canRemoveRoad, checkRoad, roadKey, starterRoads } from '../settlement/RoadRules';
import { patchOffsetToLatLon } from '../planet/terrainGen';
import { RegionManager } from '../planet/RegionManager';
import type { Alert, BuildingInstance, GameState, Mission, PanelId, SimSpeed } from './types';

export const regionManager = new RegionManager();

let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** Lat / lon of a grid position (pure — no rendering needed). */
export function gridToLatLon(x: number, y: number): { lat: number; lon: number } {
  const out = patchOffsetToLatLon(x * SETTLEMENT.cellSize, y * SETTLEMENT.cellSize, [0, 0]);
  return { lat: out[0], lon: out[1] };
}

function makeBuilding(type: BuildingType, gridX: number, gridY: number, rotation: number, complete: boolean, sol: number): BuildingInstance {
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
    efficiency: complete ? 1 : 0,
    statusNote: complete ? null : 'Under construction',
    placedAtSol: sol,
    connected: false,
    stored: {},
  };
}

/** Cached Set view of the roads array (the array is replaced, never mutated). */
let roadSetCache: { arr: string[]; set: Set<string> } | null = null;
export function roadSet(roads: string[]): Set<string> {
  if (roadSetCache?.arr !== roads) roadSetCache = { arr: roads, set: new Set(roads) };
  return roadSetCache.set;
}

export function createInitialState(): GameState {
  const discovered: Record<string, boolean> = {};
  for (const r of REGIONS) discovered[r.id] = r.id === HOME_REGION_ID;
  const buildings = STARTING_BUILDINGS.map((b) => makeBuilding(b.type, b.gridX, b.gridY, b.rotation, true, 0));
  return {
    timeSols: 0,
    paused: true,
    speed: 1,
    started: false,
    resources: { ...STARTING_RESOURCES },
    storage: storageCapacity(buildings),
    rates: ResourceManager.empty(),
    energy: { generation: 0, consumption: 0, satisfaction: 1 },
    colony: { colonists: STARTING_COLONISTS, housing: 0 },
    buildings,
    // The pre-built starting base comes with its access roads already paved.
    roads: starterRoads(buildings),
    roadMode: false,
    discoveredRegions: discovered,
    selectedBuildingId: null,
    selectedRegionId: null,
    construction: { active: false, buildingType: null, rotation: 0 },
    progression: { level: 1, xp: 0, milestones: [] },
    missions: [],
    alerts: [],
    activePanel: null,
  };
}

export interface PlaceRequest {
  type: BuildingType;
  gridX: number;
  gridY: number;
  rotation: number;
}

export type ActionResult = { ok: true } | { ok: false; reason: string };

export interface GameActions {
  start(): void;
  setSpeed(speed: SimSpeed): void;
  togglePause(): void;
  setPaused(paused: boolean): void;
  togglePanel(panel: PanelId): void;
  openPanel(panel: PanelId | null): void;
  startPlacement(type: BuildingType): ActionResult;
  rotatePlacement(): void;
  cancelPlacement(): void;
  placeBuilding(req: PlaceRequest): ActionResult;
  startRoadMode(): ActionResult;
  stopRoadMode(): void;
  placeRoad(tx: number, ty: number): ActionResult;
  removeRoad(tx: number, ty: number): ActionResult;
  selectBuilding(id: string | null): void;
  selectRegion(id: string | null): void;
  launchSurvey(regionId: string): ActionResult;
  surveyCheck(regionId: string): ActionResult;
  pushAlert(alert: Omit<Alert, 'id' | 'sol' | 'persistent'>): void;
  dismissAlert(id: string): void;
  setPersistentAlerts(alerts: Omit<Alert, 'id' | 'sol' | 'persistent'>[]): void;
  addXp(amount: number, milestone?: string): void;
  replaceState(state: GameState): void;
}

export type GameStore = GameState & GameActions;

export const gameStore = createStore<GameStore>()((set, get) => ({
  ...createInitialState(),

  start() {
    set({ started: true, paused: false });
  },

  setSpeed(speed) {
    set({ speed, paused: false });
  },

  togglePause() {
    set({ paused: !get().paused });
  },

  setPaused(paused) {
    set({ paused });
  },

  togglePanel(panel) {
    set({ activePanel: get().activePanel === panel ? null : panel });
  },

  openPanel(panel) {
    set({ activePanel: panel });
  },

  startPlacement(type) {
    const s = get();
    const def = BUILDINGS[type];
    if (!ResourceManager.canAfford(s.resources, def.constructionCost)) {
      return { ok: false, reason: ResourceManager.describeMissing(s.resources, def.constructionCost) };
    }
    set({
      construction: { active: true, buildingType: type, rotation: s.construction.rotation },
      roadMode: false,
      selectedBuildingId: null,
      activePanel: null,
    });
    return { ok: true };
  },

  rotatePlacement() {
    const c = get().construction;
    if (c.active) set({ construction: { ...c, rotation: (c.rotation + 1) % 4 } });
  },

  cancelPlacement() {
    const c = get().construction;
    if (c.active) set({ construction: { ...c, active: false, buildingType: null } });
  },

  placeBuilding(req) {
    const s = get();
    const def = BUILDINGS[req.type];
    if (!ResourceManager.canAfford(s.resources, def.constructionCost)) {
      return { ok: false, reason: ResourceManager.describeMissing(s.resources, def.constructionCost) };
    }
    const problem = checkPlacement(req.type, req.gridX, req.gridY, req.rotation, s.buildings, roadSet(s.roads));
    if (problem) return { ok: false, reason: PROBLEM_TEXT[problem] };
    const b = makeBuilding(req.type, req.gridX, req.gridY, req.rotation, false, s.timeSols);
    set({
      resources: ResourceManager.deduct(s.resources, def.constructionCost),
      buildings: [...s.buildings, b],
      construction: { ...s.construction, active: false, buildingType: null },
      selectedBuildingId: b.id,
    });
    get().pushAlert({
      key: `placed-${b.id}`,
      level: 'info',
      title: `${def.name} under construction`,
      message: `Construction robots are building it now. Ready in about ${def.buildTimeSols.toFixed(1)} sols. Lay a road to it so its goods can reach the base!`,
    });
    return { ok: true };
  },

  startRoadMode() {
    const s = get();
    if (!ResourceManager.canAfford(s.resources, ROAD_COST)) {
      return { ok: false, reason: ResourceManager.describeMissing(s.resources, ROAD_COST) };
    }
    set({
      roadMode: true,
      construction: { ...s.construction, active: false, buildingType: null },
      selectedBuildingId: null,
      activePanel: null,
    });
    return { ok: true };
  },

  stopRoadMode() {
    if (get().roadMode) set({ roadMode: false });
  },

  placeRoad(tx, ty) {
    const s = get();
    const problem = checkRoad(tx, ty, roadSet(s.roads), s.buildings);
    if (problem) return { ok: false, reason: ROAD_PROBLEM_TEXT[problem] };
    if (!ResourceManager.canAfford(s.resources, ROAD_COST)) {
      return { ok: false, reason: ResourceManager.describeMissing(s.resources, ROAD_COST) };
    }
    set({ resources: ResourceManager.deduct(s.resources, ROAD_COST), roads: [...s.roads, roadKey(tx, ty)] });
    return { ok: true };
  },

  removeRoad(tx, ty) {
    const s = get();
    const key = roadKey(tx, ty);
    const roads = roadSet(s.roads);
    if (!roads.has(key)) return { ok: false, reason: 'There is no road here.' };
    if (!canRemoveRoad(key, roads)) return { ok: false, reason: 'Other roads are joined through this piece — remove the end pieces first.' };
    const resources = { ...s.resources };
    for (const [id, v] of Object.entries(ROAD_COST) as [ResourceId, number][]) resources[id] = Math.min(s.storage[id], resources[id] + v);
    set({ resources, roads: s.roads.filter((k) => k !== key) });
    return { ok: true };
  },

  selectBuilding(id) {
    set({ selectedBuildingId: id });
  },

  selectRegion(id) {
    set({ selectedRegionId: id });
  },

  surveyCheck(regionId) {
    const s = get();
    if (s.discoveredRegions[regionId]) return { ok: false, reason: 'Already explored.' };
    if (s.missions.some((m) => m.status === 'active' && m.regionId === regionId)) return { ok: false, reason: 'A rover is already on its way.' };
    if (!regionManager.isFrontier(regionId, s.discoveredRegions)) return { ok: false, reason: 'Too far — explore a neighbouring region first.' };
    if (s.missions.filter((m) => m.status === 'active').length >= SURVEY.maxConcurrent) return { ok: false, reason: `Only ${SURVEY.maxConcurrent} rovers can be out at once.` };
    if (!ResourceManager.canAfford(s.resources, SURVEY.cost)) return { ok: false, reason: ResourceManager.describeMissing(s.resources, SURVEY.cost) };
    return { ok: true };
  },

  launchSurvey(regionId) {
    const check = get().surveyCheck(regionId);
    if (!check.ok) return check;
    const s = get();
    const km = regionManager.distanceKm(SETTLEMENT.lat, SETTLEMENT.lon, regionId);
    const mission: Mission = {
      id: makeId('mission'),
      type: 'survey',
      regionId,
      startSol: s.timeSols,
      durationSols: SURVEY.baseSols + km / SURVEY.kmPerSol,
      progress: 0,
      status: 'active',
    };
    set({ resources: ResourceManager.deduct(s.resources, SURVEY.cost), missions: [...s.missions, mission] });
    const region = regionManager.get(regionId);
    get().pushAlert({
      key: `launch-${mission.id}`,
      level: 'info',
      title: 'Survey rover launched',
      message: `Heading to ${region?.name ?? regionId}. Arrival in ${mission.durationSols.toFixed(1)} sols.`,
    });
    return { ok: true };
  },

  pushAlert(alert) {
    const s = get();
    const full: Alert = { ...alert, id: makeId('alert'), sol: s.timeSols, persistent: false };
    set({ alerts: [...s.alerts.filter((a) => a.key !== alert.key), full].slice(-30) });
  },

  dismissAlert(id) {
    set({ alerts: get().alerts.filter((a) => a.id !== id) });
  },

  setPersistentAlerts(list) {
    const s = get();
    const current = s.alerts.filter((a) => a.persistent);
    const same =
      current.length === list.length &&
      list.every((n) => current.some((c) => c.key === n.key && c.message === n.message && c.level === n.level));
    if (same) return;
    const kept = s.alerts.filter((a) => !a.persistent);
    const next: Alert[] = list.map((n) => {
      const prev = current.find((c) => c.key === n.key);
      return { ...n, id: prev?.id ?? makeId('warn'), sol: prev?.sol ?? s.timeSols, persistent: true };
    });
    set({ alerts: [...kept, ...next] });
  },

  addXp(amount, milestone) {
    const p = get().progression;
    const xp = p.xp + amount;
    const lvl = levelForXp(xp);
    set({
      progression: {
        level: lvl.level,
        xp,
        milestones: milestone ? [...p.milestones, milestone] : p.milestones,
      },
    });
    if (lvl.level > p.level) {
      get().pushAlert({
        key: `level-${lvl.level}`,
        level: 'success',
        title: `Level up! You are now a ${lvl.title}`,
        message: 'Your settlement is growing. Keep exploring and building!',
      });
    }
  },

  replaceState(state) {
    set({ ...state });
  },
}));

export type Store = typeof gameStore;

/** Subscribe to a derived slice; the callback fires only when the slice changes. */
export function watch<T>(
  selector: (s: GameStore) => T,
  callback: (value: T, prev: T) => void,
  equals: (a: T, b: T) => boolean = Object.is,
  fireImmediately = true,
): () => void {
  let prev = selector(gameStore.getState());
  if (fireImmediately) callback(prev, prev);
  return gameStore.subscribe((state) => {
    const next = selector(state);
    if (!equals(next, prev)) {
      const old = prev;
      prev = next;
      callback(next, old);
    }
  });
}

export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

export type { ResourceId };
