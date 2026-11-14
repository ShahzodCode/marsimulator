import { BUILDINGS, BUILDING_TYPES, type BuildingType } from '../data/buildings';
import { LEVELS, RESEARCH_UNLOCK_LEVEL } from '../data/progression';
import { RESOURCES, type ResourceId } from '../data/resources';
import {
  BRANCHES,
  STAGES,
  TECHS,
  TECH_BY_ID,
  canResearch,
  orbiterFor,
  rpDone,
  stageMaterials,
  stageRp,
  techTier,
  type TechDefinition,
  type TechId,
} from '../data/research';
import { buildingSilhouette, buildingThumbnail } from '../settlement/buildings/thumbnails';
import { Logistics } from '../simulation/Logistics';
import { ResourceManager, type Cost } from '../simulation/ResourceManager';
import { gameStore, type GameStore } from '../state/gameStore';
import { buildingIcon, clear, h, setText, toggleClass } from './dom';
import { BRANCH_ICONS, BUILDING_ICONS, ICONS, MISC_ICONS, RESOURCE_ICONS, STAGE_ICONS, TECH_ICONS } from './icons';
import type { Panel } from './SidePanel';

const TIER_NAMES = ['Basics', 'Advanced', 'Frontier'];
const TIERS = Math.max(...TECHS.map((t) => techTier(t.id))) + 1;

type NodeState = 'done' | 'active' | 'open' | 'locked';

let instance: ResearchPanel | null = null;
let pendingFocus: TechId | null = null;

/** Opens the Research panel with one project selected (e.g. from a dark building card). */
export function focusResearch(id: TechId): void {
  pendingFocus = id;
  if (instance?.isOpen) instance.select(id);
  gameStore.getState().openPanel('research');
}

function fmtSols(v: number): string {
  return v < 1 ? 'under 1 sol' : `${Math.ceil(v)} sol${Math.ceil(v) === 1 ? '' : 's'}`;
}

/**
 * The research tree. Technologies (not buildings) are the nodes: one row per branch,
 * deeper projects to the right, lines showing what leads to what. Every project goes
 * through four development stages; two of them need test hardware paid in materials.
 */
export class ResearchPanel implements Panel {
  readonly id = 'research' as const;
  readonly title = 'Research';
  readonly subtitle = 'Invent new technology, one development stage at a time. Labs at every base work together.';
  readonly el = h('div', { class: 'research' });
  isOpen = false;
  private unsub: (() => void) | null = null;
  private key = '';
  private selected: TechId | null = null;
  private liveBar: { fill: HTMLElement; eta: HTMLElement } | null = null;
  private livePips: HTMLElement[] = [];
  private tree: HTMLElement | null = null;
  private wires: SVGSVGElement | null = null;
  private resize = new ResizeObserver(() => this.drawWires());

  show(): void {
    instance = this;
    this.isOpen = true;
    if (pendingFocus) this.selected = pendingFocus;
    pendingFocus = null;
    this.key = '';
    this.render();
    this.unsub = gameStore.subscribe(() => this.render());
  }

  hide(): void {
    this.isOpen = false;
    this.unsub?.();
    this.unsub = null;
    this.resize.disconnect();
  }

  select(id: TechId): void {
    this.selected = id;
    pendingFocus = null;
    this.key = '';
    this.render();
  }

  private labs(s: GameStore): { rp: number; count: number } {
    let rp = 0;
    let count = 0;
    for (const list of [s.buildings, ...s.otherBases.map((b) => b.buildings)]) {
      for (const b of list) {
        const per = BUILDINGS[b.type].researchPerSol ?? 0;
        if (!per || !b.isOperational) continue;
        count++;
        if (b.enabled && b.powered) rp += per;
      }
    }
    return { rp, count };
  }

  private stateOf(s: GameStore, t: TechDefinition): NodeState {
    if (s.research.completed.includes(t.id)) return 'done';
    if (s.research.active === t.id) return 'active';
    return canResearch(s.research.completed, t.id) ? 'open' : 'locked';
  }

  /** Stage and progress of any project, wherever it is (active, on hold or not started). */
  private progressOf(s: GameStore, id: TechId): { stage: number; progress: number; awaiting: boolean } {
    if (s.research.completed.includes(id)) return { stage: STAGES.length, progress: 0, awaiting: false };
    if (s.research.active === id) return s.research;
    return s.research.shelved[id] ?? { stage: 0, progress: 0, awaiting: false };
  }

