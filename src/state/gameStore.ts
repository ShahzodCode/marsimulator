import { createStore } from 'zustand/vanilla';
import { BUILDINGS, demolishRefund, maxPowerKw, type BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { ResourceManager } from '../simulation/ResourceManager';
import { ConstructionManager, type PlaceRequest } from '../simulation/ConstructionManager';
import { MissionManager } from '../simulation/MissionManager';
import { PowerManager } from '../simulation/PowerManager';
import { ProgressionManager } from '../simulation/ProgressionManager';
import { ROAD_COST, ROAD_PROBLEM_TEXT, canRemoveRoad, checkRoad, roadKey } from '../settlement/RoadRules';
import { RegionManager } from '../planet/RegionManager';
import { createInitialState, gridToLatLon, makeId } from './factory';
import type { Alert, GameState, PanelId, SimSpeed } from './types';

export const regionManager = new RegionManager();

export { createInitialState, gridToLatLon, makeId };
export type { PlaceRequest };

/** Cached Set view of the roads array (the array is replaced, never mutated). */
let roadSetCache: { arr: string[]; set: Set<string> } | null = null;
export function roadSet(roads: string[]): Set<string> {
  if (roadSetCache?.arr !== roads) roadSetCache = { arr: roads, set: new Set(roads) };
  return roadSetCache.set;
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
  /** Removes a player-built building and returns half its construction cost (never energy). */
  demolishBuilding(id: string): ActionResult;
  /** Switch a finished building off or on (switching on needs enough spare power). */
  setBuildingEnabled(id: string, enabled: boolean): ActionResult;
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
    const check = ConstructionManager.canBuild(s, type);
    if (!check.ok) return { ok: false, reason: check.reason };
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
    const res = ConstructionManager.place(s, req);
    if (!res.ok) return { ok: false, reason: res.reason };
    const b = res.building;
    set({
      resources: res.resources,
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

  demolishBuilding(id) {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return { ok: false, reason: 'That building is already gone.' };
    if (b.starter || b.type === 'storage_depot') return { ok: false, reason: 'This is part of the original base and can’t be demolished.' };
    const def = BUILDINGS[b.type];
    const refund = demolishRefund(b.type);
    const resources = { ...s.resources };
    for (const [rid, v] of Object.entries(refund) as [ResourceId, number][]) resources[rid] = Math.min(s.storage[rid], resources[rid] + v);
    set({
      resources,
      buildings: s.buildings.filter((x) => x.id !== id),
      selectedBuildingId: s.selectedBuildingId === id ? null : s.selectedBuildingId,
    });
    const got = (Object.entries(refund) as [ResourceId, number][]).map(([rid, v]) => `${v} ${rid}`).join(', ');
    get().pushAlert({
      key: `demolished-${id}`,
      level: 'info',
      title: `${def.name} demolished`,
      message: got ? `Recovered ${got} (half of what it cost). Anything over the depot's limit is lost.` : 'Nothing to recover.',
    });
    return { ok: true };
  },

  setBuildingEnabled(id, enabled) {
    const s = get();
    const b = s.buildings.find((x) => x.id === id);
    if (!b) return { ok: false, reason: 'That building is gone.' };
    if (b.enabled === enabled) return { ok: true };
    if (enabled) {
      const kw = maxPowerKw(b.type);
      const power = PowerManager.canSupport(s.buildings, kw);
      if (!power.ok) return { ok: false, reason: `It needs ${kw.toFixed(1)} kW but only ${Math.max(0, power.spareKw).toFixed(1)} kW is spare. Build a Solar Farm or switch something else off.` };
    }
    set({ buildings: s.buildings.map((x) => (x.id === id ? { ...x, enabled } : x)) });
    return { ok: true };
  },

  selectBuilding(id) {
    set({ selectedBuildingId: id });
  },

  selectRegion(id) {
    set({ selectedRegionId: id });
  },

  surveyCheck(regionId) {
    const c = MissionManager.check(get(), regionManager, regionId);
    return c.ok ? { ok: true } : { ok: false, reason: c.reason };
  },

  launchSurvey(regionId) {
    const s = get();
    const res = MissionManager.launch(s, regionManager, regionId);
    if (!res.ok) return res;
    const mission = res.mission;
    set({ resources: res.resources, power: { ...s.power, batteryKwh: res.batteryKwh }, missions: [...s.missions, mission] });
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
    const g = ProgressionManager.grant(get().progression, amount, milestone);
    set({ progression: g.progression });
    if (g.rankUp) {
      get().pushAlert({ key: `rank-${g.rankUp.id}`, level: 'success', title: `${g.rankUp.icon} Promoted to ${g.rankUp.title}!`, message: `Unlocked: ${g.rankUp.perks.join(' · ')}.` });
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
