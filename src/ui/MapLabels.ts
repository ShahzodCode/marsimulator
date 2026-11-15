import * as THREE from 'three';
import { LABEL_FEATURES } from '../data/marsFeatures';
import { BASE_SITES, TRAITS, visibleTraits } from '../data/baseSites';
import { gameStore } from '../state/gameStore';
import type { EventBus } from '../core/EventBus';
import type { Terrain } from '../planet/Terrain';
import { h, toggleClass } from './dom';
import { t } from '../i18n';

interface Label {
  el: HTMLElement;
  world: THREE.Vector3;
  normal: THREE.Vector3;
  minAlt: number;
  maxAlt: number;
  visible: boolean;
  name?: string;
  /** A landmark label hidden because a base or site pin sits on the same spot. */
  suppressed?: boolean;
  /** Last transform and opacity written, to skip identical style writes. */
  tf?: string;
  op?: string;
  /** Smallest scale this label shrinks to as the camera pulls out (none: always full size). */
  minScale?: number;
}

/** Pins closer than this (about 2° of arc) would draw on top of each other. */
const SAME_SPOT_DOT = Math.cos((2 * Math.PI) / 180);

/** Labels are full size up to SHRINK_FROM altitude and smallest (still readable) at SHRINK_TO. */
const SHRINK_FROM = 40;
const SHRINK_TO = 260;
/** Landmark names: just enough to read and see that something is there. */
const LANDMARK_MIN_SCALE = 0.5;
/** Base names stay a little larger than landmarks. */
const BASE_MIN_SCALE = 0.8;

/**
 * HTML labels pinned to famous Martian landmarks and to our base.
 * Hidden when on the far side of the planet or at unsuitable zoom levels.
 */
export class MapLabels {
  private layer: HTMLElement;
  private labels: Label[] = [];
  /** Base and site pins, rebuilt when bases are founded or sites spotted. */
  private dynamic: Label[] = [];
  private lastView = '';
  /** Set when labels were shown, hidden or suppressed outside `update`. */
  private dirty = true;
  private dynKey = '';
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
      this.add(el, terrain.surfacePoint(f.lat, f.lon, 0.6), f.minAltitude ?? 12, 1e9, f.name);
    }
    const refresh = () => this.refreshDynamic(terrain, events);
    gameStore.subscribe(refresh);
    refresh();
  }

  private refreshDynamic(terrain: Terrain, events: EventBus): void {
    const s = gameStore.getState();
    const bases = [s.base, ...s.otherBases];
    const key = `${bases.map((b) => b.id).join(',')}|${s.base.id}|${Object.keys(s.sitesSeen).join(',')}|${s.research.completed.length}`;
    if (key === this.dynKey) return;
    this.dynKey = key;
    for (const l of this.dynamic) l.el.remove();
    this.dynamic = [];
    const push = (el: HTMLElement, lat: number, lon: number, minAlt: number, name?: string, minScale?: number) => {
      el.style.opacity = '0';
      this.layer.append(el);
      const world = terrain.surfacePoint(lat, lon, 0.3);
      this.dynamic.push({ el, world, normal: world.clone().normalize(), minAlt, maxAlt: 1e9, visible: false, name, minScale });
    };
    for (const b of bases) {
      const current = b.id === s.base.id;
      push(
        h(
          'button',
          {
            class: `map-label base${current ? '' : ' other'}`,
            title: current ? t('{base}: the base on screen. Click to fly there.', { base: b.name }) : t('{base}: click to switch to this base.', { base: b.name }),
            attrs: { type: 'button' },
            on: {
              click: () => {
                if (current) events.emit('camera:home');
                else gameStore.getState().switchBase(b.id);
              },
            },
          },
          [h('span', { class: 'pin' }), h('span', { class: 'label-text', text: `${current ? '🏠' : '🏘️'} ${b.name}` })],
        ),
        b.lat,
        b.lon,
        3.2,
        undefined,
        BASE_MIN_SCALE,
      );
    }
    for (const site of BASE_SITES) {
      if (!s.sitesSeen[site.id] || bases.some((b) => b.siteId === site.id)) continue;
      const icons = visibleTraits(site, s.research.completed).map((t) => TRAITS[t].icon).join('');
      push(
        h(
          'button',
          {
            class: 'map-label site',
            title: `${t('{site}: possible base site.', { site: site.name })} ${site.blurb}`,
            attrs: { type: 'button' },
            on: {
              click: () => {
                const st = gameStore.getState();
                st.selectRegion(site.regionId);
                st.openPanel('exploration');
                events.emit('camera:flyTo', { lat: site.lat, lon: site.lon, altitude: 30 });
              },
            },
          },
          [h('span', { class: 'pin' }), h('span', { class: 'label-text', text: `📍 ${site.name} ${icons}` })],
        ),
        site.lat,
        site.lon,
        8,
        site.name,
      );
    }
    // A base or site pin replaces the landmark label it would sit on top of.
    for (const l of this.labels) {
      l.suppressed = this.dynamic.some((d) => (d.name !== undefined && d.name === l.name) || d.normal.dot(l.normal) > SAME_SPOT_DOT);
    }
    this.dirty = true;
  }

  private add(el: HTMLElement, world: THREE.Vector3, minAlt: number, maxAlt: number, name?: string): void {
    el.style.opacity = '0';
    this.layer.append(el);
    this.labels.push({ el, world, normal: world.clone().normalize(), minAlt, maxAlt, visible: false, name, minScale: LANDMARK_MIN_SCALE });
  }

  update(camera: THREE.PerspectiveCamera, altitude: number, width: number, height: number): void {
    // Nothing moved since the last frame (and no label came or went): leave the DOM alone.
    const e = camera.matrixWorld.elements;
    const key = `${e[12]}|${e[13]}|${e[14]}|${e[0]}|${e[1]}|${e[2]}|${e[4]}|${e[5]}|${e[6]}|${width}|${height}|${this.labels.length}|${this.dynamic.length}`;
    if (key === this.lastView && !this.dirty) return;
    this.lastView = key;
    this.dirty = false;
    const t = THREE.MathUtils.clamp((altitude - SHRINK_FROM) / (SHRINK_TO - SHRINK_FROM), 0, 1);
    this.place(this.labels, camera, altitude, width, height, t);
    this.place(this.dynamic, camera, altitude, width, height, t);
  }

  private place(list: Label[], camera: THREE.PerspectiveCamera, altitude: number, width: number, height: number, t: number): void {
    for (const l of list) {
      this.toCam.copy(camera.position).sub(l.world).normalize();
      const facing = this.toCam.dot(l.normal);
      const show = !l.suppressed && facing > 0.18 && altitude >= l.minAlt && altitude <= l.maxAlt;
      if (show) {
        this.v.copy(l.world).project(camera);
        const x = (this.v.x * 0.5 + 0.5) * width;
        const y = (-this.v.y * 0.5 + 0.5) * height;
        const tf = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)${l.minScale === undefined ? '' : ` scale(${(1 - t * (1 - l.minScale)).toFixed(3)})`}`;
        if (tf !== l.tf) l.el.style.transform = l.tf = tf;
        const fade = Math.min(1, (facing - 0.18) / 0.25) * Math.min(1, (altitude - l.minAlt) / Math.max(1, l.minAlt * 0.5));
        const op = fade.toFixed(2);
        if (op !== l.op) l.el.style.opacity = l.op = op;
      }
      if (show !== l.visible) {
        l.visible = show;
        toggleClass(l.el, 'hidden', !show);
        if (!show) l.el.style.opacity = l.op = '0';
      }
    }
  }
}
