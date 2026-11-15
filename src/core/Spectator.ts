import * as THREE from 'three';
import type { EventBus } from './EventBus';
import type { Terrain } from '../planet/Terrain';
import type { Mars } from '../planet/Mars';
import type { CameraController } from '../planet/CameraController';
import { SettlementManager } from '../settlement/SettlementManager';
import { BUILDINGS } from '../data/buildings';
import { SITE_BY_ID } from '../data/baseSites';
import { makeBuilding } from '../state/factory';
import { gameStore } from '../state/gameStore';
import type { BuildingInstance } from '../state/types';
import { Leaderboard, type PublicBase, type PublicBuilding, type PublicColony } from '../persistence/Leaderboard';
import { VisitBanner } from '../ui/VisitBanner';
import { Visits, type VisitHost } from './Visits';

/** How often a visited colony is fetched again (matches the owner's autosave). */
const REFRESH_MS = 60_000;
const VISIT_ALTITUDE = 0.75;

export interface SpectatorHooks {
  scene: THREE.Scene;
  terrain: Terrain;
  mars: Mars;
  camera: CameraController;
  events: EventBus;
  ui: HTMLElement;
  /** Puts the player's own bases back (scenes, globe holes, camera limits). */
  restoreOwnBases(): void;
}

interface Guest {
  base: PublicBase;
  manager: SettlementManager;
}

/**
 * Spectate mode: draws another player's bases on Mars from their public snapshot,
 * read-only. The store keeps holding only the player's own colony (so autosave and
 * the simulation never see the visited one); their own scenes are just hidden and
 * the game is paused until they return home.
 */
export class Spectator implements VisitHost {
  private colony: PublicColony | null = null;
  private guests = new Map<string, Guest>();
  /** Flat pads graded for the visit only; removed again on the way home. */
  private pads: { lat: number; lon: number }[] = [];
  private pausedBefore = false;
  private timer = 0;
  private banner: VisitBanner;

  constructor(private hooks: SpectatorHooks) {
    this.banner = new VisitBanner(hooks.ui);
    Visits.register(this);
  }

  get active(): boolean {
    return this.colony !== null;
  }

  start(colony: PublicColony, baseId: string): void {
    const base = colony.bases.find((b) => b.id === baseId) ?? colony.bases[0];
    if (!base) return;
    if (!this.colony) this.enter();
    if (this.colony?.userId !== colony.userId) this.clearGuests();
    this.colony = colony;
    this.syncGuests();
    this.hooks.events.emit('camera:flyTo', { lat: placeOf(base).lat, lon: placeOf(base).lon, altitude: VISIT_ALTITUDE });
    Visits.set({ colony, baseId: base.id });
  }

  stop(): void {
    if (!this.colony) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.clearGuests();
    this.colony = null;
    this.hooks.ui.classList.remove('visiting');
    this.hooks.restoreOwnBases();
    gameStore.getState().setPaused(this.pausedBefore);
    // Clear the visit first: "home" must mean the player's own base again.
    Visits.set(null);
    this.hooks.events.emit('camera:home');
  }

  /** The player's own colony: pause it, drop any tool in hand and step the UI aside. */
  private enter(): void {
    const s = gameStore.getState();
    this.pausedBefore = s.paused;
    s.setPaused(true);
    if (s.construction.active) s.cancelPlacement();
    if (s.roadMode) s.stopRoadMode();
    if (s.pipelineMode) s.stopPipelineMode();
    if (s.selectedBuildingId) s.selectBuilding(null);
    if (s.activePanel) s.openPanel(null);
    this.hooks.ui.classList.add('visiting');
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.refresh(), REFRESH_MS);
  }

  /** Makes a scene for each visited base and draws its latest snapshot. */
  private syncGuests(): void {
    const c = this.colony;
    if (!c) return;
    for (const [id, g] of this.guests) {
      if (c.bases.some((b) => b.id === id)) continue;
      this.dropGuest(g);
      this.guests.delete(id);
    }
    for (const base of c.bases) {
      let g = this.guests.get(base.id);
      if (!g) {
        const at = placeOf(base);
        const home = SITE_BY_ID[base.siteId]?.home ?? false;
        if (!home && !this.hooks.terrain.hasPad(at.lat, at.lon)) this.pads.push(at);
        const manager = new SettlementManager(this.hooks.terrain, this.hooks.events, { id: base.id, lat: at.lat, lon: at.lon, home });
        this.hooks.scene.add(manager.group);
        g = { base, manager };
        this.guests.set(base.id, g);
      }
      g.base = base;
      g.manager.showSnapshot(toInstances(base.buildings), base.roads);
    }
    const sites = c.bases.map(placeOf);
    this.hooks.mars.setHoles(sites);
    this.hooks.camera.setBases(sites);
  }

  private dropGuest(g: Guest): void {
    g.manager.dispose();
    this.hooks.scene.remove(g.manager.group);
  }

  private clearGuests(): void {
    for (const g of this.guests.values()) this.dropGuest(g);
    this.guests.clear();
    for (const p of this.pads) this.hooks.terrain.removePad(p.lat, p.lon);
    this.pads = [];
  }

  private async refresh(): Promise<void> {
    const c = this.colony;
    if (!c) return;
    const res = await Leaderboard.colony(c.userId, true);
    // Still visiting the same player? (They may have gone home while this loaded.)
    if (this.colony?.userId !== c.userId || !res.ok || !res.data) return;
    this.colony = res.data;
    this.syncGuests();
    const current = Visits.current;
    const baseId = res.data.bases.some((b) => b.id === current?.baseId) ? current!.baseId : (res.data.bases[0]?.id ?? '');
    Visits.set({ colony: res.data, baseId });
  }

  /** Clicking a visited building shows what it is (nothing else can be done). */
  click(ray: THREE.Ray): boolean {
    for (const g of this.guests.values()) {
      const id = g.manager.buildings.pick(ray);
      const b = id ? g.base.buildings.find((x) => x.id === id) : undefined;
      if (b) {
        this.banner.showBuilding(b);
        return true;
      }
    }
    this.banner.showBuilding(null);
    return false;
  }

  update(dt: number, time: number, alt: number, camPos: THREE.Vector3, surface: boolean): void {
    for (const g of this.guests.values()) {
      g.manager.group.visible = surface;
      g.manager.update(dt, time, alt, camPos);
    }
  }
}

/** Saves from before several bases had no base position: they are at the home site. */
function placeOf(b: PublicBase): { lat: number; lon: number } {
  if (b.lat || b.lon) return { lat: b.lat, lon: b.lon };
  const site = SITE_BY_ID[b.siteId] ?? Object.values(SITE_BY_ID).find((s) => s.home);
  return { lat: site?.lat ?? 0, lon: site?.lon ?? 0 };
}

/** Full building records for the renderer, from the few public fields (unknown types are skipped). */
const instanceCache = new WeakMap<PublicBuilding[], BuildingInstance[]>();
function toInstances(list: PublicBuilding[]): BuildingInstance[] {
  let out = instanceCache.get(list);
  if (!out) {
    out = list
      .filter((b) => b.type in BUILDINGS)
      .map((b) => ({ ...makeBuilding(b.type, b.gridX, b.gridY, b.rotation, b.constructionProgress >= 1, 0), ...b }));
    instanceCache.set(list, out);
  }
  return out;
}
