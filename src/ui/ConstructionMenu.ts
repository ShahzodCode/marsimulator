import { BUILDINGS, BUILDING_TYPES, maxPowerKw, type BuildingType } from '../data/buildings';
import { RECIPES, recipeRatePerSol } from '../data/recipes';
import { hasRank, rankById } from '../data/progression';
import { ConstructionManager } from '../simulation/ConstructionManager';
import { buildCost, envOf } from '../simulation/BaseEnv';
import { RESOURCES, RESOURCE_IDS, type ResourceId } from '../data/resources';
import { ResourceManager } from '../simulation/ResourceManager';
import { gameStore } from '../state/gameStore';
import { buildingIcon, h, setText, toggleClass } from './dom';
import { buildingSilhouette, buildingThumbnail } from '../settlement/buildings/thumbnails';
import { BUILDING_ICONS, MISC_ICONS, RESOURCE_ICONS } from './icons';
import { hasTech, TECH_BY_ID } from '../data/research';
import { focusResearch } from './ResearchPanel';
import type { Panel } from './SidePanel';
import { ROAD_COST } from '../settlement/RoadRules';
import { Logistics } from '../simulation/Logistics';
import { t, tn } from '../i18n';

interface Card {
  type: BuildingType;
  root: HTMLButtonElement;
  costs: Map<ResourceId, HTMLElement>;
  note: HTMLElement;
  badge: HTMLElement;
}

/** The black cut-out shown in place of a building nobody has invented yet. */
function shadowIcon(type: BuildingType): HTMLElement {
  const src = buildingSilhouette(type);
  return src
    ? h('span', { class: 'card-icon shadow-icon has-thumb' }, [h('img', { attrs: { src, alt: '', draggable: 'false' } })])
    : h('span', { class: 'card-icon shadow-icon', html: BUILDING_ICONS[type] });
}

const SUB: Record<ResourceId, string> = { regolith: t('regolith'), iron: t('iron'), water: t('water'), oxygen: 'O₂', food: t('food'), hydrogen: 'H₂' };

function fmt(v: number): string {
  return v >= 10 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '');
}

