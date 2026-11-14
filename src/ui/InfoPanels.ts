import { BUILDINGS, BUILDING_TYPES } from '../data/buildings';
import { LEVELS, RESEARCH_UNLOCK_LEVEL, TECHNOLOGIES, levelForXp, nextLevel } from '../data/progression';
import { REGION_BY_ID, HOME_REGION_ID } from '../data/regions';
import { RESOURCES, RESOURCE_IDS, formatAmount, formatRate } from '../data/resources';
import { SETTLEMENT } from '../data/settlement';
import type { EventBus } from '../core/EventBus';
import type { SaveManager } from '../persistence/SaveManager';
import { ResourceManager } from '../simulation/ResourceManager';
import { gameStore } from '../state/gameStore';
import { buildingIcon, clear, h, setText } from './dom';
import { buildingThumbnail } from '../settlement/buildings/thumbnails';
import { ICONS, RESOURCE_ICONS } from './icons';
import type { Panel } from './SidePanel';

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export class MissionsPanel implements Panel {
  readonly id = 'missions' as const;
  readonly title = 'Missions';
  readonly subtitle = 'Survey rovers currently exploring Mars.';
  readonly el = h('div', { class: 'missions' });
  private unsub: (() => void) | null = null;
  private bars = new Map<string, { fill: HTMLElement; eta: HTMLElement }>();
  private lastKey = '';

  show(): void {
    this.lastKey = '';
    this.render();
    this.unsub = gameStore.subscribe(() => this.render());
  }

  hide(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private render(): void {
    const s = gameStore.getState();
    const key = s.missions.map((m) => `${m.id}:${m.status}`).join(',');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.bars.clear();
      clear(this.el);
      const active = s.missions.filter((m) => m.status === 'active');
      const done = s.missions.filter((m) => m.status === 'complete').slice(-8).reverse();
      this.el.append(h('h3', { class: 'section-title', text: `Active (${active.length})` }));
      if (!active.length) {
        this.el.append(
          h('div', { class: 'empty' }, [
            h('p', { text: 'No rovers are out right now. Pick a region next to explored land and send a survey rover!' }),
            h('button', { class: 'btn primary', text: 'Open Exploration', attrs: { type: 'button' }, on: { click: () => gameStore.getState().openPanel('exploration') } }),
          ]),
        );
      }
      for (const m of active) {
        const r = REGION_BY_ID[m.regionId];
        const fill = h('span', { class: 'progress-fill' });
        const eta = h('span', { class: 'eta' });
        this.bars.set(m.id, { fill, eta });
        this.el.append(
          h('div', { class: 'mission-card' }, [
            h('div', { class: 'mission-head' }, [h('span', { class: 'btn-icon', html: ICONS.rover }), h('strong', { text: `Survey: ${r?.name ?? m.regionId}` }), eta]),
            h('div', { class: 'progress' }, [fill]),
          ]),
        );
      }
      this.el.append(h('h3', { class: 'section-title', text: 'Completed' }));
      if (!done.length) this.el.append(h('p', { class: 'muted', text: 'No completed missions yet.' }));
      for (const m of done) {
        const r = REGION_BY_ID[m.regionId];
        this.el.append(h('div', { class: 'mission-done' }, [h('span', { text: '✔' }), h('span', { text: `${r?.name ?? m.regionId} explored` })]));
      }
    }
    for (const m of s.missions) {
      const bar = this.bars.get(m.id);
      if (!bar) continue;
      bar.fill.style.transform = `scaleX(${m.progress.toFixed(3)})`;
      setText(bar.eta, `${Math.max(0, (1 - m.progress) * m.durationSols).toFixed(1)} sols left`);
    }
  }
}

// ---------------------------------------------------------------------------
// Research (locked in Stage 1)
// ---------------------------------------------------------------------------

export class ResearchPanel implements Panel {
  readonly id = 'research' as const;
  readonly title = 'Research';
  readonly subtitle = 'New technologies for your colony.';
  readonly el = h('div', { class: 'research' });
  private unsub: (() => void) | null = null;
  private lastLevel = -1;

  show(): void {
    this.lastLevel = -1;
    this.render();
    this.unsub = gameStore.subscribe(() => this.render());
  }

