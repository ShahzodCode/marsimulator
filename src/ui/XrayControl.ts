import type { EventBus } from '../core/EventBus';
import { orbiterFor } from '../data/research';
import { gameStore, watch } from '../state/gameStore';
import { h, setText } from './dom';
import { ICONS } from './icons';

/**
 * The orbiter's radar ("X-ray") view: a toggle and a depth slider. Deeper views are dimmer
 * and blurrier, like real orbital radars (SHARAD sees ~1 km sharply, MARSIS ~5 km coarsely).
 */
export class XrayControl {
  private on = false;
  private frac = 0.1;
  private panel: HTMLElement;
  private slider: HTMLInputElement;
  private depth: HTMLElement;
  private orbiter: HTMLElement;
  private button: HTMLElement;

  constructor(parent: HTMLElement, private events: EventBus) {
    this.button = h('button', {
      class: 'map-btn xray-btn',
      html: ICONS.satellite,
      title: 'Radar X-ray view: look under the surface (V)',
      attrs: { type: 'button', 'aria-label': 'Radar X-ray view' },
      on: { click: () => this.toggle() },
    });
    this.slider = h('input', {
      class: 'xray-slider',
      attrs: { type: 'range', min: '0', max: '1000', value: String(this.frac * 1000), 'aria-label': 'Depth' },
      on: {
        input: () => {
          this.frac = Number(this.slider.value) / 1000;
          this.emit();
        },
      },
    }) as HTMLInputElement;
    this.depth = h('strong', { class: 'xray-depth' });
    this.orbiter = h('p', { class: 'xray-orbiter' });
    const chip = (color: string, text: string) => h('span', { class: 'xray-chip' }, [h('i', { style: { background: color } }), text]);
    this.panel = h('div', { class: 'xray-panel', attrs: { hidden: '' } }, [
      h('div', { class: 'xray-head' }, [h('span', { text: '📡 Radar view' }), this.depth]),
      h('div', { class: 'xray-scale' }, [h('span', { text: 'Surface' }), this.slider, h('span', { class: 'xray-max' })]),
      this.orbiter,
      h('div', { class: 'xray-legend' }, [
        chip('#b3f2ff', 'Ground ice'),
        chip('#8ce6ff', 'Glacier'),
        chip('#ff5a33', 'Hematite'),
        chip('#73ff8c', 'Clays'),
        chip('#ff80ff', 'Lava tube'),
        chip('#338cff', 'Deep water'),
      ]),
      h('p', { class: 'xray-note', text: 'Only regions mapped by the orbiter show data. The deeper you look, the dimmer and blurrier the radar picture gets.' }),
    ]);
    parent.querySelector('.map-controls')?.append(this.button);
    parent.append(this.panel);
    watch(
      (s) => orbiterFor(s.research.completed).tier,
      () => this.emit(),
    );
  }

  get isOn(): boolean {
    return this.on;
  }

  toggle(): void {
    this.on = !this.on;
    this.button.classList.toggle('active', this.on);
    if (this.on) this.panel.removeAttribute('hidden');
    else this.panel.setAttribute('hidden', '');
    this.emit();
  }

  private emit(): void {
    const o = orbiterFor(gameStore.getState().research.completed);
    // Squared slider: fine control near the surface, where most ice is.
    const depthKm = o.maxDepthKm * this.frac * this.frac;
    setText(this.depth, depthKm < 1 ? `${Math.round(depthKm * 1000)} m down` : `${depthKm.toFixed(1)} km down`);
    setText(this.panel.querySelector('.xray-max')!, `${o.maxDepthKm} km`);
    setText(this.orbiter, `${o.name}: ${o.basis}`);
    this.events.emit('xray:set', { on: this.on, depthKm, maxDepthKm: o.maxDepthKm });
  }
}
