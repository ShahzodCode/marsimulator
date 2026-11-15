import { createStore } from 'zustand/vanilla';
import { BUILDINGS, demolishRefund, maxPowerKw, type BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import { ResourceManager } from '../simulation/ResourceManager';
import { ConstructionManager, type PlaceRequest } from '../simulation/ConstructionManager';
import { MissionManager, type HeightSampler } from '../simulation/MissionManager';
import { PowerManager } from '../simulation/PowerManager';
import { ProgressionManager } from '../simulation/ProgressionManager';
import { ROAD_COST, ROAD_PROBLEM_TEXT, canRemoveRoad, checkRoad, roadKey } from '../settlement/RoadRules';
import { RegionManager } from '../planet/RegionManager';
import { SITE_BY_ID } from '../data/baseSites';
import { canResearch, labSlots, STAGES, TECH_BY_ID, stageMaterials, type TechId } from '../data/research';
import { envOf } from '../simulation/BaseEnv';
import { createInitialState, gridToLatLon, makeId, switchBase } from './factory';
import type { Alert, GameState, PanelId, SimSpeed } from './types';
import { describeCost, Logistics } from '../simulation/Logistics';
import { DEMOLISH_REFUND } from '../data/buildings';
import { pipelineCost } from '../data/logistics';
import type { Cost } from '../simulation/ResourceManager';

/** Changes one base's stock (the active one or another), keeping storage limits when adding. */
function updateBaseResources(s: GameState, baseId: string, f: (r: GameState['resources'], storage: GameState['storage']) => GameState['resources']): Partial<GameState> {
  if (baseId === s.base.id) return { resources: f(s.resources, s.storage) };
  return { otherBases: s.otherBases.map((b) => (b.id === baseId ? { ...b, resources: f(b.resources, b.storage) } : b)) };
}

export const regionManager = new RegionManager();

/** Terrain heights for planning rover routes (set once the planet is generated). */
let routeHeight: HeightSampler | null = null;
export function setRouteHeight(sampler: HeightSampler): void {
  routeHeight = sampler;
}
export function getRouteHeight(): HeightSampler | undefined {
  return routeHeight ?? undefined;
}

export { createInitialState, gridToLatLon, makeId };
export type { PlaceRequest };

/** Cached Set view of the roads array (the array is replaced, never mutated). */
let roadSetCache: { arr: string[]; set: Set<string> } | null = null;
export function roadSet(roads: string[]): ReadonlySet<string> {
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
  /** Pipeline tool: drag from a base with a Pump Station onto another base. */
  startPipelineMode(): ActionResult;
  stopPipelineMode(): void;
  /** Lays a pipeline between two bases, paid by `fromId`. */
  buildPipeline(fromId: string, toId: string): ActionResult;
  /** Takes a pipeline up and returns half of what it cost to the base that paid. */
  removePipeline(id: string): ActionResult;
  /** Where a Cargo Garage sends its haulers (null = nowhere). */
  setGarageTarget(buildingId: string, baseId: string | null): ActionResult;
  /** Loads haulers at a Garage of the active base and sends them off. */
  sendCargo(buildingId: string, cargo: Cost): ActionResult;
  /** Removes a player-built building and returns half its construction cost (never energy). */
  demolishBuilding(id: string): ActionResult;
  /** Switch a finished building off or on (switching on needs enough spare power). */
  setBuildingEnabled(id: string, enabled: boolean): ActionResult;
  selectBuilding(id: string | null): void;
  selectRegion(id: string | null): void;
  launchScan(regionId: string): ActionResult;
  scanCheck(regionId: string): ActionResult;
  launchExpedition(regionId: string): ActionResult;
  expeditionCheck(regionId: string): ActionResult;
  buildOutpost(regionId: string): ActionResult;
  outpostCheck(regionId: string): ActionResult;
  /** Send a founding convoy from the active base to a base site. */
  launchFounding(siteId: string): ActionResult;
  foundingCheck(siteId: string): ActionResult;
  /** Make another base the one on screen. */
  switchBase(id: string): ActionResult;
  /** Start (or resume) a project in a free lab slot; one slot per Research Lab. */
  startResearch(id: TechId): ActionResult;
  /** Put a running project on hold, keeping its progress, to free a lab slot. */
  pauseResearch(id: TechId): ActionResult;
  /** Pay the test materials for the next development stage of a running project. */
  advanceResearch(id: TechId): ActionResult;
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
      pipelineMode: false,
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
      ...(res.otherBases ? { otherBases: res.otherBases } : {}),
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
    for (const x of res.sent) {
      get().pushAlert({ key: `piped-${b.id}-${x.name}`, level: 'info', title: `🛢️ ${x.name} sent materials`, message: `Pumped over ${describeCost(x.goods)} through the pipeline to help build the ${def.name}.` });
    }
    return { ok: true };
  },

  startPipelineMode() {
    const s = get();
    if (!Logistics.allBases(s).some((b) => Logistics.hasPump(b.buildings))) {
      return { ok: false, reason: 'Build a Pipeline Pump Station first (Build menu). The base at the other end needs one too.' };
    }
    if (!s.otherBases.length) return { ok: false, reason: 'You need a second base first. Found one from the Exploration panel.' };
    set({
      pipelineMode: true,
      roadMode: false,
      construction: { ...s.construction, active: false, buildingType: null },
      selectedBuildingId: null,
      activePanel: null,
    });
    return { ok: true };
  },

  stopPipelineMode() {
    if (get().pipelineMode) set({ pipelineMode: false });
  },

  buildPipeline(fromId, toId) {
    const s = get();
    const check = Logistics.checkPipeline(s, fromId, toId);
    if (!check.ok) return check;
    const pipe = Logistics.makePipeline(fromId, toId, check.km, s.timeSols);
    set({ ...updateBaseResources(s, fromId, (r) => ResourceManager.deduct(r, check.cost)), pipelines: [...s.pipelines, pipe] });
    const from = Logistics.baseById(s, fromId)!;
    const to = Logistics.baseById(s, toId)!;
    const pumps = Logistics.hasPump(to.buildings) ? '' : ` Build a Pipeline Pump Station at ${to.name} too, or nothing will flow.`;
    get().pushAlert({
      key: `pipe-${pipe.id}`,
      level: 'info',
      title: `🛢️ Pipeline to ${to.name} under construction`,
      message: `${Math.round(check.km).toLocaleString()} km of pipe from ${from.name}. Robots finish it in about ${check.buildSols.toFixed(1)} sols.${pumps}`,
    });
    return { ok: true };
  },

  removePipeline(id) {
    const s = get();
    const p = s.pipelines.find((x) => x.id === id);
    if (!p) return { ok: false, reason: 'That pipeline is already gone.' };
    const refund: Cost = {};
    for (const [rid, v] of Object.entries(pipelineCost(p.km)) as [ResourceId, number][]) refund[rid] = Math.floor(v * DEMOLISH_REFUND);
    const payer = Logistics.baseById(s, p.fromBaseId) ? p.fromBaseId : s.base.id;
    set({
      ...updateBaseResources(s, payer, (r, cap) => {
        const out = { ...r };
        for (const [rid, v] of Object.entries(refund) as [ResourceId, number][]) out[rid] = Math.min(cap[rid], out[rid] + v);
        return out;
      }),
      pipelines: s.pipelines.filter((x) => x.id !== id),
    });
    return { ok: true };
  },

  setGarageTarget(buildingId, baseId) {
    const s = get();
    const g = s.buildings.find((x) => x.id === buildingId);
    if (!g || g.type !== 'cargo_garage') return { ok: false, reason: 'That garage is gone.' };
    if (baseId !== null && !s.otherBases.some((b) => b.id === baseId)) return { ok: false, reason: 'Drag the arrow onto one of your other bases.' };
    set({ buildings: s.buildings.map((x) => (x.id === buildingId ? { ...x, target: baseId ?? undefined } : x)) });
    return { ok: true };
  },

  sendCargo(buildingId, cargo) {
    const s = get();
    const res = Logistics.launchCargo(s, buildingId, cargo, getRouteHeight());
    if (!res.ok) return res;
    set({ resources: res.resources, shipments: [...s.shipments, res.shipment] });
    get().pushAlert({
      key: `cargo-${res.shipment.id}`,
      level: 'info',
      title: `🚚 ${res.shipment.haulers} hauler${res.shipment.haulers > 1 ? 's' : ''} on the way to ${res.to.name}`,
      message: `Carrying ${describeCost(res.shipment.cargo)} over ${Math.round(res.shipment.routeKm).toLocaleString()} km. They arrive in about ${Logistics.tripSols(res.shipment.legKm).toFixed(1)} sols, then drive home.`,
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
      pipelineMode: false,
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
    if (s.shipments.some((x) => x.garageId === id)) return { ok: false, reason: 'Its haulers are out on the road. Wait until they are back.' };
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
      const env = envOf(s);
      const kw = maxPowerKw(b.type, env.heating);
      const power = PowerManager.canSupport(s.buildings, kw, env);
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

  scanCheck(regionId) {
    return MissionManager.checkScan(get(), regionManager, regionId);
  },

  launchScan(regionId) {
    const s = get();
    const res = MissionManager.launchScan(s, regionManager, regionId);
    if (!res.ok) return res;
    set({ missions: [...s.missions, res.mission] });
    get().pushAlert({
      key: `launch-${res.mission.id}`,
      level: 'info',
      title: '📡 Orbiter is mapping',
      message: `Photographing ${regionManager.get(regionId)?.name ?? regionId} from orbit. Done in ${res.mission.durationSols.toFixed(1)} sols.`,
    });
    return { ok: true };
  },

  expeditionCheck(regionId) {
    return MissionManager.checkExpedition(get(), regionManager, regionId, getRouteHeight());
  },

  launchExpedition(regionId) {
    const s = get();
    const res = MissionManager.launchExpedition(s, regionManager, regionId, getRouteHeight());
    if (!res.ok) return res;
    const mission = res.mission;
    set({ resources: res.resources, power: { ...s.power, batteryKwh: res.batteryKwh }, missions: [...s.missions, mission] });
    get().pushAlert({
      key: `launch-${mission.id}`,
      level: 'info',
      title: '🚙 Crew rover is on its way',
      message: `Driving ${Math.round(mission.routeKm).toLocaleString()} km to ${regionManager.get(regionId)?.name ?? regionId}. Back in about ${mission.durationSols.toFixed(0)} sols.`,
    });
    return { ok: true };
  },

  outpostCheck(regionId) {
    return MissionManager.checkOutpost(get(), regionId);
  },

  buildOutpost(regionId) {
    const s = get();
    const res = MissionManager.buildOutpost(s, regionManager, regionId, getRouteHeight());
    if (!res.ok) return res;
    set({ resources: res.resources, outposts: [...s.outposts, res.outpost] });
    get().pushAlert({
      key: `outpost-${res.outpost.id}`,
      level: 'info',
      title: '🏗️ Outpost kit on its way',
      message: `A cargo rover is driving the kit to ${regionManager.get(regionId)?.name ?? regionId}. It starts working in ${(res.outpost.readySol - s.timeSols).toFixed(0)} sols.`,
    });
    return { ok: true };
  },

  foundingCheck(siteId) {
    return MissionManager.checkFounding(get(), siteId, getRouteHeight());
  },

  launchFounding(siteId) {
    const s = get();
    const res = MissionManager.launchFounding(s, siteId, getRouteHeight());
    if (!res.ok) return res;
    const m = res.mission;
    set({
      resources: res.resources,
      power: { ...s.power, batteryKwh: res.batteryKwh },
      colony: { ...s.colony, colonists: res.colonists },
      missions: [...s.missions, m],
    });
    const site = SITE_BY_ID[siteId];
    get().pushAlert({
      key: `launch-${m.id}`,
      level: 'info',
      title: '🚙 Founding convoy is on its way',
      message: `A woman and a man drive ${Math.round(m.routeKm).toLocaleString()} km to ${site.name} with a Central Storage Depot. They arrive in about ${m.durationSols.toFixed(0)} sols and stay there for good.`,
    });
    return { ok: true };
  },

  switchBase(id) {
    const next = switchBase(get(), id);
    if (!next) return { ok: false, reason: 'There is no such base.' };
    set(next);
    return { ok: true };
  },

  startResearch(id) {
    const s = get();
    if (!s.buildings.some((b) => b.type === 'research_lab') && !s.otherBases.some((b) => b.buildings.some((x) => x.type === 'research_lab'))) {
      return { ok: false, reason: 'Build a Research Lab first.' };
    }
    if (s.research.completed.includes(id)) return { ok: false, reason: 'Already researched.' };
    if (!canResearch(s.research.completed, id)) {
      const need = TECH_BY_ID[id].requires.filter((r) => !s.research.completed.includes(r)).map((r) => TECH_BY_ID[r].name);
      return { ok: false, reason: `Research ${need.join(' and ')} first.` };
    }
    if (s.research.active.some((p) => p.id === id)) return { ok: true };
    const slots = labSlots([s.buildings, ...s.otherBases.map((b) => b.buildings)]);
    if (s.research.active.length >= slots) {
      return { ok: false, reason: `All ${slots} ${slots === 1 ? 'lab is' : 'labs are'} busy. Pause a project or build another Research Lab.` };
    }
    const shelved = { ...s.research.shelved };
    const from = shelved[id] ?? { stage: 0, progress: 0, awaiting: false };
    delete shelved[id];
    set({ research: { ...s.research, active: [...s.research.active, { id, ...from }], shelved } });
    return { ok: true };
  },

  pauseResearch(id) {
    const s = get();
    const p = s.research.active.find((x) => x.id === id);
    if (!p) return { ok: false, reason: 'That project is not running.' };
    const { id: _, ...kept } = p;
    set({ research: { ...s.research, active: s.research.active.filter((x) => x.id !== id), shelved: { ...s.research.shelved, [id]: kept } } });
    return { ok: true };
  },

  advanceResearch(id) {
    const s = get();
    const r = s.research;
    const p = r.active.find((x) => x.id === id);
    if (!p || !p.awaiting) return { ok: false, reason: 'The current stage is not finished yet.' };
    const cost = stageMaterials(TECH_BY_ID[id], p.stage + 1);
    const paid = Logistics.payFromNetwork(s, cost);
    if (!paid) return { ok: false, reason: `The ${STAGES[p.stage + 1].name.toLowerCase()} needs ${describeCost(cost)}.` };
    const active = r.active.map((x) => (x.id === id ? { ...x, stage: x.stage + 1, progress: 0, awaiting: false } : x));
    set({ resources: paid.resources, otherBases: paid.otherBases, research: { ...r, active } });
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

export type { ResourceId };
