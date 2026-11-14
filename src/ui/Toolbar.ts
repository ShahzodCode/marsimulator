import { BUILDINGS } from '../data/buildings';
import { RESEARCH_UNLOCK_LEVEL } from '../data/progression';
import type { EventBus } from '../core/EventBus';
import { gameStore, watch } from '../state/gameStore';
import type { PanelId } from '../state/types';
import { h, setText, toggleClass } from './dom';
import { ICONS } from './icons';

/** Bottom dock with the main game sections. */
export class Toolbar {
  readonly el: HTMLElement;
  private buttons = new Map<PanelId, HTMLButtonElement>();

  constructor(parent: HTMLElement) {
    this.el = h('nav', { class: 'dock', attrs: { 'aria-label': 'Main menu' } });
    const items: [PanelId, string, string, string][] = [
      ['construction', 'Build', ICONS.build, 'B'],
      ['exploration', 'Explore', ICONS.explore, 'X'],
      ['missions', 'Missions', ICONS.missions, 'M'],
      ['research', 'Research', ICONS.research, 'T'],
      ['settlement', 'Base', ICONS.settlement, 'I'],
    ];
    for (const [id, label, icon, key] of items) {
      const b = h(
        'button',
        {
          class: 'dock-btn',
          attrs: { type: 'button', 'aria-label': label, 'data-panel': id },
          title: `${label} (${key})`,
          on: { click: () => gameStore.getState().togglePanel(id) },
        },
        [h('span', { class: 'dock-icon', html: icon }), h('span', { class: 'dock-label', text: label }), id === 'research' ? h('span', { class: 'dock-lock', html: ICONS.lock }) : null],
      );
      this.buttons.set(id, b);
      this.el.append(b);
    }
    parent.append(this.el);
    watch(
      (s) => `${s.activePanel}|${s.progression.level}|${s.missions.filter((m) => m.status === 'active').length}`,
      () => this.render(),
    );
  }

  private render(): void {
    const s = gameStore.getState();
    for (const [id, b] of this.buttons) toggleClass(b, 'active', s.activePanel === id);
    toggleClass(this.buttons.get('research')!, 'locked', s.progression.level < RESEARCH_UNLOCK_LEVEL);
    const active = s.missions.filter((m) => m.status === 'active').length;
    const mb = this.buttons.get('missions')!;
    mb.dataset.badge = active ? String(active) : '';
  }
}

/** Instruction bar shown while placing a building (with touch-friendly buttons). */
export class PlacementHint {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private feedback: HTMLElement;

  constructor(parent: HTMLElement, events: EventBus) {
    this.title = h('strong');
    this.feedback = h('span', { class: 'feedback' });
    this.el = h('div', { class: 'placement-hint', attrs: { role: 'status' } }, [
      h('div', { class: 'ph-text' }, [this.title, h('span', { class: 'ph-keys', text: 'Click to build · R rotate · Esc cancel' }), this.feedback]),
      h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: () => gameStore.getState().rotatePlacement() } }, [h('span', { class: 'btn-icon', html: ICONS.rotate }), 'Rotate']),
      h('button', { class: 'btn danger', attrs: { type: 'button' }, on: { click: () => gameStore.getState().cancelPlacement() } }, [h('span', { class: 'btn-icon', html: ICONS.close }), 'Cancel']),
    ]);
    parent.append(this.el);
    watch(
      (s) => (s.construction.active ? s.construction.buildingType : null),
      (type) => {
        toggleClass(this.el, 'open', !!type);
        if (type) {
          setText(this.title, `Placing: ${BUILDINGS[type].icon} ${BUILDINGS[type].name}`);
          setText(this.feedback, 'Move the pointer over the base.');
          this.feedback.className = 'feedback';
        }
      },
    );
    events.on('placement:feedback', (f) => {
      setText(this.feedback, f.valid ? '✔ Good spot!' : f.message ?? '');
      this.feedback.className = `feedback ${f.valid ? 'ok' : 'bad'}`;
    });
  }
}
