import { gameStore, watch } from '../state/gameStore';
import type { PanelId } from '../state/types';
import { h, setText } from './dom';
import { ICONS } from './icons';

export interface Panel {
  id: PanelId;
  title: string;
  subtitle?: string;
  el: HTMLElement;
  show(): void;
  hide(): void;
}

/** Right-hand drawer that hosts whichever panel is active in the store. */
export class SidePanel {
  readonly el: HTMLElement;
  private titleEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private body: HTMLElement;
  private current: Panel | null = null;

  constructor(
    parent: HTMLElement,
    private panels: Panel[],
  ) {
    this.titleEl = h('h2');
    this.subtitleEl = h('p', { class: 'panel-subtitle' });
    this.body = h('div', { class: 'panel-body' });
    this.el = h('aside', { class: 'side-panel', attrs: { 'aria-live': 'polite' } }, [
      h('div', { class: 'panel-head' }, [
        h('div', {}, [this.titleEl, this.subtitleEl]),
        h('button', {
          class: 'icon-btn',
          html: ICONS.close,
          title: 'Close (Esc)',
          attrs: { 'aria-label': 'Close panel' },
          on: { click: () => gameStore.getState().openPanel(null) },
        }),
      ]),
      this.body,
    ]);
    parent.append(this.el);
    watch(
      (s) => s.activePanel,
      (id) => this.open(id),
    );
  }

  private open(id: PanelId | null): void {
    const next = id ? this.panels.find((p) => p.id === id) ?? null : null;
    if (next === this.current) return;
    this.current?.hide();
    this.current?.el.remove();
    this.current = next;
    this.el.classList.toggle('open', !!next);
    if (next) this.el.dataset.panel = next.id;
    if (next) {
      setText(this.titleEl, next.title);
      setText(this.subtitleEl, next.subtitle ?? '');
      this.body.append(next.el);
      this.body.scrollTop = 0;
      next.show();
    }
  }
}
