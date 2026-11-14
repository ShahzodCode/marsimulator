import * as THREE from 'three';
import { RESOURCES, type ResourceId } from '../data/resources';
import type { MissionActivity } from '../state/types';
import type { EventBus } from '../core/EventBus';
import type { Terrain } from '../planet/Terrain';
import type { SettlementGrid } from '../settlement/SettlementGrid';
import { footprintRect, rectCenter } from '../settlement/PlacementRules';
import { MissionManager } from '../simulation/MissionManager';
import { gameStore, regionManager } from '../state/gameStore';
import { h, setText, toggleClass } from './dom';

interface Popup {
  el: HTMLElement;
  world: THREE.Vector3;
  age: number;
}

interface Rover {
  el: HTMLElement;
  eta: HTMLElement;
  world: THREE.Vector3;
  normal: THREE.Vector3;
}

/** How long a "+2 kg" label floats (seconds). */
const POPUP_LIFE = 1.6;
/** Show production labels only when zoomed in on the base. */
const POPUP_MAX_ALT = 2.2;
/** Show rover labels when looking at the globe. */
const ROVER_MIN_ALT = 6;
/** Label height above the rover model (scene units at globe zoom). */
const ROVER_LABEL_LIFT = 2.2;
const ACTIVITY_ICON: Record<MissionActivity, string> = { scanning: '📡', driving: '🚙', night: '🌙', storm: '🌪️', sampling: '🔬', done: '✔' };

/**
 * Things pinned to the 3D world as HTML: little "+2 kg oxygen" labels that float up from a
 * building when a production cycle finishes, and the labels of crew rovers on the globe.
 * Purely visual — they read the store and events, never change them.
 */
export class WorldPopups {
  private layer: HTMLElement;
  private popups: Popup[] = [];
  private rovers = new Map<string, Rover>();
  private readonly v = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();
  private readonly ll = { lat: 0, lon: 0 };

  constructor(
    parent: HTMLElement,
    events: EventBus,
    private terrain: Terrain,
    private gridOf: () => SettlementGrid,
  ) {
    this.layer = h('div', { class: 'popup-layer', attrs: { 'aria-hidden': 'true' } });
    parent.append(this.layer);
    events.on('production:delivered', ({ buildingId, delivered }) => this.spawn(buildingId, delivered));
  }

  private spawn(buildingId: string, delivered: Partial<Record<ResourceId, number>>): void {
    if (this.popups.length > 40) return;
    const b = gameStore.getState().buildings.find((x) => x.id === buildingId);
    if (!b) return;
    const items = (Object.entries(delivered) as [ResourceId, number][]).filter(([id, v]) => v > 0.001 && RESOURCES[id].hud);
    if (!items.length) return;
    const c = rectCenter(footprintRect(b.type, b.gridX, b.gridY, b.rotation));
    const world = this.gridOf().surfacePoint(c.x, c.y, 0.03);
    const el = h(
      'div',
      { class: 'popup' },
      [
        h(
          'div',
          { class: 'popup-inner' },
          items.map(([id, v]) =>
            h('span', { class: 'popup-item', style: { color: RESOURCES[id].color } }, [`+${v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')} ${RESOURCES[id].unit} ${RESOURCES[id].name.toLowerCase()}`]),
          ),
        ),
      ],
    );
    el.style.opacity = '0';
    this.layer.append(el);
    this.popups.push({ el, world, age: 0 });
  }

  update(camera: THREE.PerspectiveCamera, altitude: number, width: number, height: number, dt: number): void {
    // Production labels.
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      if (p.age >= POPUP_LIFE || altitude > POPUP_MAX_ALT) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      this.v.copy(p.world).project(camera);
      if (this.v.z > 1) {
        p.el.style.opacity = '0';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      const t = p.age / POPUP_LIFE;
      // Ease out as it rises; fade in quickly, out slowly.
      const rise = 46 * (1 - (1 - t) * (1 - t));
      const alpha = Math.min(1, t * 8) * (1 - Math.max(0, (t - 0.55) / 0.45));
      p.el.style.transform = `translate(${x.toFixed(1)}px, ${(y - rise).toFixed(1)}px)`;
      p.el.style.opacity = alpha.toFixed(2);
    }

    // Crew rovers (the 3D model is drawn by RoverFleet; this is its label).
    const s = gameStore.getState();
    const active = new Set<string>();
    for (const m of s.missions) {
      if (m.status !== 'active' || m.type !== 'expedition') continue;
      active.add(m.id);
      let r = this.rovers.get(m.id);
      if (!r) {
        const eta = h('span', { class: 'rover-eta' });
        const region = regionManager.get(m.regionId);
        const el = h('div', { class: 'rover-marker', title: `Crew rover: expedition to ${region?.name ?? m.regionId}` }, [eta]);
        this.layer.append(el);
        r = { el, eta, world: new THREE.Vector3(), normal: new THREE.Vector3() };
        this.rovers.set(m.id, r);
      }
      const p = MissionManager.pointOnMission(m, regionManager, MissionManager.routeFraction(m), this.ll);
      this.terrain.surfacePoint(p.lat, p.lon, 0, r.normal);
      r.normal.normalize();
      this.terrain.surfacePoint(p.lat, p.lon, ROVER_LABEL_LIFT * Math.max(1, altitude / 60), r.world);
      setText(r.eta, `${ACTIVITY_ICON[m.activity]} ${MissionManager.remainingSols(m).toFixed(1)} sols`);
    }
    for (const [id, r] of this.rovers) {
      if (active.has(id)) continue;
      r.el.remove();
      this.rovers.delete(id);
    }
    for (const r of this.rovers.values()) {
      this.toCam.copy(camera.position).sub(r.world).normalize();
      const facing = this.toCam.dot(r.normal);
      const show = facing > 0.15 && altitude >= ROVER_MIN_ALT;
      toggleClass(r.el, 'hidden', !show);
      if (!show) continue;
      this.v.copy(r.world).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      r.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