  private render(): void {
    const s = gameStore.getState();
    const { rp, count } = this.labs(s);
    const r = s.research;
    const nextCost = r.active && r.awaiting ? stageMaterials(TECH_BY_ID[r.active], r.stage + 1) : {};
    const affordable = ResourceManager.canAfford(Logistics.pooledResources(s), nextCost);
    const key = [s.progression.level, r.completed.join(','), r.active, r.stage, r.awaiting, Object.keys(r.shelved).join(','), rp, count, this.selected, affordable].join('|');
    if (key !== this.key) {
      this.key = key;
      this.build(s, rp, count);
    }
    this.updateLive(s, rp);
  }

  /** Cheap per-tick updates: progress bars and time left. */
  private updateLive(s: GameStore, rp: number): void {
    const r = s.research;
    if (!r.active) return;
    const t = TECH_BY_ID[r.active];
    const need = stageRp(t, r.stage);
    const f = Math.min(1, r.progress / need);
    const left = (t.cost - rpDone(t, r.stage, r.progress)) / Math.max(rp, 1e-9);
    if (this.liveBar) {
      this.liveBar.fill.style.transform = `scaleX(${f.toFixed(3)})`;
      setText(this.liveBar.eta, r.awaiting ? 'Stage finished — waiting for materials' : rp > 0 ? `${fmtSols((need - r.progress) / rp)} left in this stage · ${fmtSols(left)} in all` : 'Paused — no working lab');
    }
    this.livePips[r.stage]?.style.setProperty('--fill', f.toFixed(3));
  }

  private build(s: GameStore, rp: number, labCount: number): void {
    clear(this.el);
    this.liveBar = null;
    this.livePips = [];
    this.resize.disconnect();
    const r = s.research;
    if (!this.selected || !TECH_BY_ID[this.selected]) {
      this.selected = r.active ?? TECHS.find((t) => this.stateOf(s, t) === 'open')?.id ?? TECHS[0].id;
    }

    // Status strip.
    const o = orbiterFor(r.completed);
    this.el.append(
      h('div', { class: 'rs-strip' }, [
        h('div', { class: 'rs-stat' }, [h('span', { class: 'rs-stat-icon', html: MISC_ICONS.rp }), h('div', {}, [h('strong', { text: `${rp}` }), h('span', { text: 'research points / sol' })])]),
        h('div', { class: 'rs-stat' }, [h('span', { class: 'rs-stat-icon', html: ICONS.research }), h('div', {}, [h('strong', { text: `${labCount}` }), h('span', { text: labCount === 1 ? 'Research Lab' : 'Research Labs' })])]),
        h('div', { class: 'rs-stat' }, [h('span', { class: 'rs-stat-icon', html: ICONS.satellite }), h('div', {}, [h('strong', { text: o.name }), h('span', { text: `radar view to ${o.maxDepthKm} km` })])]),
        h('div', { class: 'rs-stat' }, [h('span', { class: 'rs-stat-icon', html: MISC_ICONS.done }), h('div', {}, [h('strong', { text: `${r.completed.length} / ${TECHS.length}` }), h('span', { text: 'technologies' })])]),
      ]),
    );

    const unlockAt = LEVELS.find((l) => l.level === RESEARCH_UNLOCK_LEVEL)!;
    if (s.progression.level < RESEARCH_UNLOCK_LEVEL) {
      this.el.append(
        h('div', { class: 'lock-card' }, [
          h('span', { class: 'lock-icon', html: ICONS.lock }),
          h('div', {}, [
            h('strong', { text: `Research Labs unlock at rank ${unlockAt.title}` }),
            h('p', { text: `You have ${s.progression.xp} XP — ${unlockAt.xp - s.progression.xp} XP to go. You can already explore the tree below.` }),
          ]),
        ]),
      );
    } else if (labCount === 0) {
      this.el.append(
        h('div', { class: 'lock-card unlocked' }, [
          h('span', { class: 'lock-icon', html: ICONS.research }),
          h('div', {}, [h('strong', { text: 'Build a Research Lab' }), h('p', { text: 'Labs make research points. Pick a project here, and every working lab at every base helps.' })]),
        ]),
      );
    }

    if (r.active) this.el.append(this.activeCard(s, TECH_BY_ID[r.active]));

    // The tree.
    const tree = h('div', { class: 'rs-tree', style: { ['--tiers' as never]: String(TIERS) } });
    this.tree = tree;
    this.wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.wires.classList.add('rs-wires');
    tree.append(this.wires, h('div', { class: 'rs-corner' }));
    for (let i = 0; i < TIERS; i++) tree.append(h('div', { class: 'rs-tier-head', text: `Tier ${i + 1} · ${TIER_NAMES[i] ?? ''}` }));
    BRANCHES.forEach((br, row) => {
      tree.append(
        h('div', { class: 'rs-branch', style: { gridRow: String(row + 2), ['--branch' as never]: br.color } }, [
          h('span', { class: 'rs-branch-icon', html: BRANCH_ICONS[br.id] }),
          h('span', { text: br.name }),
        ]),
      );
      for (const t of TECHS.filter((x) => x.branch === br.id)) {
        const node = this.node(s, t);
        node.style.gridRow = String(row + 2);
        node.style.gridColumn = String(techTier(t.id) + 2);
        node.style.setProperty('--branch', br.color);
        tree.append(node);
      }
    });
    const scroller = h('div', { class: 'rs-tree-scroll' }, [tree]);
    this.el.append(scroller);
    this.resize.observe(tree);
    requestAnimationFrame(() => this.drawWires());

    this.el.append(this.detail(s, TECH_BY_ID[this.selected!], rp, labCount));
  }

