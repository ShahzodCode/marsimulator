import { BUILDINGS, BUILDING_TYPES } from '../data/buildings';
import { LEVELS, RESEARCH_UNLOCK_LEVEL } from '../data/progression';
import { BRANCHES, TECHS, TECH_BY_ID, canResearch, orbiterFor, type TechDefinition } from '../data/research';
import { gameStore, type GameStore } from '../state/gameStore';
import { clear, h, setText } from './dom';
import { ICONS } from './icons';
import type { Panel } from './SidePanel';

/**
 * The research tree: one column per branch, projects unlock down the column.
 * Research Labs (at any base) make research points for the project that is running.
 */
export class ResearchPanel implements Panel {
  readonly id = 'research' as const;
  readonly title = 'Research';
  readonly subtitle = 'Invent new machines. Research Labs at every base work together.';
  readonly el = h('div', { class: 'research' });
  private unsub: (() => void) | null = null;
  private key = '';
  private fill: HTMLElement | null = null;
  private eta: HTMLElement | null = null;

  show(): void {
    this.key = '';
    this.render();
    this.unsub = gameStore.subscribe(() => this.render());
  }

  hide(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private labRp(s: GameStore): number {
    let rp = 0;
    for (const list of [s.buildings, ...s.otherBases.map((b) => b.buildings)]) {
      for (const b of list) if (b.isOperational && b.enabled && b.powered) rp += BUILDINGS[b.type].researchPerSol ?? 0;
    }
    return rp;
  }

  private render(): void {
    const s = gameStore.getState();
    const rp = this.labRp(s);
    const key = `${s.progression.level}|${s.research.completed.join(',')}|${s.research.active}|${rp > 0}`;
    if (this.fill && s.research.active) {
      const t = TECH_BY_ID[s.research.active];
      this.fill.style.transform = `scaleX(${Math.min(1, s.research.progress / t.cost).toFixed(3)})`;
      setText(this.eta!, rp > 0 ? `${Math.ceil((t.cost - s.research.progress) / rp)} sols left` : 'No working lab');
    }
    if (key === this.key) return;
    this.key = key;
    clear(this.el);
    this.fill = this.eta = null;

    const unlockAt = LEVELS.find((l) => l.level === RESEARCH_UNLOCK_LEVEL)!;
    if (s.progression.level < RESEARCH_UNLOCK_LEVEL) {
      this.el.append(
        h('div', { class: 'lock-card' }, [
          h('span', { class: 'lock-icon', html: ICONS.lock }),
          h('div', {}, [
            h('strong', { text: `Research Labs unlock at rank ${unlockAt.title}` }),
            h('p', { text: `You have ${s.progression.xp} XP — ${unlockAt.xp - s.progression.xp} XP to go. You can already look at the tree below.` }),
          ]),
        ]),
      );
    } else if (rp === 0) {
      this.el.append(h('div', { class: 'lock-card unlocked' }, [h('span', { class: 'lock-icon', text: '🔬' }), h('div', {}, [h('strong', { text: 'Build a Research Lab' }), h('p', { text: 'Labs make research points. Pick a project here, and every working lab at every base helps.' })])]));
    }

    const o = orbiterFor(s.research.completed);
    this.el.append(h('p', { class: 'muted', text: `Labs make ${rp} research points per sol · ${o.name} (radar view to ${o.maxDepthKm} km)` }));

    if (s.research.active) {
      const t = TECH_BY_ID[s.research.active];
      this.fill = h('span', { class: 'progress-fill' });
      this.eta = h('span', { class: 'eta' });
      this.el.append(h('div', { class: 'mission-card live' }, [h('div', { class: 'mission-head' }, [h('span', { text: t.icon }), h('strong', { text: `Researching: ${t.name}` }), this.eta]), h('div', { class: 'progress' }, [this.fill])]));
    }

    const tree = h('div', { class: 'tech-tree' });
    for (const br of BRANCHES) {
      const col = h('div', { class: 'tech-branch', style: { ['--branch' as never]: br.color } }, [h('div', { class: 'branch-head', text: `${br.icon} ${br.name}` })]);
      for (const t of TECHS.filter((x) => x.branch === br.id)) col.append(this.node(s, t, rp));
      tree.append(col);
    }
    this.el.append(tree);
  }

  private node(s: GameStore, t: TechDefinition, rp: number): HTMLElement {
    const done = s.research.completed.includes(t.id);
    const active = s.research.active === t.id;
    const open = canResearch(s.research.completed, t.id);
    const unlocks = BUILDING_TYPES.filter((b) => BUILDINGS[b].requiresTech === t.id).map((b) => BUILDINGS[b].name);
    const state = done ? 'done' : active ? 'active' : open ? 'open' : 'locked';
    const needs = t.requires.filter((r) => !s.research.completed.includes(r)).map((r) => TECH_BY_ID[r].name);
    return h(
      'button',
      {
        class: `tech-node ${state}`,
        attrs: { type: 'button', 'aria-pressed': String(active) },
        title: `${t.effect}\n\nReal science: ${t.fact}${needs.length ? `\n\nNeeds: ${needs.join(', ')}` : ''}`,
        on: {
          click: () => {
            if (done) return;
            const res = gameStore.getState().startResearch(t.id);
            if (!res.ok) gameStore.getState().pushAlert({ key: 'research-fail', level: 'warning', title: 'Can’t research that yet', message: res.reason });
          },
        },
      },
      [
        h('div', { class: 'tech-top' }, [h('span', { class: 'tech-icon', text: t.icon }), h('strong', { text: t.name })]),
        h('p', { text: t.effect }),
        unlocks.length ? h('p', { class: 'tech-unlocks', text: `🏗️ ${unlocks.join(', ')}` }) : null,
        h('span', { class: 'tech-cost', text: done ? '✓ Done' : active ? 'In progress' : `🔬 ${t.cost} RP${rp > 0 ? ` · ~${Math.ceil(t.cost / rp)} sols` : ''}` }),
      ],
    );
  }
}
