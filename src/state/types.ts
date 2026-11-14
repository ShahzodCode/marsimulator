import type { BuildingType } from '../data/buildings';
import type { ResourceId } from '../data/resources';

export type SimSpeed = 1 | 2 | 4;

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
  /** 0..1 — fraction of normal output (reduced when energy or inputs are short). */
  efficiency: number;
  /** Why the building is not running at full output (for the UI). */
  statusNote: string | null;
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

export interface EnergyState {
  generation: number;
  consumption: number;
  /** min(1, generation / consumption) */
  satisfaction: number;
}

export interface ColonyStats {
  colonists: number;
  housing: number;
}

export interface Progression {
  level: number;
  xp: number;
  milestones: string[];
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
  energy: EnergyState;
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