/** Construction menu: pick a building, then click a spot on the map to place it. */
export class ConstructionMenu implements Panel {
  readonly id = 'construction' as const;
  readonly title = t('Construction');
  readonly subtitle = t('Choose a building, then click on the glowing circle around the base.');
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
          h('span', { class: 'cost-n', text: `${amount}` }),
        ]);
        costs.set(id, el);
        costRow.append(el);
      }
      const effects: string[] = [];
      if (def.solarPeakKw > 0) effects.push(`☀ ${t('up to {kw} kW in sunshine', { kw: fmt(def.solarPeakKw) })}`);
      if (def.batteryKwh > 0) effects.push(`🔋 ${t('stores {n} kWh', { n: def.batteryKwh })}`);
      const kw = maxPowerKw(type);
      if (kw > 0) effects.push(`⚡ ${t('uses {kw} kW', { kw: fmt(kw) })}`);
      const flows: string[] = [];
      for (const id of RESOURCE_IDS) {
        const v = def.recipes.reduce((sum, r) => sum + recipeRatePerSol(RECIPES[r], id), 0);
        if (Math.abs(v) > 1e-6) flows.push(`${v > 0 ? '+' : '−'}${fmt(Math.abs(v))} ${SUB[id]}`);
      }
      if (flows.length) effects.push(t('{list} per sol', { list: flows.join(', ') }));
      if (def.housing) effects.push(`🛏 ${tn(def.housing, '{n} bed', '{n} beds')}`);
      if (def.steadyKw) effects.push(`⚛ ${t('{kw} kW day and night', { kw: def.steadyKw })}`);
      if (def.researchPerSol) effects.push(`🔬 ${t('{n} research points per sol', { n: def.researchPerSol })}`);
      if (def.con) effects.push(`⚠ ${def.con}`);
      const stores = (Object.keys(def.storage) as ResourceId[]).length;
      if (stores && def.buildable) effects.push(`📦 ${t('more storage for every resource')}`);
      const badge = h('span', { class: 'lock-badge' });
      const note = h('div', { class: 'card-note' });
      const root = h(
        'button',
        {
          class: 'build-card',
          attrs: { type: 'button', 'aria-label': t('Build {name}', { name: def.name }) },
          on: { click: () => this.choose(type) },
        },
        [
          buildingIcon('card-icon real-icon', buildingThumbnail(type), BUILDING_ICONS[type]),
          def.requiresTech ? shadowIcon(type) : null,
          h('div', { class: 'card-main' }, [
            h('div', { class: 'card-title' }, [h('span', { class: 'card-name', text: def.name }), badge]),
            def.requiresTech
              ? h('div', { class: 'shadow-title' }, [h('span', { text: t('Unknown technology') })])
              : null,
            def.requiresTech
              ? h('div', { class: 'shadow-note' }, [
                  h('span', { class: 'row-icon', html: MISC_ICONS.rp }),
                  h('span', { text: t('Invent it first: research “{tech}”.', { tech: TECH_BY_ID[def.requiresTech].name }) }),
                ])
              : null,
            h('div', { class: 'card-desc', text: def.description }),
            h('div', { class: 'card-effects', text: effects.join(' · ') }),
            h('div', { class: 'card-foot' }, [costRow, h('span', { class: 'build-time', text: `⏱ ${tn(def.buildTimeSols, '{n} sol', '{n} sols')}` })]),
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
          t('{n} each', { n: amount }),
        ]),
      );
    }
    this.roadNote = h('div', { class: 'card-note' });
    this.roadCard = h(
      'button',
      {
        class: 'build-card road-card',
        attrs: { type: 'button', 'aria-label': t('Build roads') },
        on: {
          click: () => {
            const res = gameStore.getState().startRoadMode();
            if (!res.ok) gameStore.getState().pushAlert({ key: 'cant-afford', level: 'warning', title: t('Not enough regolith for roads'), message: res.reason });
          },
        },
      },
      [
        buildingIcon('card-icon', buildingThumbnail('road'), '🛣️'),
        h('div', { class: 'card-main' }, [
          h('div', { class: 'card-title', text: t('Road (N)') }),
          h('div', {
            class: 'card-desc',
            text: t('Rovers carry goods along roads. Lay pieces one by one from the Storage Depot to each building — without a road, its goods pile up and can’t reach the base.'),
          }),
          h('div', { class: 'card-effects', text: t('Drag to lay road · click a piece to remove it') }),
          h('div', { class: 'card-foot' }, [costRow, h('span', { class: 'build-time', text: `⏱ ${t('instant')}` })]),
          this.roadNote,
        ]),
      ],
    );
    this.el.append(this.roadCard);
  }

  private choose(type: BuildingType): void {
    const tech = BUILDINGS[type].requiresTech;
    if (tech && !hasTech(gameStore.getState().research.completed, tech)) {
      focusResearch(tech);
      return;
    }
    const res = gameStore.getState().startPlacement(type);
    if (!res.ok) {
      gameStore.getState().pushAlert({ key: 'cant-afford', level: 'warning', title: t('Not enough materials for {name}', { name: BUILDINGS[type].name }), message: res.reason });
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
    // Bases joined by working pipelines pay for buildings together.
    const stock = Logistics.pooledResources(s);
    for (const c of this.cards) {
      const def = BUILDINGS[c.type];
      const check = ConstructionManager.canBuild(s, c.type);
      const locked = !check.ok && check.code === 'locked';
      const cost = buildCost(c.type, envOf(s));
      toggleClass(c.root, 'disabled', !check.ok);
      toggleClass(c.root, 'locked', locked);
      const unknown = !hasTech(s.research.completed, def.requiresTech);
      toggleClass(c.root, 'unresearched', unknown);
      c.root.setAttribute('aria-label', unknown ? t('Unknown technology — open research for {tech}', { tech: TECH_BY_ID[def.requiresTech!].name }) : t('Build {name}', { name: def.name }));
      c.root.setAttribute('aria-disabled', String(!check.ok));
      for (const [id, el] of c.costs) {
        toggleClass(el, 'short', (cost[id] ?? 0) > stock[id] + 1e-9);
        setText(el.querySelector('.cost-n')!, `${cost[id] ?? 0}`);
      }
      // Same order as BaseEnv's lock reasons: rank first, then research, then the site.
      const rankLocked = locked && !hasRank(s.progression.level, def.unlockRank);
      setText(c.badge, !locked ? '' : rankLocked ? `🔒 ${rankById(def.unlockRank!).title}` : unknown ? `🔬 ${t('Research')}` : `📍 ${t('Site')}`);
      setText(
        c.note,
        check.ok
          ? ''
          : check.code === 'power'
            ? `⚡ ${check.reason}`
            : rankLocked
              ? t('Earn XP to reach {rank} — finish buildings, goals and missions.', { rank: rankById(def.unlockRank!).title })
              : check.reason,
      );
      toggleClass(c.note, 'warn', !check.ok && check.code === 'power');
    }
  }
}
