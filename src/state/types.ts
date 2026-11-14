import type { BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';
import type { RecipeId } from '../data/recipes';

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
}

export type MissionStatus = 'active' | 'complete';

export interface Mission {
  id: string;
  type: 'survey';
  regionId: string;
  startSol: number;
  durationSols: number;
  progress: number;
  status: MissionStatus;
  /** What was paid to launch it. */
  cost: Partial<Record<ResourceId, number>>;
  energyKwh: number;
  /** Reward collected on arrival (filled in when complete). */
  reward?: { resources: Partial<Record<ResourceId, number>>; ice: number; xp: number; find: string };
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
  housing: number;
}

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
  discoveredRegions: Record<string, boolean>;
  selectedBuildingId: string | null;
  selectedRegionId: string | null;
  construction: ConstructionMode;
  progression: Progression;
  missions: Mission[];
  alerts: Alert[];
  activePanel: PanelId | null;
}