  private node(s: GameStore, t: TechDefinition): HTMLElement {
    const state = this.stateOf(s, t);
    const p = this.progressOf(s, t.id);
    const shelved = !!s.research.shelved[t.id];
    const builds = BUILDING_TYPES.some((b) => BUILDINGS[b].requiresTech === t.id);
    const pips = STAGES.map((st, i) => {
      const fill = i < p.stage || (i === p.stage && p.awaiting) ? 1 : i === p.stage ? Math.min(1, p.progress / stageRp(t, i)) : 0;
      return h('span', { class: 'rs-pip', title: st.name, style: { ['--fill' as never]: fill.toFixed(3) } });
    });
    const el = h(
      'button',
      {
        class: `rs-node ${state}${shelved ? ' shelved' : ''}${this.selected === t.id ? ' selected' : ''}`,
        attrs: { type: 'button', 'data-tech': t.id, 'aria-pressed': String(this.selected === t.id) },
        on: { click: () => this.select(t.id) },
      },
      [
        h('span', { class: 'rs-hex', html: state === 'locked' ? ICONS.lock : TECH_ICONS[t.id] }),
        h('span', { class: 'rs-node-main' }, [
          h('span', { class: 'rs-node-name', text: t.name }),
          h('span', { class: 'rs-node-kind' }, [
            h('span', { class: 'rs-kind-icon', html: builds ? MISC_ICONS.building : MISC_ICONS.upgrade }),
            builds ? 'New building' : 'Upgrade',
            state === 'done' ? h('span', { class: 'rs-node-done', html: MISC_ICONS.done }) : null,
            shelved ? h('span', { class: 'rs-node-hold', title: 'On hold — progress kept', html: MISC_ICONS.pause }) : null,
          ]),
          h('span', { class: 'rs-pips' }, pips),
        ]),
      ],
    );
    if (state === 'active') this.livePips = pips;
    return el;
  }

  /** Draws the prerequisite lines between nodes (after layout). */
  private drawWires(): void {
    const tree = this.tree;
    const svgEl = this.wires;
    if (!tree || !svgEl || !tree.isConnected) return;
    const s = gameStore.getState();
    const box = tree.getBoundingClientRect();
    svgEl.setAttribute('width', String(tree.scrollWidth));
    svgEl.setAttribute('height', String(tree.scrollHeight));
    const at = (id: TechId) => tree.querySelector<HTMLElement>(`[data-tech="${id}"]`)?.getBoundingClientRect();
    let paths = '';
    for (const t of TECHS) {
      const to = at(t.id);
      if (!to) continue;
      for (const req of t.requires) {
        const from = at(req);
        if (!from) continue;
        const x1 = from.right - box.left;
        const y1 = from.top + from.height / 2 - box.top;
        const x2 = to.left - box.left;
        const y2 = to.top + to.height / 2 - box.top;
        const mx = (x1 + x2) / 2;
        const done = s.research.completed.includes(req);
        const color = BRANCHES.find((b) => b.id === TECH_BY_ID[req].branch)!.color;
        paths += `<path d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" class="rs-wire${done ? ' lit' : ''}" style="--branch:${color}"/>`;
        paths += `<circle cx="${x2}" cy="${y2}" r="3" class="rs-wire-end${done ? ' lit' : ''}" style="--branch:${color}"/>`;
      }
    }
    svgEl.innerHTML = paths;
  }

