import { BUILDINGS, demolishRefund, maxPowerKw } from '../data/buildings';
import { RECIPES, type RecipeId } from '../data/recipes';
import { RESOURCES, formatAmount, type ResourceId } from '../data/resources';
import type { EventBus } from '../core/EventBus';
import { formatMarsTime } from '../core/GameClock';
import { gameStore } from '../state/gameStore';
import type { BuildingInstance, BuildingStatus } from '../state/types';
import { buildingIcon, clear, h, setText, toggleClass } from './dom';
import { buildingThumbnail } from '../settlement/buildings/thumbnails';
import { BUILDING_ICONS, ICONS, RESOURCE_ICONS } from './icons';

const STATUS: Record<BuildingStatus, { text: string; cls: string }> = {
  operational: { text: 'Working', cls: 'explored' },
  waiting_materials: { text: 'Waiting for materials', cls: 'warning' },
  insufficient_power: { text: 'Not enough power', cls: 'critical' },
  storage_full: { text: 'Storage full', cls: 'warning' },
  under_construction: { text: 'Building…', cls: 'surveying' },
  disabled: { text: 'Switched off', cls: 'disabled' },
  no_road: { text: 'No road', cls: 'warning' },
};

interface RecipeRow {
  root: HTMLElement;
  fill: HTMLElement;
  state: HTMLElement;
  last: number;
}

function amountChip(id: ResourceId, v: number): HTMLElement {
  const txt = v >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return h('span', { class: 'cost', title: RESOURCES[id].name, style: { ['--chip-color' as never]: RESOURCES[id].color } }, [
    h('span', { class: 'cost-icon', html: RESOURCE_ICONS[id] }),
    `${txt} ${RESOURCES[id].unit}`,
  ]);
}


