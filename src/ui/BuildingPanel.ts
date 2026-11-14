import { BUILDINGS } from '../data/buildings';
import { RESOURCES, type ResourceId } from '../data/resources';
import type { EventBus } from '../core/EventBus';
import { formatMarsTime } from '../core/GameClock';
import { gameStore } from '../state/gameStore';
import type { BuildingInstance } from '../state/types';
import { clear, h, setText } from './dom';
import { ICONS } from './icons';

/** Floating card describing the selected building. */
export class BuildingPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private shownId: string | null = null;
  private status!: HTMLElement;
  private progressFill: HTMLElement | null = null;
  private live = new Map<string, HTMLElement>();

  constructor(
    parent: HTMLElement,
    private events: EventBus,
  ) {
    this.body = h('div', { class: 'bp-body' });
    this.el = h('section', { class: 'building-panel', attrs: { 'aria-live': 'polite' } }, [this.body]);
    parent.append(this.el);
    gameStore.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = gameStore.getState();
    const b = s.selectedBuildingId ? s.buildings.find((x) => x.id === s.selectedBuildingId) : undefined;
    this.el.classList.toggle('open', !!b);
    if (!b) {
      this.shownId = null;
      return;
    }
    if (b.id !== this.shownId) {
      this.shownId = b.id;
      this.build(b);
    }
    this.update(b);
  }

  private build(b: BuildingInstance): void {
    const def = BUILDINGS[b.type];
    clear(this.body);
    this.live.clear();
    this.status = h('span', { class: 'status-pill' });
    this.progressFill = h('span', { class: 'progress-fill' });
    const stats = h('div', { class: 'bp-stats' });
    const stat = (key: string, label: string) => {
      const v = h('strong');
      this.live.set(key, v);
      stats.append(h('div', { class: 'stat' }, [h('span', { class: 'stat-label', text: label }), v]));
    };
    stat('energy', def.energy >= 0 ? 'Makes power' : 'Uses power');
    for (const id of Object.keys(def.production) as ResourceId[]) stat(`p-${id}`, `Makes ${RESOURCES[id].name.toLowerCase()} /sol`);
    for (const id of Object.keys(def.consumption) as ResourceId[]) stat(`c-${id}`, `Uses ${RESOURCES[id].name.toLowerCase()} /sol`);
    if (def.housing) stat('housing', 'Beds');
    stat('road', 'Road');
    if (Object.keys(def.production).length) stat('stored', 'Waiting for pickup');
    stat('built', 'Started');

    this.body.append(
      h('div', { class: 'bp-head' }, [
        h('span', { class: 'bp-icon', text: def.icon }),
        h('div', { class: 'bp-title' }, [h('h3', { text: def.name }), this.status]),
        h('button', {
          class: 'icon-btn',
          html: ICONS.close,
          title: 'Close',
          attrs: { 'aria-label': 'Close building info' },
          on: { click: () => gameStore.getState().selectBuilding(null) },
        }),
      ]),
      h('div', { class: 'progress bp-progress' }, [this.progressFill]),
      h('p', { class: 'bp-desc', text: def.description }),
      stats,
      h('div', { class: 'fun-fact' }, [h('strong', { text: 'Did you know? ' }), def.funFact]),
      h('div', { class: 'bp-actions' }, [
        h(
          'button',
          {
            class: 'btn',
            attrs: { type: 'button' },
            on: { click: () => this.events.emit('camera:flyTo', { lat: b.latitude, lon: b.longitude, altitude: 0.28 }) },
          },
          [h('span', { class: 'btn-icon', html: ICONS.target }), 'Zoom to building'],
        ),
        h('span', { class: 'muted bp-coords', text: `${b.latitude.toFixed(3)}°N, ${b.longitude.toFixed(3)}°E` }),
      ]),
    );
  }

  private update(b: BuildingInstance): void {
    const def = BUILDINGS[b.type];
    const building = b.constructionProgress < 1;
    let text: string;
    let cls: string;
    if (building) {
      text = `Building… ${Math.floor(b.constructionProgress * 100)}%`;
      cls = 'surveying';
    } else if (b.efficiency >= 0.999) {
      text = 'Operational';
      cls = 'explored';
    } else if (b.efficiency <= 0.001) {
      text = b.statusNote ?? 'Stopped';
      cls = 'critical';
    } else {
      text = b.statusNote ?? `Running at ${Math.round(b.efficiency * 100)}%`;
      cls = 'warning';
    }
    setText(this.status, text);
    this.status.className = `status-pill ${cls}`;
    const bar = this.progressFill?.parentElement;
    if (bar) bar.style.display = building ? '' : 'none';
    if (this.progressFill) this.progressFill.style.transform = `scaleX(${b.constructionProgress.toFixed(3)})`;

    const eff = b.isOperational ? b.efficiency : 0;
    const e = this.live.get('energy');
    if (e) setText(e, b.isOperational ? `${Math.abs(def.energy)} kW` : `${Math.abs(def.energy)} kW (when built)`);
    for (const id of Object.keys(def.production) as ResourceId[]) {
      const el = this.live.get(`p-${id}`);
      if (el) setText(el, `${((def.production[id] ?? 0) * eff).toFixed(1)} / ${def.production[id]}`);
    }
    for (const id of Object.keys(def.consumption) as ResourceId[]) {
      const el = this.live.get(`c-${id}`);
      if (el) setText(el, `${((def.consumption[id] ?? 0) * eff).toFixed(1)}`);
    }
    const rEl = this.live.get('road');
    if (rEl) {
      setText(rEl, b.connected ? '✔ Connected' : '✖ No road');
      rEl.style.color = b.connected ? '' : '#ffb020';
    }
    const sEl = this.live.get('stored');
    if (sEl) {
      const parts = (Object.entries(b.stored) as [ResourceId, number][]).filter(([, v]) => v >= 0.05).map(([id, v]) => `${v.toFixed(0)} ${RESOURCES[id].name.toLowerCase()}`);
      setText(sEl, parts.length ? parts.join(', ') : 'nothing');
    }
    const hEl = this.live.get('housing');
    if (hEl) setText(hEl, `${def.housing}`);
    const bEl = this.live.get('built');
    if (bEl) setText(bEl, `Sol ${formatMarsTime(b.placedAtSol).sol}`);
  }
}