  hide(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private render(): void {
    const p = gameStore.getState().progression;
    if (p.level === this.lastLevel) return;
    this.lastLevel = p.level;
    clear(this.el);
    const unlockAt = LEVELS.find((l) => l.level === RESEARCH_UNLOCK_LEVEL)!;
    const locked = p.level < RESEARCH_UNLOCK_LEVEL;
    this.el.append(
      h('div', { class: `lock-card ${locked ? '' : 'unlocked'}` }, [
        h('span', { class: 'lock-icon', html: ICONS.lock }),
        h('div', {}, [
          h('strong', { text: locked ? `Research unlocks at Level ${RESEARCH_UNLOCK_LEVEL} (${unlockAt.title})` : 'Research Lab plans approved!' }),
          h('p', {
            text: locked
              ? `You have ${p.xp} XP — ${unlockAt.xp - p.xp} XP to go. Earn XP by finishing buildings (+20) and discovering regions (+45).`
              : 'Your scientists are ready. Research projects open in the next mission update.',
          }),
        ]),
      ]),
      h('h3', { class: 'section-title', text: 'Technologies on the horizon' }),
      ...TECHNOLOGIES.map((t) =>
        h('div', { class: 'tech-card' }, [h('span', { class: 'tech-icon', text: t.icon }), h('div', {}, [h('strong', { text: t.name }), h('p', { text: t.description })])]),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Settlement overview (+ save / load)
// ---------------------------------------------------------------------------

export class SettlementPanel implements Panel {
  readonly id = 'settlement' as const;
  readonly title = SETTLEMENT.name;
  readonly subtitle = 'Settlement overview';
  readonly el = h('div', { class: 'settlement' });
  private unsub: (() => void) | null = null;
  private rows = new Map<string, { amount: HTMLElement; rate: HTMLElement; left: HTMLElement }>();
  private stats!: HTMLElement;
  private buildingList!: HTMLElement;
  private saveStatus!: HTMLElement;
  private lastBuildingsKey = '';

  constructor(
    private events: EventBus,
    private saves: SaveManager,
    private onLoaded: () => void,
  ) {
    this.build();
  }

  private build(): void {
    const home = REGION_BY_ID[HOME_REGION_ID];
    this.stats = h('div', { class: 'stat-grid' });
    const table = h('div', { class: 'res-table' }, [
      h('div', { class: 'res-row head' }, [h('span', { text: 'Resource' }), h('span', { text: 'Stock' }), h('span', { text: 'Per sol' }), h('span', { text: 'Lasts' })]),
    ]);
    for (const id of RESOURCE_IDS) {
      const amount = h('span');
      const rate = h('span');
      const left = h('span');
      this.rows.set(id, { amount, rate, left });
      table.append(
        h('div', { class: 'res-row' }, [
          h('span', { class: 'res-name', style: { ['--chip-color' as never]: RESOURCES[id].color } }, [h('span', { class: 'cost-icon', html: RESOURCE_ICONS[id] }), RESOURCES[id].name]),
          amount,
          rate,
          left,
        ]),
      );
    }
    this.buildingList = h('div', { class: 'building-list' });
    this.saveStatus = h('p', { class: 'muted save-status' });
    this.el.append(
      h('p', { class: 'location', text: `📍 Jezero Crater · ${SETTLEMENT.lat.toFixed(1)}°N ${SETTLEMENT.lon.toFixed(1)}°E · ${home.name} (${home.id})` }),
      this.stats,
      h('h3', { class: 'section-title', text: 'Resources' }),
      table,
      h('h3', { class: 'section-title', text: 'Buildings' }),
      this.buildingList,
      h('h3', { class: 'section-title', text: 'Game' }),
      h('div', { class: 'region-actions' }, [
        h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: () => this.events.emit('camera:home') } }, [h('span', { class: 'btn-icon', html: ICONS.home }), 'Fly to base']),
        h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: () => this.save() } }, [h('span', { class: 'btn-icon', html: ICONS.save }), 'Save']),
        h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: () => this.load() } }, [h('span', { class: 'btn-icon', html: ICONS.load }), 'Load']),
      ]),
      this.saveStatus,
    );
  }

  private async save(): Promise<void> {
    try {
      const r = await this.saves.save(gameStore.getState());
      const time = new Date(r.data.savedAt).toLocaleTimeString();
      setText(this.saveStatus, r.cloud ? `Saved to the cloud at ${time}.` : `Saved on this device at ${time} (cloud unavailable).`);
      this.events.emit('game:saved', { ok: true, message: r.cloud ? 'Game saved to the cloud' : 'Game saved on this device' });
    } catch (e) {
      setText(this.saveStatus, `Could not save: ${(e as Error).message}`);
    }
  }

  private async load(): Promise<void> {
    try {
      const state = await this.saves.load();
      if (!state) {
        setText(this.saveStatus, 'No saved game yet.');
        return;
      }
      gameStore.getState().replaceState(state);
      this.onLoaded();
      setText(this.saveStatus, 'Game loaded — press ▶ to continue.');
    } catch (e) {
      setText(this.saveStatus, `Could not load: ${(e as Error).message}`);
    }
  }

  show(): void {
    this.lastBuildingsKey = '';
    this.render();
    this.unsub = gameStore.subscribe(() => this.render());
    const cached = this.saves.cachedInfo();
    if (cached && !this.saveStatus.textContent)
      setText(this.saveStatus, `Last save: Sol ${cached.sol}, ${new Date(cached.savedAt).toLocaleString()}${cached.cloud ? ' ☁️' : ''}`);
    this.saves.info().then((i) => {
      if (i && (!this.saveStatus.textContent || this.saveStatus.textContent.startsWith('Last save'))) setText(this.saveStatus, `Last save: Sol ${i.sol}, ${new Date(i.savedAt).toLocaleString()}`);
    });
  }

  hide(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private render(): void {
    const s = gameStore.getState();
    const lvl = levelForXp(s.progression.xp);
    const next = nextLevel(lvl.level);
    const explored = Object.values(s.discoveredRegions).filter(Boolean).length;
    clear(this.stats);
    const stat = (label: string, value: string, hint?: string) =>
      h('div', { class: 'stat', title: hint ?? '' }, [h('span', { class: 'stat-label', text: label }), h('strong', { text: value })]);
    this.stats.append(
      stat('Crew', `${s.colony.colonists} / ${s.colony.housing} beds`),
      stat('Energy', `${s.energy.generation.toFixed(0)} / ${s.energy.consumption.toFixed(0)} kW`, 'Generated / used'),
      stat('Level', `${lvl.level} · ${lvl.title}`, next ? `${next.xp - s.progression.xp} XP to level ${next.level}` : 'Max level'),
      stat('Explored', `${explored} / 30 regions`),
    );
    for (const id of RESOURCE_IDS) {
      const r = this.rows.get(id)!;
      setText(r.amount, `${formatAmount(s.resources[id])} / ${formatAmount(s.storage[id])} ${RESOURCES[id].unit}`);
      setText(r.rate, formatRate(s.rates[id]));
      r.rate.className = s.rates[id] > 0.05 ? 'up' : s.rates[id] < -0.05 ? 'down' : '';
      const left = ResourceManager.solsRemaining(s.resources[id], s.rates[id]);
      setText(r.left, left === Infinity ? '∞' : `${Math.floor(left)} sols`);
    }
    const key = s.buildings.map((b) => `${b.id}:${b.isOperational}`).join(',');
    if (key !== this.lastBuildingsKey) {
      this.lastBuildingsKey = key;
      clear(this.buildingList);
      for (const type of BUILDING_TYPES) {
        const list = s.buildings.filter((b) => b.type === type);
        if (!list.length) continue;
        const def = BUILDINGS[type];
        const building = list.filter((b) => !b.isOperational).length;
        this.buildingList.append(
          h(
            'button',
            {
              class: 'building-row',
              attrs: { type: 'button' },
              title: 'Select and show on the map',
              on: {
                click: () => {
                  const b = list[0];
                  gameStore.getState().selectBuilding(b.id);
                  this.events.emit('camera:flyTo', { lat: b.latitude, lon: b.longitude, altitude: 0.35 });
                },
              },
            },
            [buildingIcon('row-icon', buildingThumbnail(def.id), def.icon), h('span', { class: 'row-name', text: def.name }), h('span', { class: 'row-status', text: `×${list.length}${building ? ` (${building} building)` : ''}` })],
          ),
        );
      }
    }
  }
}

