import type { EventBus } from '../core/EventBus';
import { REGION_BY_ID } from '../data/regions';
import { gameStore } from '../state/gameStore';
import { MARS_RADIUS_KM, R } from '../planet/geo';
import { h, setText } from './dom';
import { ICONS } from './icons';

export interface CameraView {
  readonly heading: number;
  readonly alt: number;
  zoomAt(factor: number): void;
  resetHeading(): void;
  readonly viewHeightUnits: number;
}

/** Zoom buttons, compass, scale bar and the coordinates readout. */
export class MapControls {
  private needle: HTMLElement;
  private coords: HTMLElement;
  private region: HTMLElement;
  private scaleLabel: HTMLElement;
  private scaleBar: HTMLElement;
  private lastHeading = NaN;

  constructor(
    parent: HTMLElement,
    events: EventBus,
    private cam: CameraView,
  ) {
    this.needle = h('span', { class: 'needle', html: '<span class="n">N</span>' });
    const btn = (icon: string, title: string, fn: () => void) =>
      h('button', { class: 'map-btn', html: icon, title, attrs: { type: 'button', 'aria-label': title }, on: { click: fn } });
    const controls = h('div', { class: 'map-controls' }, [
      h('button', { class: 'compass', title: 'Point north up', attrs: { type: 'button', 'aria-label': 'Reset rotation to north' }, on: { click: () => cam.resetHeading() } }, [this.needle]),
      btn(ICONS.plus, 'Zoom in (+)', () => cam.zoomAt(0.6)),
      btn(ICONS.minus, 'Zoom out (−)', () => cam.zoomAt(1.6)),
      btn(ICONS.home, 'Fly to the base (H)', () => events.emit('camera:home')),
      btn(ICONS.globe, 'Show the whole planet (G)', () => events.emit('camera:globe')),
    ]);
    this.coords = h('span', { class: 'coords-ll', text: '—' });
    this.region = h('span', { class: 'coords-region' });
    this.scaleLabel = h('span', { class: 'scale-label' });
    this.scaleBar = h('span', { class: 'scale-bar' });
    const readout = h('div', { class: 'coords' }, [h('div', { class: 'scale' }, [this.scaleBar, this.scaleLabel]), this.coords, this.region]);
    parent.append(controls, readout);

    events.on('pointer:surface', (p) => {
      if (!p) {
        setText(this.coords, '—');
        setText(this.region, '');
        return;
      }
      const ns = p.lat >= 0 ? 'N' : 'S';
      const ew = p.lon >= 0 ? 'E' : 'W';
      setText(this.coords, `${Math.abs(p.lat).toFixed(2)}°${ns}  ${Math.abs(p.lon).toFixed(2)}°${ew}`);
      const r = REGION_BY_ID[p.regionId];
      const known = gameStore.getState().discoveredRegions[p.regionId];
      setText(this.region, r ? `${r.id} ${r.name}${known ? '' : ' · not mapped'}` : '');
    });
  }

  /** Called every frame (cheap: only touches the DOM when values change). */
  update(): void {
    const hd = this.cam.heading;
    if (Math.abs(hd - this.lastHeading) > 0.002) {
      this.lastHeading = hd;
      this.needle.style.transform = `rotate(${(-hd * 180) / Math.PI}deg)`;
    }
    // Scale bar (map distances): hidden at settlement zoom, where buildings are drawn larger than life.
    const showScale = this.cam.alt > 4;
    const scaleEl = this.scaleBar.parentElement!;
    if ((scaleEl.style.display !== 'none') !== showScale) scaleEl.style.display = showScale ? '' : 'none';
    if (!showScale) return;
    // A round distance that fits in ~90 px.
    const pxPerUnit = window.innerHeight / Math.max(1e-6, this.cam.viewHeightUnits);
    const kmPerUnit = MARS_RADIUS_KM / R;
    const targetKm = (90 / pxPerUnit) * kmPerUnit;
    const nice = niceNumber(targetKm);
    const px = (nice / kmPerUnit) * pxPerUnit;
    this.scaleBar.style.width = `${px.toFixed(0)}px`;
    setText(this.scaleLabel, nice >= 1 ? `${nice.toLocaleString()} km` : `${Math.round(nice * 1000)} m`);
  }
}

function niceNumber(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  const n = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return n * p;
}
