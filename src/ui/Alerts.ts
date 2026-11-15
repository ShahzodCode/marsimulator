import { formatMarsTime } from '../core/GameClock';
import { gameStore, watch } from '../state/gameStore';
import type { Alert, AlertLevel, LogEntry } from '../state/types';
import { clear, h, setText, toggleClass } from './dom';

const LEVEL_ICON: Record<AlertLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  critical: '🚨',
};

const LEVEL_NAME: Record<AlertLevel, string> = {
  info: 'Update',
  success: 'Success',
  warning: 'Warning',
  critical: 'Critical',
};

const CHEVRON = '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"/></svg>';

/** Messages visible while the log is folded up. */
const PEEK = 3;

type Filter = 'all' | 'alerts' | 'success' | 'info';
const FILTERS: { id: Filter; label: string; test: (l: AlertLevel) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'alerts', label: 'Warnings', test: (l) => l === 'warning' || l === 'critical' },
  { id: 'success', label: 'Successes', test: (l) => l === 'success' },
  { id: 'info', label: 'Updates', test: (l) => l === 'info' },
];

function when(sol: number): string {
  const t = formatMarsTime(sol);
  return `Sol ${t.sol}, ${t.clock}`;
}

function ago(now: number, sol: number): string {
  const d = now - sol;
  if (d < 0.04) return 'just now';
  if (d < 1) return `${Math.round(d * 24.6)} h ago`;
  const n = Math.floor(d);
  return `${n} sol${n === 1 ? '' : 's'} ago`;
}

/**
 * Persistent warnings (conditions such as low oxygen, shown at the left until they clear)
 * and the mission log in the bottom-right corner: the newest three messages, and every
 * message of the game when it is opened.
 */
export class Alerts {
  private warnings: HTMLElement;

  constructor(parent: HTMLElement) {
    this.warnings = h('div', { class: 'warnings', attrs: { role: 'alert' } });
    parent.append(this.warnings, new MessageFeed().el);
    watch(
      (s) => s.alerts,
      (alerts) => this.renderWarnings(alerts),
    );
  }

  private renderWarnings(alerts: Alert[]): void {
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
          [
            h('span', { class: 'msg-badge', text: LEVEL_ICON[a.level] }),
            h('span', { class: 'warning-text' }, [
              h('strong', { text: a.title }),
              h('span', { class: 'warning-msg', text: a.message }),
              h('span', { class: 'msg-meta', text: `📍 ${a.where ?? ''} · since ${when(a.sol)}` }),
            ]),
          ],
        ),
      );
    }
  }
}

class MessageFeed {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private count: HTMLElement;
  private unreadEl: HTMLElement;
  private empty: HTMLElement;
  private chips = new Map<Filter, HTMLElement>();
  private rows = new Map<string, { el: HTMLElement; ago: HTMLElement; entry: LogEntry }>();
  private open = false;
  private filter: Filter = 'all';
  private seen = 0;
  private firstId: string | undefined;
  private ready = false;

  constructor() {
    this.count = h('span', { class: 'feed-count' });
    this.unreadEl = h('span', { class: 'feed-unread' });
    this.empty = h('p', { class: 'feed-empty', text: 'No messages yet. News from your bases, crews and labs will show up here.' });
    this.list = h('ol', { class: 'feed-list', attrs: { 'aria-live': 'polite' } });
    const head = h(
      'button',
      { class: 'feed-head', attrs: { type: 'button', 'aria-expanded': 'false' }, on: { click: () => this.toggle() } },
      [h('span', { class: 'feed-dot' }), h('span', { class: 'feed-title', text: 'Mission log' }), this.count, this.unreadEl, h('span', { class: 'feed-chevron', html: CHEVRON })],
    );
    const filters = h(
      'div',
      { class: 'feed-filters' },
      FILTERS.map((f) => {
        const chip = h('button', { class: 'feed-chip', attrs: { type: 'button' }, text: f.label, on: { click: () => this.setFilter(f.id) } });
        this.chips.set(f.id, chip);
        return chip;
      }),
    );
    this.el = h('section', { class: 'feed', attrs: { 'aria-label': 'Mission log' } }, [head, filters, this.list, this.empty]);
    // Folded up, a click anywhere opens the full log.
    this.list.addEventListener('click', () => {
      if (!this.open) this.toggle();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.toggle();
    });
    // Panels in the same corner sit above the folded log.
    new ResizeObserver(() => {
      if (!this.open) document.documentElement.style.setProperty('--feed-h', `${Math.ceil(this.el.offsetHeight)}px`);
    }).observe(this.el);
    this.setFilter('all');
    watch(
      (s) => s.log,
      (log) => this.render(log),
    );
    // Keeps "3 h ago" up to date.
    window.setInterval(() => this.refreshAgo(), 2000);
  }