  private costChips(cost: Cost, stock: Record<ResourceId, number> | null): HTMLElement {
    const row = h('div', { class: 'cost-row' });
    for (const [id, amount] of Object.entries(cost) as [ResourceId, number][]) {
      row.append(
        h('span', { class: `cost${stock && stock[id] + 1e-9 < amount ? ' short' : ''}`, title: RESOURCES[id].name, style: { ['--chip-color' as never]: RESOURCES[id].color } }, [
          h('span', { class: 'cost-icon', html: RESOURCE_ICONS[id] }),
          h('span', { class: 'cost-n', text: `${amount}` }),
        ]),
      );
    }
    return row;
  }

  /** The project the labs are on right now. */
  private activeCard(s: GameStore, t: TechDefinition): HTMLElement {
    const r = s.research;
    const br = BRANCHES.find((b) => b.id === t.branch)!;
    const stage = STAGES[r.stage];
    const fill = h('span', { class: 'progress-fill' });
    const eta = h('span', { class: 'rs-eta' });
    this.liveBar = { fill, eta };
    const children: (HTMLElement | null)[] = [
      h('div', { class: 'rs-active-head' }, [
        h('span', { class: 'rs-hex big', html: TECH_ICONS[t.id] }),
        h('div', { class: 'rs-active-title' }, [
          h('span', { class: 'rs-eyebrow', text: 'Now researching' }),
          h('strong', { text: t.name }),
          h('span', { class: 'rs-stage-line' }, [h('span', { class: 'rs-stage-icon', html: STAGE_ICONS[stage.id] }), `Stage ${r.stage + 1} of ${STAGES.length}: ${stage.name} · ${stage.trl}`]),
        ]),
      ]),
      h('div', { class: 'progress' }, [fill]),
      eta,
    ];
    if (r.awaiting) children.push(this.advanceBox(s, t));
    return h('div', { class: `rs-active${r.awaiting ? ' awaiting' : ''}`, style: { ['--branch' as never]: br.color } }, children);
  }

  /** "Send the materials" step between stages. */
  private advanceBox(s: GameStore, t: TechDefinition): HTMLElement {
    const r = s.research;
    const next = STAGES[r.stage + 1];
    const cost = stageMaterials(t, r.stage + 1);
    const stock = Logistics.pooledResources(s);
    const ok = ResourceManager.canAfford(stock, cost);
    return h('div', { class: 'rs-advance' }, [
      h('span', { class: 'rs-stage-icon big', html: STAGE_ICONS[next.id] }),
      h('div', { class: 'rs-advance-main' }, [
        h('strong', { text: `Ready for the ${next.name.toLowerCase()}` }),
        h('p', { text: next.blurb }),
        this.costChips(cost, stock),
      ]),
      h(
        'button',
        {
          class: 'btn primary rs-advance-btn',
          attrs: { type: 'button', ...(ok ? {} : { 'aria-disabled': 'true' }) },
          on: {
            click: () => {
              const res = gameStore.getState().advanceResearch();
              if (!res.ok) gameStore.getState().pushAlert({ key: 'research-fail', level: 'warning', title: 'Not enough materials yet', message: res.reason });
            },
          },
        },
        [h('span', { class: 'btn-icon', html: MISC_ICONS.materials }), ok ? 'Send materials' : 'Need more materials'],
      ),
    ]);
  }