/** Floating card describing the selected building. */
export class BuildingPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private shownId: string | null = null;
  private status!: HTMLElement;
  private progressFill: HTMLElement | null = null;
  private live = new Map<string, HTMLElement>();
  private note!: HTMLElement;
  private recipeRows = new Map<RecipeId, RecipeRow>();
  private toggle: HTMLButtonElement | null = null;

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
    this.recipeRows.clear();
    this.status = h('span', { class: 'status-pill' });
    this.note = h('p', { class: 'bp-status-note' });
    this.progressFill = h('span', { class: 'progress-fill' });
    const stats = h('div', { class: 'bp-stats' });
    const stat = (key: string, label: string) => {
      const v = h('strong');
      this.live.set(key, v);
      stats.append(h('div', { class: 'stat' }, [h('span', { class: 'stat-label', text: label }), v]));
    };
    const isStore = Object.keys(def.storage).length > 0;
    if (def.solarPeakKw > 0) stat('solar', 'Solar power now');
    if (maxPowerKw(b.type) > 0) stat('power', 'Electricity');
    if (def.batteryKwh > 0) stat('battery', 'Settlement batteries');
    for (const id of Object.keys(def.storage) as ResourceId[]) stat(`s-${id}`, `${RESOURCES[id].name} in storage`);
    if (def.recipes.some((r) => RECIPES[r].deposit)) stat('ice', 'Ice left to mine');
    if (def.housing) stat('housing', 'Beds');
    if (!isStore && def.recipes.length) stat('road', 'Road');
    if (def.recipes.length) stat('stored', 'Waiting for pickup');
    stat('built', 'Started');

    const recipes = h('div', { class: 'recipe-list' });
    for (const rid of def.recipes) {
      const r = RECIPES[rid];
      const fill = h('span', { class: 'progress-fill' });
      const state = h('span', { class: 'recipe-state' });
      const ins = (Object.entries(r.inputs) as [ResourceId, number][]).map(([id, v]) => amountChip(id, v));
      const outs = (Object.entries(r.outputs) as [ResourceId, number][]).map(([id, v]) => amountChip(id, v));
      const root = h('div', { class: 'recipe' }, [
        h('div', { class: 'recipe-head' }, [h('strong', { text: r.name }), state]),
        h('div', { class: 'recipe-flow' }, [
          ...(ins.length ? ins : [h('span', { class: 'muted', text: r.deposit ? 'buried ice' : 'Martian air & soil' })]),
          h('span', { class: 'arrow', text: '→' }),
          ...outs,
        ]),
        h('div', { class: 'progress recipe-progress' }, [fill]),
        h('div', { class: 'recipe-foot' }, [
          h('span', { class: 'recipe-desc', text: r.description }),
          h('span', { class: 'recipe-meta', text: `⚡ ${r.energyKw.toFixed(1)} kW · ${r.durationSols} sol` }),
        ]),
      ]);
      this.recipeRows.set(rid, { root, fill, state, last: 0 });
      recipes.append(root);
    }

    this.toggle = null;
    if (maxPowerKw(b.type) > 0) {
      this.toggle = h(
        'button',
        {
          class: 'switch',
          attrs: { type: 'button', role: 'switch', 'aria-label': 'Building power' },
          title: 'Switch this building on or off. Switched-off buildings use no electricity and make nothing.',
          on: {
            click: () => {
              const st = gameStore.getState();
              const cur = st.buildings.find((x) => x.id === b.id);
              if (!cur) return;
              const res = st.setBuildingEnabled(b.id, !cur.enabled);
              if (!res.ok) st.pushAlert({ key: 'switch-error', level: 'warning', title: 'Can’t switch it on', message: res.reason });
            },
          },
        },
        [h('span', { class: 'switch-knob' })],
      );
    }

    this.body.append(
      h('div', { class: 'bp-head' }, [
        buildingIcon('bp-icon', buildingThumbnail(def.id), BUILDING_ICONS[def.id]),
        h('div', { class: 'bp-title' }, [h('h3', { text: def.name }), this.status]),
        h('button', {
          class: 'icon-btn',
          html: ICONS.close,
          title: 'Close',
          attrs: { 'aria-label': 'Close building info' },
          on: { click: () => gameStore.getState().selectBuilding(null) },
        }),
      ]),
      this.note,
      h('div', { class: 'progress bp-progress' }, [this.progressFill]),
      h('p', { class: 'bp-desc', text: def.description }),
      ...(def.recipes.length ? [recipes] : []),
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
        this.toggle ? h('span', { class: 'switch-row' }, [this.toggle, h('span', { text: 'Power on' })]) : null,
      ]),
      h('div', { class: 'bp-actions' }, [this.demolishControl(b)]),
    );
  }

  /** Demolish button (asks for a second click), or a note for the original base. */
  private demolishControl(b: BuildingInstance): HTMLElement {
    if (b.starter || b.type === 'storage_depot') {
      return h('span', { class: 'muted bp-note', text: 'Part of the original base: it can’t be demolished.' });
    }
    const refund = (Object.entries(demolishRefund(b.type)) as [ResourceId, number][])
      .map(([id, v]) => `${v} ${RESOURCES[id].name.toLowerCase()}`)
      .join(', ');
    let armed = false;
    let timer = 0;
    const label = h('span', { text: 'Demolish' });
    const btn = h(
      'button',
      {
        class: 'btn danger',
        title: `Get back half of what it cost${refund ? ` (${refund})` : ''}. Energy is not refunded.`,
        attrs: { type: 'button' },
        on: {
          click: () => {
            if (!armed) {
              armed = true;
              setText(label, refund ? `Click again: get back ${refund}` : 'Click again to demolish');
              timer = window.setTimeout(() => {
                armed = false;
                setText(label, 'Demolish');
              }, 4000);
              return;
            }
            window.clearTimeout(timer);
            const res = gameStore.getState().demolishBuilding(b.id);
            if (!res.ok) gameStore.getState().pushAlert({ key: 'demolish-error', level: 'warning', title: 'Can’t demolish', message: res.reason });
          },
        },
      },
      [label],
    );
    return btn;
  }

  private update(b: BuildingInstance): void {
    const def = BUILDINGS[b.type];
    const s = gameStore.getState();
    const building = b.constructionProgress < 1;
    const st = STATUS[b.status] ?? STATUS.operational;
    setText(this.status, building ? `Building… ${Math.floor(b.constructionProgress * 100)}%` : st.text);
    const cls = `status-pill ${st.cls}`;
    if (this.status.className !== cls) this.status.className = cls;
    setText(this.note, building ? 'Construction robots are at work. Pausing the game pauses them too.' : (b.statusNote ?? ''));
    this.note.style.display = this.note.textContent ? '' : 'none';
    const bar = this.progressFill?.parentElement;
    if (bar) bar.style.display = building ? '' : 'none';
    if (this.progressFill) this.progressFill.style.transform = `scaleX(${b.constructionProgress.toFixed(3)})`;

    for (const [rid, row] of this.recipeRows) {
      const rs = b.recipes[rid];
      const p = rs?.progress ?? 0;
      if (p < row.last - 0.02) {
        // A cycle finished: snap back to empty (no backwards animation) and flash the row.
        row.fill.style.transition = 'none';
        row.fill.style.transform = `scaleX(${p.toFixed(3)})`;
        void row.fill.offsetWidth;
        row.fill.style.transition = '';
        row.root.classList.remove('done');
        void row.root.offsetWidth;
        row.root.classList.add('done');
      } else row.fill.style.transform = `scaleX(${p.toFixed(3)})`;
      row.last = p;
      const running = b.isOperational && b.enabled && b.powered && b.status === 'operational' && !!rs?.loaded;
      setText(row.state, !b.isOperational ? 'after construction' : running ? `${Math.floor(p * 100)}%` : st.text.toLowerCase());
      toggleClass(row.root, 'running', running);
    }

    const lv = (k: string) => this.live.get(k);
    const kw = maxPowerKw(b.type);
    const pEl = lv('power');
    if (pEl) {
      setText(pEl, !b.isOperational ? `${kw.toFixed(1)} kW when built` : !b.enabled ? 'Off — 0 kW' : b.powered ? `✔ up to ${kw.toFixed(1)} kW` : `✖ needs ${kw.toFixed(1)} kW`);
      pEl.style.color = b.isOperational && b.enabled && !b.powered ? 'var(--bad)' : '';
    }
    const sEl = lv('solar');
    if (sEl) setText(sEl, b.isOperational ? `${(def.solarPeakKw * s.power.sun).toFixed(1)} / ${def.solarPeakKw.toFixed(0)} kW${s.power.sun > 0 ? '' : ' · night'}` : 'when built');
    const bEl = lv('battery');
    if (bEl) setText(bEl, `${s.power.batteryKwh.toFixed(0)} / ${s.power.batteryCapacityKwh.toFixed(0)} kWh`);
    for (const id of Object.keys(def.storage) as ResourceId[]) {
      const el = lv(`s-${id}`);
      if (!el) continue;
      const full = s.resources[id] >= s.storage[id] - 0.5;
      setText(el, `${formatAmount(s.resources[id])} / ${formatAmount(s.storage[id])} ${RESOURCES[id].unit}`);
      el.style.color = full ? 'var(--warn)' : '';
    }
    const iEl = lv('ice');
    if (iEl) setText(iEl, `${(s.deposits.ice / 1000).toFixed(1)} t`);
    const rEl = lv('road');
    if (rEl) {
      setText(rEl, b.connected ? '✔ Connected' : '✖ No road');
      rEl.style.color = b.connected ? '' : 'var(--warn)';
    }
    const wEl = lv('stored');
    if (wEl) {
      const parts = (Object.entries(b.stored) as [ResourceId, number][]).filter(([, v]) => v >= 0.05).map(([id, v]) => `${v.toFixed(0)} ${RESOURCES[id].name.toLowerCase()}`);
      setText(wEl, parts.length ? parts.join(', ') : 'nothing');
    }
    const hEl = lv('housing');
    if (hEl) setText(hEl, `${def.housing}`);
    const tEl = lv('built');
    if (tEl) setText(tEl, `Sol ${formatMarsTime(b.placedAtSol).sol}`);
    if (this.toggle) {
      toggleClass(this.toggle, 'on', b.enabled);
      this.toggle.setAttribute('aria-checked', String(b.enabled));
    }
  }
}
