import { BUILDINGS, BUILDING_TYPES } from '../data/buildings';
import { GOALS, LEVELS, RESEARCH_UNLOCK_LEVEL, TECHNOLOGIES, levelForXp, nextLevel, rankForXp } from '../data/progression';
import { ProgressionManager } from '../simulation/ProgressionManager';
import { MissionManager } from '../simulation/MissionManager';
import { ORBITAL_SCAN } from '../data/missions';
import { ACTIVITY_TEXT } from './ExplorationPanel';
import { REGION_BY_ID, HOME_REGION_ID } from '../data/regions';
import { RESOURCES, RESOURCE_IDS, formatAmount, formatRate } from '../data/resources';
import { SETTLEMENT } from '../data/settlement';
import type { EventBus } from '../core/EventBus';
import type { SaveManager } from '../persistence/SaveManager';
import { Auth } from '../persistence/Auth';
import { accountButton } from './AuthDialog';
import { ResourceManager } from '../simulation/ResourceManager';
import { gameStore } from '../state/gameStore';
import { buildingIcon, clear, h, setText, toggleClass } from './dom';
import { buildingThumbnail } from '../settlement/buildings/thumbnails';
import { BUILDING_ICONS, ICONS, RESOURCE_ICONS } from './icons';
import type { Panel } from './SidePanel';

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export class MissionsPanel implements Panel {
  readonly id = 'missions' as const;
  readonly title = 'Missions & Goals';
  readonly subtitle = 'Your rank, goals to reach, and orbiters and rovers out exploring.';
  readonly el = h('div', { class: 'missions' });
  private unsub: (() => void) | null = null;
  private bars = new Map<string, { fill: HTMLElement; eta: HTMLElement; note: HTMLElement }>();
  private lastKey = '';
  private rankTitle = h('strong', { class: 'rank-title' });
  private rankIcon = h('span', { class: 'rank-icon' });
  private rankXp = h('span', { class: 'muted' });
  private rankFill = h('span', { class: 'progress-fill' });
  private rankNext = h('p', { class: 'rank-next' });
  private goalRows = new Map<string, { root: HTMLElement; fill: HTMLElement; count: HTMLElement }>();
  private missionBox = h('div');
  private doneKey: string | null = null;

  constructor() {
    const goals = h('div', { class: 'goal-list' });
    for (const g of GOALS) {
      const fill = h('span', { class: 'progress-fill' });
      const count = h('span', { class: 'goal-count' });
      const root = h('div', { class: 'goal', title: g.hint }, [
        h('span', { class: 'goal-icon', text: g.icon }),
        h('div', { class: 'goal-main' }, [
          h('div', { class: 'goal-head' }, [h('strong', { text: g.title }), count]),
          h('div', { class: 'progress' }, [fill]),
          h('span', { class: 'goal-hint', text: g.hint }),
        ]),
        h('span', { class: 'goal-xp', text: `+${g.xp} XP` }),
      ]);
      this.goalRows.set(g.id, { root, fill, count });
      goals.append(root);
    }
    this.el.append(
      h('div', { class: 'rank-card' }, [
        this.rankIcon,
        h('div', { class: 'rank-main' }, [h('div', { class: 'rank-head' }, [this.rankTitle, this.rankXp]), h('div', { class: 'progress' }, [this.rankFill]), this.rankNext]),
      ]),
      h('h3', { class: 'section-title', text: 'Goals' }),
      goals,
      this.missionBox,
    );
  }

  show(): void {
    this.lastKey = '';
    this.doneKey = null;
    this.render();
    this.unsub = gameStore.subscribe(() => this.render());
  }

  hide(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private render(): void {
    const s = gameStore.getState();
    const rank = rankForXp(s.progression.xp);
    const next = nextLevel(rank.level);
    setText(this.rankIcon, rank.icon);
    setText(this.rankTitle, rank.title);
    setText(this.rankXp, `${s.progression.xp} XP`);
    this.rankFill.style.transform = `scaleX(${(next ? Math.min(1, (s.progression.xp - rank.xp) / (next.xp - rank.xp)) : 1).toFixed(3)})`;
    setText(this.rankNext, next ? `${next.xp - s.progression.xp} XP to ${next.icon} ${next.title}: ${next.perks.join(' · ')}` : 'Highest rank reached — the whole settlement salutes you!');

    // Open goals first, finished ones at the bottom (re-ordered only when one is reached).
    const doneKey = GOALS.filter((g) => s.progression.milestones.includes(g.id)).map((g) => g.id).join(',');
    const reorder = doneKey !== this.doneKey;
    this.doneKey = doneKey;
    const ordered = [...GOALS].sort((a, b) => Number(s.progression.milestones.includes(a.id)) - Number(s.progression.milestones.includes(b.id)));
    const list = this.goalRows.get(GOALS[0].id)!.root.parentElement!;
    for (const g of ordered) {
      const row = this.goalRows.get(g.id)!;
      const done = s.progression.milestones.includes(g.id);
      const { current, target } = ProgressionManager.goalProgress(s, g);
      row.fill.style.transform = `scaleX(${Math.min(1, current / target).toFixed(3)})`;
      setText(row.count, done ? '✔ Done' : `${Math.floor(Math.min(current, target))} / ${target}`);
      toggleClass(row.root, 'done', done);
      if (reorder) list.append(row.root);
    }

    const key = s.missions.map((m) => `${m.id}:${m.status}:${m.type === 'expedition' ? m.arrived : ''}`).join(',');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.bars.clear();
      const box = this.missionBox;
      clear(box);
      const active = s.missions.filter((m) => m.status === 'active');
      const done = s.missions.filter((m) => m.status === 'complete').slice(-8).reverse();
      box.append(h('h3', { class: 'section-title', text: `Missions under way (${active.length})` }));
      if (!active.length) {
        box.append(
          h('div', { class: 'empty' }, [
            h('p', { text: 'Nothing is out right now. Map a region from orbit, then send a crew rover to explore it!' }),
            h('button', { class: 'btn primary', text: 'Open Exploration', attrs: { type: 'button' }, on: { click: () => gameStore.getState().openPanel('exploration') } }),
          ]),
        );
      }
      for (const m of active) {
        const r = REGION_BY_ID[m.regionId];
        const fill = h('span', { class: 'progress-fill' });
        const eta = h('span', { class: 'eta' });
        const note = h('div', { class: 'mission-note' });
        this.bars.set(m.id, { fill, eta, note });
        const title = m.type === 'orbital' ? `Orbit map: ${r?.name ?? m.regionId}` : `Crew ${m.arrived ? 'returning from' : 'driving to'} ${r?.name ?? m.regionId}`;
        box.append(
          h('div', { class: 'mission-card live' }, [
            h('div', { class: 'mission-head' }, [h('span', { class: 'btn-icon rover-bob', html: m.type === 'orbital' ? ICONS.satellite : ICONS.rover }), h('strong', { text: title }), eta]),
            h('div', { class: 'progress' }, [fill]),
            note,
          ]),
        );
      }
      box.append(h('h3', { class: 'section-title', text: 'Completed' }));
      if (!done.length) box.append(h('p', { class: 'muted', text: 'No completed missions yet.' }));
      for (const m of done) {
        const r = REGION_BY_ID[m.regionId];
        const reward = m.type === 'expedition' ? m.reward : undefined;
        box.append(
          h('div', { class: 'mission-done', title: reward?.find ?? '' }, [
            h('span', { text: '✔' }),
            h('span', { text: `${r?.name ?? m.regionId} ${m.type === 'orbital' ? 'mapped' : 'explored'}` }),
            h('span', { class: 'muted', text: `+${m.type === 'orbital' ? ORBITAL_SCAN.xp : (reward?.xp ?? 0)} XP` }),
          ]),
        );
      }
    }
    for (const m of s.missions) {
      const bar = this.bars.get(m.id);
      if (!bar) continue;
      bar.fill.style.transform = `scaleX(${m.progress.toFixed(3)})`;
      setText(bar.eta, `${m.type === 'expedition' ? '≈ ' : ''}${MissionManager.remainingSols(m).toFixed(1)} sols left`);
      setText(bar.note, ACTIVITY_TEXT[m.activity]);
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
          h('strong', { text: locked ? `Research unlocks at rank ${unlockAt.title}` : 'Research Lab plans approved!' }),
          h('p', {
            text: locked
              ? `You have ${p.xp} XP — ${unlockAt.xp - p.xp} XP to go. Earn XP by finishing buildings, reaching goals and exploring new regions.`
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
    if (Auth.available) {
      const note = h('p', { class: 'muted' });
      const update = () =>
        setText(note, Auth.current ? `Saving to ${Auth.current.email}.` : 'Playing as a guest. Log in or sign up to keep your colony safe on any device.');
      Auth.onChange(update);
      Auth.ready.then(update);
      update();
      this.el.append(h('h3', { class: 'section-title', text: 'Account' }), note, h('div', { class: 'region-actions' }, [accountButton(document.getElementById('ui-root') ?? document.body)]));
    }
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
    const mapped = Object.values(s.discoveredRegions).filter(Boolean).length;
    const explored = Object.values(s.exploredRegions).filter(Boolean).length;
    clear(this.stats);
    const stat = (label: string, value: string, hint?: string) =>
      h('div', { class: 'stat', title: hint ?? '' }, [h('span', { class: 'stat-label', text: label }), h('strong', { text: value })]);
    this.stats.append(
      stat('Crew', `${s.colony.colonists} / ${s.colony.housing} beds`),
      stat('Power', `${s.power.generationKw.toFixed(0)} / ${s.power.demandKw.toFixed(0)} kW`, 'Solar now / buildings using'),
      stat('Batteries', `${s.power.batteryKwh.toFixed(0)} / ${s.power.batteryCapacityKwh.toFixed(0)} kWh`),
      stat('Ice to mine', `${(s.deposits.ice / 1000).toFixed(1)} t`),
      stat('Rank', `${lvl.icon} ${lvl.title}`, next ? `${next.xp - s.progression.xp} XP to ${next.title}` : 'Highest rank'),
      stat('Explored', `${mapped} mapped · ${explored} visited`, 'Regions mapped from orbit · regions your crew has visited'),
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
            [buildingIcon('row-icon', buildingThumbnail(def.id), BUILDING_ICONS[def.id]), h('span', { class: 'row-name', text: def.name }), h('span', { class: 'row-status', text: `×${list.length}${building ? ` (${building} building)` : ''}` })],
          ),
        );
      }
    }
  }
}

