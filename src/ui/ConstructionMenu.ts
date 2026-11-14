import { BUILDINGS, BUILDING_TYPES, type BuildingType } from '../data/buildings';
import { RESOURCES, type ResourceId } from '../data/resources';
import { ResourceManager } from '../simulation/ResourceManager';
import { gameStore } from '../state/gameStore';
import { h, setText, toggleClass } from './dom';
import { RESOURCE_ICONS } from './icons';
import type { Panel } from './SidePanel';
import { ROAD_COST } from '../settlement/RoadRules';

interface Card {
  type: BuildingType;
  root: HTMLButtonElement;
  costs: Map<ResourceId, HTMLElement>;
  note: HTMLElement;
}

const SUB: Record<ResourceId, string> = { regolith: 'regolith', iron: 'iron', water: 'water', oxygen: 'O₂', food: 'food' };

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
      if (def.energy > 0) effects.push(`⚡ makes ${def.energy} kW`);
      if (def.energy < 0) effects.push(`⚡ uses ${-def.energy} kW`);
      const flows: string[] = [];
      for (const [id, v] of Object.entries(def.production) as [ResourceId, number][]) flows.push(`+${v} ${SUB[id]}`);
      for (const [id, v] of Object.entries(def.consumption) as [ResourceId, number][]) flows.push(`−${v} ${SUB[id]}`);
      if (flows.length) effects.push(`${flows.join(', ')} per sol`);
      if (def.housing) effects.push(`🛏 ${def.housing} beds`);
      const note = h('div', { class: 'card-note' });
      const root = h(
        'button',
        {
          class: 'build-card',
          attrs: { type: 'button', 'aria-label': `Build ${def.name}` },
          on: { click: () => this.choose(type) },
        },
        [
          h('div', { class: 'card-icon', text: def.icon }),
          h('div', { class: 'card-main' }, [
            h('div', { class: 'card-title', text: def.name }),
            h('div', { class: 'card-desc', text: def.description }),
            h('div', { class: 'card-effects', text: effects.join(' · ') }),
            h('div', { class: 'card-foot' }, [costRow, h('span', { class: 'build-time', text: `⏱ ${def.buildTimeSols} sol` })]),
            note,
          ]),
        ],
      );
      this.cards.push({ type, root, costs, note });
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
        h('div', { class: 'card-icon', text: '🛣️' }),
        h('div', { class: 'card-main' }, [
          h('div', { class: 'card-title', text: 'Road (N)' }),
          h('div', {
            class: 'card-desc',
            text: 'Rovers carry goods along roads. Lay pieces one by one from the plaza to each building — without a road, its goods pile up and can’t reach the base.',
          }),
          h('div', { class: 'card-effects', text: 'Click or drag to lay pieces · click a piece to remove it' }),
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
    const spare = s.energy.generation - s.energy.consumption;
    const roadOk = ResourceManager.canAfford(s.resources, ROAD_COST);
    toggleClass(this.roadCard, 'disabled', !roadOk);
    setText(this.roadNote, roadOk ? '' : ResourceManager.describeMissing(s.resources, ROAD_COST));
    for (const c of this.cards) {
      const def = BUILDINGS[c.type];
      const affordable = ResourceManager.canAfford(s.resources, def.constructionCost);
      toggleClass(c.root, 'disabled', !affordable);
      c.root.setAttribute('aria-disabled', String(!affordable));
      for (const [id, el] of c.costs) toggleClass(el, 'short', (def.constructionCost[id] ?? 0) > s.resources[id]);
      let note = '';
      if (!affordable) note = ResourceManager.describeMissing(s.resources, def.constructionCost);
      else if (def.energy < 0 && spare < -def.energy) note = '⚠ Needs more power — build a Solar Farm too';
      setText(c.note, note);
      toggleClass(c.note, 'warn', affordable && note !== '');
    }
  }
}
