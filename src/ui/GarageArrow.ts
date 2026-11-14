import * as THREE from 'three';
import type { ArrowFeedback } from '../core/LinkTools';
import type { Terrain } from '../planet/Terrain';
import { gameStore } from '../state/gameStore';
import { h, setText, toggleClass } from './dom';

export interface GarageArrowHooks {
  /** World position of the garage (null when it isn't on screen's base). */
  worldOf(buildingId: string): THREE.Vector3 | null;
  start(garageId: string): void;
  move(clientX: number, clientY: number): ArrowFeedback;
  end(): void;
}

/** Gap between the building and the arrow when it rests (px). */
const REST_OFFSET = 46;

/**
 * The arrow sticking out of a selected Cargo Hauler Garage. It points at the base the
 * haulers drive to; drag it onto another base to change that.
 */
export class GarageArrow {
  private el: HTMLElement;
  private tag: HTMLElement;
  private dragging: { pointerId: number; x: number; y: number } | null = null;
  private readonly v = new THREE.Vector3();
  private readonly t = new THREE.Vector3();

  constructor(
    parent: HTMLElement,
    private terrain: Terrain,
    private hooks: GarageArrowHooks,
  ) {
    this.tag = h('span', { class: 'garage-arrow-tag' });
    this.el = h(
      'div',
      {
        class: 'garage-arrow hidden',
        title: 'Drag me onto another base: that is where the haulers will drive',
        attrs: { role: 'button', 'aria-label': 'Drag onto another base to choose where the haulers drive' },
      },
      [h('span', { class: 'garage-arrow-shaft' }), h('span', { class: 'garage-arrow-head' }), this.tag],
    );
    parent.append(this.el);
    this.el.addEventListener('pointerdown', (e) => {
      const id = this.garageId();
      if (!id || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.el.setPointerCapture(e.pointerId);
      this.dragging = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      toggleClass(this.el, 'dragging', true);
      this.hooks.start(id);
      this.feedback(this.hooks.move(e.clientX, e.clientY));
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.dragging.pointerId) return;
      this.dragging.x = e.clientX;
      this.dragging.y = e.clientY;
      this.feedback(this.hooks.move(e.clientX, e.clientY));
    });
    const stop = (e: PointerEvent) => {
      if (!this.dragging || e.pointerId !== this.dragging.pointerId) return;
      this.dragging = null;
      toggleClass(this.el, 'dragging', false);
      toggleClass(this.el, 'valid', false);
      setText(this.tag, '');
      this.hooks.end();
    };
    this.el.addEventListener('pointerup', stop);
    this.el.addEventListener('pointercancel', stop);
  }

  private garageId(): string | null {
    const s = gameStore.getState();
    const b = s.selectedBuildingId ? s.buildings.find((x) => x.id === s.selectedBuildingId) : undefined;
    return b?.type === 'cargo_garage' ? b.id : null;
  }

  private feedback(f: ArrowFeedback): void {
    setText(this.tag, f.label);
    toggleClass(this.el, 'valid', f.valid);
  }

  /** Keeps the arrow on its garage and pointing at the garage's base (or at the pointer while dragged). */
  update(camera: THREE.PerspectiveCamera, width: number, height: number): void {
    const id = this.garageId();
    const world = id ? this.hooks.worldOf(id) : null;
    if (!id || !world) {
      toggleClass(this.el, 'hidden', true);
      return;
    }
    this.v.copy(world).project(camera);
    const behind = this.v.z > 1;
    const bx = (this.v.x * 0.5 + 0.5) * width;
    const by = (-this.v.y * 0.5 + 0.5) * height;
    if (this.dragging) {
      // From the garage to the pointer.
      const dx = this.dragging.x - bx;
      const dy = this.dragging.y - by;
      this.place(this.dragging.x, this.dragging.y, Math.atan2(dy, dx), Math.max(24, Math.hypot(dx, dy)));
      toggleClass(this.el, 'hidden', false);
      return;
    }
    toggleClass(this.el, 'hidden', behind);
    if (behind) return;
    // Resting: a short arrow out of the building, towards the target base if there is one.
    let angle = -Math.PI / 4;
    const s = gameStore.getState();
    const g = s.buildings.find((x) => x.id === id);
    const to = g?.target ? s.otherBases.find((b) => b.id === g.target) : undefined;
    if (to) {
      this.terrain.surfacePoint(to.lat, to.lon, 0, this.t).project(camera);
      const tx = (this.t.x * 0.5 + 0.5) * width;
      const ty = (-this.t.y * 0.5 + 0.5) * height;
      if (Math.hypot(tx - bx, ty - by) > 4) angle = Math.atan2(ty - by, tx - bx);
    }
    this.place(bx + Math.cos(angle) * REST_OFFSET, by + Math.sin(angle) * REST_OFFSET, angle, REST_OFFSET - 14);
  }

  /** Tip at (x, y), pointing along `angle`, with a shaft `len` px long behind it. */
  private place(x: number, y: number, angle: number, len: number): void {
    this.el.style.setProperty('--len', `${len.toFixed(0)}px`);
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(3)}rad)`;
    this.tag.style.transform = `rotate(${(-angle).toFixed(3)}rad)`;
  }
}
