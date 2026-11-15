import { BUILDINGS } from '../data/buildings';
import { hasRank, RESEARCH_UNLOCK_RANK } from '../data/progression';
import type { EventBus } from '../core/EventBus';
import { gameStore, watch } from '../state/gameStore';
import type { PanelId } from '../state/types';
import { h, setText, toggleClass } from './dom';
import { ICONS } from './icons';
import { t } from '../i18n';

/** Bottom dock with the main game sections. */
export class Toolbar {
  readonly el: HTMLElement;
  private buttons = new Map<PanelId, HTMLButtonElement>();

  constructor(parent: HTMLElement) {
    this.el = h('nav', { class: 'dock', attrs: { 'aria-label': t('Main menu') } });
    const items: [PanelId, string, string, string][] = [
      ['construction', t('Build'), ICONS.build, 'B'],
      ['exploration', t('Explore'), ICONS.explore, 'X'],
      ['missions', t('Missions'), ICONS.missions, 'M'],
      ['research', t('Research'), ICONS.research, 'T'],
      ['settlement', t('Base'), ICONS.settlement, 'I'],
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
    toggleClass(this.buttons.get('research')!, 'locked', !hasRank(s.progression.level, RESEARCH_UNLOCK_RANK));
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
    const keys = h('span', { class: 'ph-keys', text: t('Click to build · R rotate · Esc cancel') });
    const rotate = h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: () => gameStore.getState().rotatePlacement() } }, [
      h('span', { class: 'btn-icon', html: ICONS.rotate }),
      t('Rotate'),
    ]);
    const cancelLabel = h('span', { text: t('Cancel') });
    const cancel = h(
      'button',
      {
        class: 'btn danger',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const st = gameStore.getState();
            if (st.pipelineMode) st.stopPipelineMode();
            else if (st.roadMode) st.stopRoadMode();
            else st.cancelPlacement();
          },
        },
      },
      [h('span', { class: 'btn-icon', html: ICONS.close }), cancelLabel],
    );
    this.el = h('div', { class: 'placement-hint', attrs: { role: 'status' } }, [h('div', { class: 'ph-text' }, [this.title, keys, this.feedback]), rotate, cancel]);
    parent.append(this.el);
    watch(
      (s) => (s.pipelineMode ? 'pipe' : s.roadMode ? 'road' : s.construction.active ? s.construction.buildingType : null),
      (mode) => {
        toggleClass(this.el, 'open', !!mode);
        rotate.style.display = mode === 'road' || mode === 'pipe' ? 'none' : '';
        if (mode === 'pipe') {
          setText(this.title, t('Laying pipelines'));
          setText(keys, t('Press on a base with a Pump Station · drag onto another base · let go to build · scroll to zoom · Esc done'));
          setText(this.feedback, t('Both bases need a Pipeline Pump Station for goods to flow.'));
          setText(cancelLabel, t('Done'));
          this.feedback.className = 'feedback';
        } else if (mode === 'road') {
          setText(this.title, t('Laying roads'));
          setText(keys, t('Drag from a building, the Storage Depot or a road · let go to build · click a piece to remove · WASD move · Esc done'));
          setText(this.feedback, t('Start in front of a building, the Storage Depot or a road — link it back to the depot to deliver goods.'));
          setText(cancelLabel, t('Done'));
          this.feedback.className = 'feedback';
        } else if (mode) {
          setText(this.title, t('Placing: {name}', { name: BUILDINGS[mode].name }));
          setText(keys, t('Click to build · R rotate · Esc cancel'));
          setText(this.feedback, t('Move the pointer over the base.'));
          setText(cancelLabel, t('Cancel'));
          this.feedback.className = 'feedback';
        }
      },
    );
    events.on('placement:feedback', (f) => {
      setText(this.feedback, f.valid ? `✔ ${t('Good spot!')}` : f.message ?? '');
      this.feedback.className = `feedback ${f.valid ? 'ok' : 'bad'}`;
    });
  }
}
