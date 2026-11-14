import { BUILDINGS, BUILDING_TYPES, maxPowerKw, type BuildingType } from '../data/buildings';
import { RECIPES, recipeRatePerSol } from '../data/recipes';
import { rankById } from '../data/progression';
import { ConstructionManager } from '../simulation/ConstructionManager';
import { RESOURCES, RESOURCE_IDS, type ResourceId } from '../data/resources';
import { ResourceManager } from '../simulation/ResourceManager';
import { gameStore } from '../state/gameStore';
import { buildingIcon, h, setText, toggleClass } from './dom';
import { buildingThumbnail } from '../settlement/buildings/thumbnails';
import { RESOURCE_ICONS } from './icons';
import type { Panel } from './SidePanel';
import { ROAD_COST } from '../settlement/RoadRules';

interface Card {
  type: BuildingType;
  root: HTMLButtonElement;
  costs: Map<ResourceId, HTMLElement>;
  note: HTMLElement;
  badge: HTMLElement;
}

const SUB: Record<ResourceId, string> = { regolith: 'regolith', iron: 'iron', water: 'water', oxygen: 'O₂', food: 'food', hydrogen: 'H₂' };

function fmt(v: number): string {
  return v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
}

/** Construction menu: pick a building, then click a spot on the map to place it. */
export class ConstructionMenu implements Panel {
  readonly id = 'construction' as const;
  readonly title = 'Construction';
  readonly subtitle = 'Choose a building, then click on the glowing circle around the base.';
  readonly el: HTMLElement;
  private cards: Card[] = [];
  private roadCard!: HTMLButtonElement;
  private roadNote!: HTMLElement;
  private unsub: (() => void) | null = null;

  constructor() {
    this.el = h('div', { class: 'build-grid' });
    this.addRoadCard();
    for (const type of BUILDING_TYPES) {
      const def = BUILDINGS[type];
      if (!def.buildable) continue;
      const costs = new Map<ResourceId, HTMLElement>();
      const costRow = h('div', { class: 'cost-row' });
      for (const [id, amount] of Object.entries(def.constructionCost) as [ResourceId, number][]) {
        const el = h('span', { class: 'cost', title: RESOURCES[id].name, style: { ['--chip-color' as never]: RESOURCES[id].color } }, [
          h('span', { class: 'cost-icon', html: RESOURCE_ICONS[id] }),
          `${amount}`,
        ]);
        costs.set(id, el);
        costRow.append(el);
      }
      const effects: string[] = [];
      if (def.solarPeakKw > 0) effects.push(`☀ up to ${fmt(def.solarPeakKw)} kW in sunshine`);
      if (def.batteryKwh > 0) effects.push(`🔋 stores ${def.batteryKwh} kWh`);
      const kw = maxPowerKw(type);
      if (kw > 0) effects.push(`⚡ uses ${fmt(kw)} kW`);
      const flows: string[] = [];
      for (const id of RESOURCE_IDS) {
        const v = def.recipes.reduce((sum, r) => sum + recipeRatePerSol(RECIPES[r], id), 0);
        if (Math.abs(v) > 1e-6) flows.push(`${v > 0 ? '+' : '−'}${fmt(Math.abs(v))} ${SUB[id]}`);
      }
      if (flows.length) effects.push(`${flows.join(', ')} per sol`);
      if (def.housing) effects.push(`🛏 ${def.housing} beds`);
      const stores = (Object.keys(def.storage) as ResourceId[]).length;
      if (stores && def.buildable) effects.push('📦 more storage for every resource');
      const badge = h('span', { class: 'lock-badge' });
      const note = h('div', { class: 'card-note' });
      const root = h(
        'button',
        {
          class: 'build-card',
          attrs: { type: 'button', 'aria-label': `Build ${def.name}` },
          on: { click: () => this.choose(type) },
        },
        [
          buildingIcon('card-icon', buildingThumbnail(type), def.icon),
          h('div', { class: 'card-main' }, [
            h('div', { class: 'card-title' }, [def.name, badge]),
            h('div', { class: 'card-desc', text: def.description }),
            h('div', { class: 'card-effects', text: effects.join(' · ') }),
            h('div', { class: 'card-foot' }, [costRow, h('span', { class: 'build-time', text: `⏱ ${def.buildTimeSols} sol` })]),
            note,
          ]),
        ],
      );
      this.cards.push({ type, root, costs, note, badge });
      this.el.append(root);
    }
  }