  /** Everything about the selected project: what it does, the science, its stages, what it unlocks. */
  private detail(s: GameStore, t: TechDefinition, rp: number, labCount: number): HTMLElement {
    const state = this.stateOf(s, t);
    const br = BRANCHES.find((b) => b.id === t.branch)!;
    const p = this.progressOf(s, t.id);
    const shelved = !!s.research.shelved[t.id];
    const unlocks = BUILDING_TYPES.filter((b) => BUILDINGS[b].requiresTech === t.id);
    const needs = t.requires.filter((x) => !s.research.completed.includes(x)).map((x) => TECH_BY_ID[x].name);
    const stock = Logistics.pooledResources(s);

    const track = h('ol', { class: 'rs-track' });
    STAGES.forEach((st, i) => {
      const status = i < p.stage || state === 'done' ? 'done' : i === p.stage && state === 'active' ? (p.awaiting ? 'done' : 'current') : i === p.stage && shelved ? 'current' : 'todo';
      const mats = stageMaterials(t, i);
      track.append(
        h('li', { class: `rs-step ${status}` }, [
          h('span', { class: 'rs-step-icon', html: status === 'done' ? MISC_ICONS.done : STAGE_ICONS[st.id] }),
          h('div', { class: 'rs-step-main' }, [
            h('div', { class: 'rs-step-head' }, [h('strong', { text: st.name }), h('span', { class: 'rs-trl', text: st.trl })]),
            h('p', { text: st.blurb }),
            h('div', { class: 'rs-step-cost' }, [
              h('span', { class: 'rs-rp' }, [h('span', { class: 'row-icon', html: MISC_ICONS.rp }), `${stageRp(t, i)} RP`]),
              rp > 0 ? h('span', { class: 'rs-rp' }, [h('span', { class: 'row-icon', html: MISC_ICONS.time }), `~${fmtSols(stageRp(t, i) / rp)}`]) : null,
              Object.keys(mats).length ? this.costChips(mats, status === 'todo' || (status === 'done' && i === p.stage + 1) ? stock : null) : h('span', { class: 'rs-free', text: 'no materials' }),
            ]),
          ]),
        ]),
      );
    });

    // Main action.
    let action: HTMLElement;
    const msg = (text: string, icon = ICONS.lock) => h('div', { class: 'rs-action-note' }, [h('span', { class: 'row-icon', html: icon }), text]);
    if (state === 'done') action = msg('Researched — in use at every base.', MISC_ICONS.done);
    else if (state === 'locked') action = msg(`First research: ${needs.join(' and ')}.`);
    else if (s.progression.level < RESEARCH_UNLOCK_LEVEL) action = msg('Research opens at rank Settlement Commander.');
    else if (labCount === 0) action = msg('Build a Research Lab to start.', ICONS.research);
    else if (state === 'active') action = s.research.awaiting ? msg('Stage finished — send the materials above to go on.', MISC_ICONS.materials) : msg('Your labs are working on this.', MISC_ICONS.rp);
    else {
      const total = t.cost - rpDone(t, p.stage, p.progress);
      action = h(
        'button',
        {
          class: 'btn primary rs-start',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const res = gameStore.getState().startResearch(t.id);
              if (!res.ok) gameStore.getState().pushAlert({ key: 'research-fail', level: 'warning', title: 'Can’t research that yet', message: res.reason });
            },
          },
        },
        [
          h('span', { class: 'btn-icon', html: MISC_ICONS.rp }),
          shelved ? `Resume at stage ${p.stage + 1}` : 'Start research',
          h('span', { class: 'rs-start-sub', text: `${Math.round(total)} RP${rp > 0 ? ` · ~${fmtSols(total / rp)}` : ''}` }),
        ],
      );
    }
    const switching = state === 'open' && s.research.active ? h('p', { class: 'rs-hint', text: `${TECH_BY_ID[s.research.active].name} will be put on hold. Its progress is kept.` }) : null;

    return h('section', { class: `rs-detail ${state}`, style: { ['--branch' as never]: br.color } }, [
      h('div', { class: 'rs-detail-head' }, [
        h('span', { class: 'rs-hex big', html: TECH_ICONS[t.id] }),
        h('div', {}, [
          h('span', { class: 'rs-eyebrow' }, [h('span', { class: 'rs-eyebrow-icon', html: BRANCH_ICONS[br.id] }), `${br.name} technology · Tier ${techTier(t.id) + 1}`]),
          h('h3', { text: t.name }),
          h('p', { class: 'rs-effect', text: t.effect }),
        ]),
      ]),
      h('div', { class: 'rs-fact' }, [h('span', { class: 'rs-fact-label', text: 'Real science' }), h('p', { text: t.fact })]),
      unlocks.length ? h('div', { class: 'rs-unlocks' }, unlocks.map((b) => this.unlockTile(b, state === 'done'))) : null,
      h('h4', { class: 'rs-sub', text: 'Development stages' }),
      track,
      h('div', { class: 'rs-actions' }, [action, switching]),
    ]);
  }

  /** A building this project unlocks: a black shadow until it is invented. */
  private unlockTile(type: BuildingType, known: boolean): HTMLElement {
    const def = BUILDINGS[type];
    const pic = known ? buildingIcon('rs-unlock-pic', buildingThumbnail(type), BUILDING_ICONS[type]) : buildingIcon('rs-unlock-pic shadow-icon', buildingSilhouette(type), BUILDING_ICONS[type]);
    const tile = h('div', { class: `rs-unlock${known ? ' known' : ''}` }, [
      pic,
      h('div', {}, [h('span', { class: 'rs-eyebrow', text: known ? 'New building — in the Build menu' : 'Unlocks a new building' }), h('strong', { text: def.name })]),
    ]);
    toggleClass(tile, 'site-only', !!def.requiresTrait);
    return tile;
  }
}