  private toggle(): void {
    this.open = !this.open;
    toggleClass(this.el, 'open', this.open);
    this.el.querySelector('.feed-head')!.setAttribute('aria-expanded', String(this.open));
    if (this.open) {
      this.seen = gameStore.getState().log.length;
      this.updateCount(gameStore.getState().log);
      this.list.scrollTop = 0;
    } else {
      this.setFilter('all');
    }
    this.fit();
  }

  private setFilter(f: Filter): void {
    this.filter = f;
    for (const [id, chip] of this.chips) toggleClass(chip, 'on', id === f);
    const test = FILTERS.find((x) => x.id === f)!.test;
    for (const r of this.rows.values()) toggleClass(r.el, 'hidden', !test(r.entry.level));
    this.fit();
  }

  /** Folded: exactly the newest three messages. Open: a tall scrolling list (CSS). */
  private fit(): void {
    if (this.open) {
      this.list.style.maxHeight = '';
      return;
    }
    let hgt = 0;
    let n = 0;
    for (const el of Array.from(this.list.children) as HTMLElement[]) {
      if (n >= PEEK) break;
      if (el.classList.contains('hidden')) continue;
      hgt += el.offsetHeight + (n ? 6 : 0);
      n++;
    }
    this.list.style.maxHeight = `${hgt}px`;
  }

  private updateCount(log: LogEntry[]): void {
    setText(this.count, `${log.length}`);
    const unread = this.open ? 0 : Math.max(0, log.length - this.seen);
    setText(this.unreadEl, unread ? `${unread} new` : '');
    toggleClass(this.unreadEl, 'on', unread > 0);
  }

  private row(e: LogEntry, now: number): HTMLElement {
    const agoEl = h('span', { class: 'msg-ago', text: ago(now, e.sol) });
    const el = h('li', { class: `msg ${e.level}` }, [
      h('span', { class: 'msg-badge', text: LEVEL_ICON[e.level], title: LEVEL_NAME[e.level] }),
      h('div', { class: 'msg-body' }, [
        h('div', { class: 'msg-top' }, [h('strong', { class: 'msg-title', text: e.title }), agoEl]),
        e.message ? h('p', { class: 'msg-text', text: e.message }) : null,
        h('div', { class: 'msg-meta' }, [h('span', { text: `📍 ${e.where}` }), h('span', { text: `🕒 ${when(e.sol)}` })]),
      ]),
    ]);
    toggleClass(el, 'hidden', !FILTERS.find((x) => x.id === this.filter)!.test(e.level));
    this.rows.set(e.id, { el, ago: agoEl, entry: e });
    return el;
  }

  private render(log: LogEntry[]): void {
    const now = gameStore.getState().timeSols;
    // A new game or a loaded save: start over without animations.
    if (log[0]?.id !== this.firstId || log.length < this.rows.size) {
      this.firstId = log[0]?.id;
      this.rows.clear();
      clear(this.list);
      this.ready = false;
    }
    const fresh: HTMLElement[] = [];
    for (const e of log) {
      if (this.rows.has(e.id)) continue;
      const el = this.row(e, now);
      // Newest on top.
      this.list.prepend(el);
      if (this.ready) fresh.push(el);
    }
    // Old messages beyond the log's limit are gone from the store.
    if (this.rows.size > log.length) {
      const keep = new Set(log.map((e) => e.id));
      for (const [id, r] of this.rows) {
        if (keep.has(id)) continue;
        r.el.remove();
        this.rows.delete(id);
      }
    }
    if (!this.ready) this.seen = log.length;
    this.ready = true;
    for (const el of fresh) {
      el.classList.add('enter');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('enter')));
    }
    toggleClass(this.empty, 'hidden', log.length > 0);
    if (this.open) this.seen = log.length;
    this.updateCount(log);
    this.fit();
  }

  private refreshAgo(): void {
    const now = gameStore.getState().timeSols;
    for (const r of this.rows.values()) setText(r.ago, ago(now, r.entry.sol));
  }
}
