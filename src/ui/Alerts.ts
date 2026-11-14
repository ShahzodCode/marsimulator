import { gameStore, watch } from '../state/gameStore';
import type { Alert } from '../state/types';
import { clear, h } from './dom';
import { ICONS } from './icons';

const LEVEL_ICON: Record<Alert['level'], string> = {
  info: 'ℹ️',
  success: '🎉',
  warning: '⚠️',
  critical: '🚨',
};

const TOAST_MS = 6500;

/**
 * Toast notifications (one-off events) and a persistent warning list
 * (conditions such as low oxygen or a power shortage, shown until they clear).
 */
export class Alerts {
  private toasts: HTMLElement;
  private warnings: HTMLElement;
  private shown = new Map<string, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.toasts = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite', role: 'status' } });
    this.warnings = h('div', { class: 'warnings', attrs: { role: 'alert' } });
    parent.append(this.toasts, this.warnings);
    watch(
      (s) => s.alerts,
      (alerts) => this.render(alerts),
    );
  }

  private render(alerts: Alert[]): void {
    // Toasts
    const toastAlerts = alerts.filter((a) => !a.persistent);
    for (const a of toastAlerts) {
      if (this.shown.has(a.id)) continue;
      const el = h('div', { class: `toast ${a.level}` }, [
        h('span', { class: 'toast-icon', text: LEVEL_ICON[a.level] }),
        h('div', { class: 'toast-body' }, [h('strong', { text: a.title }), a.message ? h('p', { text: a.message }) : null]),
        h('button', {
          class: 'icon-btn small',
          html: ICONS.close,
          attrs: { 'aria-label': 'Dismiss' },
          on: { click: () => gameStore.getState().dismissAlert(a.id) },
        }),
      ]);
      this.shown.set(a.id, el);
      this.toasts.append(el);
      requestAnimationFrame(() => el.classList.add('in'));
      window.setTimeout(() => gameStore.getState().dismissAlert(a.id), a.level === 'success' ? TOAST_MS + 2500 : TOAST_MS);
    }
    for (const [id, el] of this.shown) {
      if (!toastAlerts.some((a) => a.id === id)) {
        this.shown.delete(id);
        el.classList.remove('in');
        el.classList.add('out');
        window.setTimeout(() => el.remove(), 300);
      }
    }
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();

    // Persistent warnings
    const persistent = alerts.filter((a) => a.persistent).sort((a, b) => (a.level === 'critical' ? -1 : 0) - (b.level === 'critical' ? -1 : 0));
    clear(this.warnings);
    for (const a of persistent) {
      this.warnings.append(
        h(
          'button',
          {
            class: `warning-item ${a.level}`,
            attrs: { type: 'button' },
            title: 'Open settlement overview',
            on: { click: () => gameStore.getState().openPanel('settlement') },
          },
          [h('span', { text: LEVEL_ICON[a.level] }), h('span', {}, [h('strong', { text: a.title }), h('span', { class: 'warning-msg', text: ` ${a.message}` })])],
        ),
      );
    }
  }
}