  private addRoadCard(): void {
    const costRow = h('div', { class: 'cost-row' });
    for (const [id, amount] of Object.entries(ROAD_COST) as [ResourceId, number][]) {
      costRow.append(
        h('span', { class: 'cost', title: RESOURCES[id].name, style: { ['--chip-color' as never]: RESOURCES[id].color } }, [
          h('span', { class: 'cost-icon', html: RESOURCE_ICONS[id] }),
          `${amount} each`,
        ]),
      );
    }
    this.roadNote = h('div', { class: 'card-note' });
    this.roadCard = h(
      'button',
      {
        class: 'build-card road-card',
        attrs: { type: 'button', 'aria-label': 'Build roads' },
        on: {
          click: () => {
            const res = gameStore.getState().startRoadMode();
            if (!res.ok) gameStore.getState().pushAlert({ key: 'cant-afford', level: 'warning', title: 'Not enough regolith for roads', message: res.reason });
          },
        },
      },
      [
        buildingIcon('card-icon', buildingThumbnail('road'), '🛣️'),
        h('div', { class: 'card-main' }, [
          h('div', { class: 'card-title', text: 'Road (N)' }),
          h('div', {
            class: 'card-desc',
            text: 'Rovers carry goods along roads. Lay pieces one by one from the Storage Depot to each building — without a road, its goods pile up and can’t reach the base.',
          }),
          h('div', { class: 'card-effects', text: 'Drag a straight line to lay road · click a piece to remove it' }),
          h('div', { class: 'card-foot' }, [costRow, h('span', { class: 'build-time', text: '⏱ instant' })]),
          this.roadNote,
        ]),
      ],
    );
    this.el.append(this.roadCard);
  }

  private choose(type: BuildingType): void {
    const res = gameStore.getState().startPlacement(type);
    if (!res.ok) {
      gameStore.getState().pushAlert({ key: 'cant-afford', level: 'warning', title: `Not enough materials for ${BUILDINGS[type].name}`, message: res.reason });
    }
  }

  show(): void {
    this.refresh();
    this.unsub = gameStore.subscribe(() => this.refresh());
  }

  hide(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private refresh(): void {
    const s = gameStore.getState();
    const roadOk = ResourceManager.canAfford(s.resources, ROAD_COST);
    toggleClass(this.roadCard, 'disabled', !roadOk);
    setText(this.roadNote, roadOk ? '' : ResourceManager.describeMissing(s.resources, ROAD_COST));
    for (const c of this.cards) {
      const def = BUILDINGS[c.type];
      const check = ConstructionManager.canBuild(s, c.type);
      const locked = !check.ok && check.code === 'locked';
      toggleClass(c.root, 'disabled', !check.ok);
      toggleClass(c.root, 'locked', locked);
      c.root.setAttribute('aria-disabled', String(!check.ok));
      for (const [id, el] of c.costs) toggleClass(el, 'short', (def.constructionCost[id] ?? 0) > s.resources[id] + 1e-9);
      setText(c.badge, locked && def.unlockRank ? `🔒 ${rankById(def.unlockRank).title}` : '');
      setText(c.note, check.ok ? '' : check.code === 'power' ? `⚡ ${check.reason}` : check.code === 'locked' ? `Earn XP to reach ${rankById(def.unlockRank!).title} — finish buildings, goals and missions.` : check.reason);
      toggleClass(c.note, 'warn', !check.ok && check.code === 'power');
    }
  }
}
