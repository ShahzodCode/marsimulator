import * as THREE from 'three';
import { LABEL_FEATURES } from '../data/marsFeatures';
import { SETTLEMENT } from '../data/settlement';
import type { EventBus } from '../core/EventBus';
import type { Terrain } from '../planet/Terrain';
import { h, toggleClass } from './dom';

interface Label {
  el: HTMLElement;
  world: THREE.Vector3;
  normal: THREE.Vector3;
  minAlt: number;
  maxAlt: number;
  visible: boolean;
}

/**
 * HTML labels pinned to famous Martian landmarks and to our base.
 * Hidden when on the far side of the planet or at unsuitable zoom levels.
 */
export class MapLabels {
  private layer: HTMLElement;
  private labels: Label[] = [];
  private readonly v = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();

  constructor(parent: HTMLElement, terrain: Terrain, events: EventBus) {
    this.layer = h('div', { class: 'label-layer', attrs: { 'aria-hidden': 'false' } });
    parent.append(this.layer);
    for (const f of LABEL_FEATURES) {
      const el = h(
        'button',
        {
          class: `map-label ${f.kind}`,
          title: f.fact,
          attrs: { type: 'button' },
          on: { click: () => events.emit('camera:flyTo', { lat: f.lat, lon: f.lon, altitude: f.kind === 'crater' ? 25 : 55 }) },
        },
        [h('span', { class: 'pin' }), h('span', { class: 'label-text', text: f.name })],
      );
      this.add(el, terrain.surfacePoint(f.lat, f.lon, 0.6), f.minAltitude ?? 12, 1e9);
    }
    const base = h(
      'button',
      {
        class: 'map-label base',
        title: 'Your settlement in Jezero Crater — an ancient lake with a river delta, where NASA’s Perseverance rover landed in 2021. Click to fly there.',
        attrs: { type: 'button' },
        on: { click: () => events.emit('camera:home') },
      },
      [h('span', { class: 'pin' }), h('span', { class: 'label-text', text: `🏠 ${SETTLEMENT.name} · Jezero Crater` })],
    );
    this.add(base, terrain.surfacePoint(SETTLEMENT.lat, SETTLEMENT.lon, 0.3), 3.2, 1e9);
  }

  private add(el: HTMLElement, world: THREE.Vector3, minAlt: number, maxAlt: number): void {
    el.style.opacity = '0';
    this.layer.append(el);
    this.labels.push({ el, world, normal: world.clone().normalize(), minAlt, maxAlt, visible: false });
  }

  update(camera: THREE.PerspectiveCamera, altitude: number, width: number, height: number): void {
    for (const l of this.labels) {
      this.toCam.copy(camera.position).sub(l.world).normalize();
      const facing = this.toCam.dot(l.normal);
      const show = facing > 0.18 && altitude >= l.minAlt && altitude <= l.maxAlt;
      if (show) {
        this.v.copy(l.world).project(camera);
        const x = (this.v.x * 0.5 + 0.5) * width;
        const y = (-this.v.y * 0.5 + 0.5) * height;
        l.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        const fade = Math.min(1, (facing - 0.18) / 0.25) * Math.min(1, (altitude - l.minAlt) / Math.max(1, l.minAlt * 0.5));
        l.el.style.opacity = fade.toFixed(2);
      }
      if (show !== l.visible) {
        l.visible = show;
        toggleClass(l.el, 'hidden', !show);
        if (!show) l.el.style.opacity = '0';
      }
    }
  }
}
