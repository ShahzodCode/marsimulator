import type { BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import type { PipeFaultKind } from '../data/logistics';
import type { RecipeId } from '../data/recipes';
import type { TechId } from '../data/research';

export type SimSpeed = 1 | 2 | 4;

/** Why a building is (or is not) working — shown to the player. */
export type BuildingStatus =
  | 'operational'
  | 'waiting_materials'
  | 'insufficient_power'
  | 'storage_full'
  | 'under_construction'
  | 'disabled'
  | 'no_road';

/** Progress of one production recipe inside a building. */
export interface RecipeState {
  /** 0..1 progress of the current cycle. */
  progress: number;
  /** Inputs for the current cycle have been taken from storage. */
  loaded: boolean;
}

export interface BuildingInstance {
  id: string;
  type: BuildingType;
  /** Centre of the footprint. */
  latitude: number;
  longitude: number;
  /** South-west corner of the footprint in settlement grid cells. */
  gridX: number;
  gridY: number;
  /** 90° steps, 0..3 (clockwise seen from above). */
  rotation: number;
  level: number;
  /** 0..1 */
  constructionProgress: number;
  isOperational: boolean;
  /** The player can switch a finished building off (and on again). */
  enabled: boolean;
  status: BuildingStatus;
  /** 0..1 — share of its recipes running right now (for the UI). */
  efficiency: number;
  /** Extra detail for the status, in plain words. */
  statusNote: string | null;
  /** Per-recipe cycle progress. */
  recipes: Partial<Record<RecipeId, RecipeState>>;
  /** Got electricity in the last simulation step. */
  powered: boolean;
  placedAtSol: number;
  /** A depot-connected road runs along this building (computed by the simulation). */
  connected: boolean;
  /** Output waiting at the building because no road can carry it away yet. */
  stored: Partial<Record<ResourceId, number>>;
  /** Part of the base the colony started with: it can't be demolished. */
  starter?: boolean;
  /** Cargo Garage: the base its haulers drive to (set by dragging its arrow). */
  target?: string;
}

export type MissionStatus = 'active' | 'complete';

/** What a mission is doing right now (shown to the player). */
export type MissionActivity = 'scanning' | 'driving' | 'night' | 'storm' | 'sampling' | 'done';

interface MissionBase {
  id: string;
  regionId: string;
  startSol: number;
  /** Planned length in sols (storms can make an expedition longer). */
  durationSols: number;
  /** 0..1 */
  progress: number;
  status: MissionStatus;
  activity: MissionActivity;
}

/** An orbiter maps a region from space (reveals it). */
export interface OrbitalScan extends MissionBase {
  type: 'orbital';
}

/** A crew drives a pressurized rover to a region, collects samples and drives home. */
export interface Expedition extends MissionBase {
  type: 'expedition';
  /** Great-circle distance from the base to the site (km). */
  routeKm: number;
  /** Metres climbed and descended along the route, one way. */
  climbM: number;
  /** One-way distance counted for driving time: route + climbing (km). */
  legKm: number;
  /** Driven so far, 0..2 × legKm (out and back). */
  drivenKm: number;
  /** The crew reached the site. */
  arrived: boolean;
  siteSolsLeft: number;
  /** A dust storm planned for this trip (at a driven distance), or none. */
  storm: { atKm: number; sols: number; hit: boolean } | null;
  stormSolsLeft: number;
  /** Supplies packed for the crew, and for how many sols. */
  supplies: Partial<Record<ResourceId, number>>;
  packedSols: number;
  energyKwh: number;
  /** Collected when the crew is home again. */
  reward?: { resources: Partial<Record<ResourceId, number>>; xp: number; find: string };
  /** Base the crew left from (missing in old saves = the home base). */
  fromBaseId?: string;
  /** Start and end of the route (missing in old saves = home base → region centre). */
  from?: { lat: number; lon: number };
  to?: { lat: number; lon: number };
  /** A founding convoy: the crew stays and builds a new base at this site. */
  found?: { siteId: string; crew: number; kit: Partial<Record<ResourceId, number>> };
}

export type Mission = OrbitalScan | Expedition;

/** A small remote mine; a cargo rover shuttles its output to the base. */
export interface Outpost {
  id: string;
  regionId: string;
  resource: ResourceId;
  perSol: number;
  /** Left to mine (kg). */
  reserveLeft: number;
  /** Ready to work from this sol (the kit has to be driven there and set up first). */
  readySol: number;
  /** Cargo rover round trip (sols). */
  tripSols: number;
  /** When the cargo rover last left the base (it delivers when it gets back). */
  lastTripSol: number;
  /** Base the cargo goes to (missing in old saves = the home base). */
  baseId?: string;
}

/** A pipeline between two bases' Pump Stations (see data/logistics.ts). */
export interface Pipeline {
  id: string;
  /** The base that paid for it (where the drag started). */
  fromBaseId: string;
  toBaseId: string;
  km: number;
  /** 0..1 while the robots lay the pipe. */
  progress: number;
  buildSols: number;
  placedAtSol: number;
  /** Goods flowing right now, per sol (+ = from → to). Computed by the simulation. */
  flow: Partial<Record<ResourceId, number>>;
  /** Pumps on at both ends (computed by the simulation). */
  working: boolean;
  /** Twisted sections waiting for (or under) repair. */
  faults: PipeFault[];
}

/** A twisted or buckled section of a pipeline (see PIPE_FAULTS in data/logistics.ts). */
export interface PipeFault {
  id: string;
  kind: PipeFaultKind;
  /** Where along the pipe, 0 = the `fromBaseId` end, 1 = the other end. */
  at: number;
  /** Share of the bore the twist closes (flow drops by the same share). */
  pinch: number;
  sinceSol: number;
  /** Sols until the repair robots have it fixed (driving out included). */
  repairSols: number;
  /** 0..1 */
  repair: number;
}

/** Cargo haulers driving goods from one base's Garage to another base and back. */
export interface Shipment {
  id: string;
  garageId: string;
  fromBaseId: string;
  toBaseId: string;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  routeKm: number;
  /** One-way distance counted for driving time (route + climbing). */
  legKm: number;
  /** 0..2 × legKm (there and back). */
  drivenKm: number;
  haulers: number;
  /** On the way there: what is loaded. On the way back: whatever didn't fit at the other base. */
  cargo: Partial<Record<ResourceId, number>>;
  delivered: boolean;
  unloadSolsLeft: number;
  startSol: number;
  activity: 'driving' | 'night' | 'unloading';
}

export type AlertLevel = 'info' | 'success' | 'warning' | 'critical';

export interface Alert {
  id: string;
  /** De-duplication key — only one alert per key is shown. */
  key: string;
  level: AlertLevel;
  title: string;
  message: string;
  sol: number;
  /** Persistent alerts stay until their condition clears; others are toasts. */
  persistent: boolean;
}

/** Electricity: flows in kW, battery storage in kWh. */
export interface PowerState {
  /** Solar output right now. */
  generationKw: number;
  /** What switched-on buildings want right now. */
  demandKw: number;
  /** What they actually got. */
  suppliedKw: number;
  /** Average solar output over a whole sol (day + night). */
  avgGenerationKw: number;
  /** Most the switched-on buildings could draw (used for construction checks). */
  plannedDemandKw: number;
  batteryKwh: number;
  batteryCapacityKwh: number;
  /** 0..1 sun height. */
  sun: number;
  /** Buildings waiting for electricity. */
  unpowered: number;
}

export interface ColonyStats {
  colonists: number;
  /** Beds in powered habitats. */
  housing: number;
  /** 0..1 progress towards the next baby (see PopulationManager). */
  growth: number;
}

export interface ResearchState {
  completed: TechId[];
  /** Projects running right now: one per working Research Lab, side by side. */
  active: ActiveProject[];
  /** Projects put on hold, so switching never throws away work already paid for. */
  shelved: Partial<Record<TechId, ShelvedProject>>;
}

export interface ShelvedProject {
  /** Development stage (index into STAGES: concept … mission ready). */
  stage: number;
  /** Research points put into this stage. */
  progress: number;
  /** The stage is finished and the next one waits for its test materials to be paid. */
  awaiting: boolean;
}

export interface ActiveProject extends ShelvedProject {
  id: TechId;
}

/** Who and where a base is. The active base's data lives at the top of GameState. */
export interface BaseMeta {
  id: string;
  name: string;
  siteId: string;
  lat: number;
  lon: number;
  foundedSol: number;
}

/** GameState fields that belong to one base. */
export const BASE_KEYS = ['resources', 'storage', 'rates', 'power', 'deposits', 'colony', 'buildings', 'roads'] as const;
export type BaseKey = (typeof BASE_KEYS)[number];

/** A base that is not on screen: its meta plus its own copy of the per-base fields. */
export type BaseData = BaseMeta & Pick<GameState, BaseKey>;

export interface Progression {
  /** Rank level (1 = Junior Pioneer). */
  level: number;
  xp: number;
  /** Goals reached and other one-time rewards. */
  milestones: string[];
}

export interface SimStats {
  /** Lifetime production per resource (for goals). */
  produced: Record<ResourceId, number>;
}

export type PanelId = 'construction' | 'exploration' | 'missions' | 'research' | 'settlement';

export interface ConstructionMode {
  active: boolean;
  buildingType: BuildingType | null;
  rotation: number;
}

export interface GameState {
  /** Total simulated time in sols (Martian days). */
  timeSols: number;
  /** The base on screen; its data is the per-base fields below (BASE_KEYS). */
  base: BaseMeta;
  /** Every other base. */
  otherBases: BaseData[];
  /** Base sites the orbiter has spotted (1) or a crew / better orbiter has confirmed (2). */
  sitesSeen: Record<string, 1 | 2>;
  research: ResearchState;
  paused: boolean;
  speed: SimSpeed;
  started: boolean;
  resources: Record<ResourceId, number>;
  /** Most of each resource the colony can hold (from storage buildings; computed by the simulation). */
  storage: Record<ResourceId, number>;
  /** Net change per sol (computed by the simulation). */
  rates: Record<ResourceId, number>;
  power: PowerState;
  /** Mineable deposits (kg). */
  deposits: { ice: number };
  stats: SimStats;
  colony: ColonyStats;
  buildings: BuildingInstance[];
  /** Player-built road tiles, as "tx,ty" keys (see settlement/RoadRules). */
  roads: string[];
  /** Road-laying tool is active (transient UI state). */
  roadMode: boolean;
  /** Pipeline tool is active (transient UI state). */
  pipelineMode: boolean;
  pipelines: Pipeline[];
  shipments: Shipment[];
  /** Mapped from orbit (no fog). */
  discoveredRegions: Record<string, boolean>;
  /** Visited by a crew. */
  exploredRegions: Record<string, boolean>;
  outposts: Outpost[];
  selectedBuildingId: string | null;
  selectedRegionId: string | null;
  construction: ConstructionMode;
  progression: Progression;
  missions: Mission[];
  alerts: Alert[];
  activePanel: PanelId | null;
}
