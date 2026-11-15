import { rankForXp } from '../data/progression';
import { Leaderboard, SORTS, type LeaderboardRow, type LeaderboardSort, type Loaded, type MyPosition } from '../persistence/Leaderboard';
import { h } from './dom';
import { ICONS } from './icons';
import { rankBadgeSvg } from './RankBadge';

export interface LeaderboardOptions {
  /** Rows to show (the full board shows up to 50). */
  limit: number;
  /** Sort chips and the pinned "you" row. */
  full: boolean;
  onOpen(userId: string): void;
  /** Compact board only: switch to the full board. */
  onShowAll?: () => void;
  /** Guests: open the log-in dialog. */
  onLogin?: () => void;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const SEARCH_DELAY_MS = 300;

/** Remembered while the game runs, so reopening the board keeps the player's choice. */
let lastSort: LeaderboardSort = 'xp';

/**
 * The online leaderboard: a search bar on top of the best player, then the ranked rows.
 * Used twice in the profile dialog — a short top-5 under "My profile" and the full board.
 */
export class LeaderboardView {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private status: HTMLElement;
  private pinned: HTMLElement;
  private input: HTMLInputElement;
  private chips: HTMLButtonElement[] = [];
  private sort: LeaderboardSort;
  private term = '';
  private timer = 0;
  private request = 0;

  constructor(private opts: LeaderboardOptions) {
    this.sort = opts.full ? lastSort : 'xp';
    this.input = h('input', {
      attrs: { type: 'search', placeholder: 'Search commanders…', maxlength: '20', 'aria-label': 'Search commanders by name', autocomplete: 'off', spellcheck: 'false' },
    });
    this.input.addEventListener('input', () => {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        this.term = this.input.value.trim();
        void this.load();
      }, SEARCH_DELAY_MS);
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.input.value) {
        e.stopPropagation();
        this.input.value = '';
        this.term = '';
        void this.load();
      }
    });
    const search = h('label', { class: 'lb-search' }, [h('span', { class: 'lb-search-icon', html: ICONS.search }), this.input]);

    const sorts = opts.full
      ? h(
          'div',
          { class: 'lb-sorts', attrs: { role: 'radiogroup', 'aria-label': 'Sort by' } },
          SORTS.map((s) => {
            const b = h('button', {
              class: 'lb-sort',
              text: s.label,
              attrs: { type: 'button', role: 'radio', 'data-sort': s.id },
              on: { click: () => this.setSort(s.id) },
            });
            this.chips.push(b);
            return b;
          }),
        )
      : null;

    this.list = h('ol', { class: 'lb-list', attrs: { 'aria-label': 'Leaderboard' } });
    this.status = h('div', { class: 'lb-status', attrs: { role: 'status' } });
    this.pinned = h('div', { class: 'lb-pinned' });
    const more = opts.onShowAll
      ? h('button', { class: 'link-btn lb-more', text: 'See the full leaderboard →', attrs: { type: 'button' }, on: { click: () => opts.onShowAll?.() } })
      : null;

    this.el = h('div', { class: `lb ${opts.full ? 'full' : 'compact'}` }, [sorts, search, this.status, this.list, this.pinned, more]);
    this.markSort();
    void this.load();
  }

  focusSearch(): void {
    this.input.focus();
  }

  private setSort(sort: LeaderboardSort): void {
    if (sort === this.sort) return;
    this.sort = lastSort = sort;
    this.markSort();
    void this.load();
  }

  private markSort(): void {
    for (const c of this.chips) {
      const on = c.dataset.sort === this.sort;
      c.classList.toggle('on', on);
      c.setAttribute('aria-checked', String(on));
    }
  }

  async reload(): Promise<void> {
    Leaderboard.clearCache();
    await this.load(true);
  }

  private async load(fresh = false): Promise<void> {
    const id = ++this.request;
    this.el.classList.add('loading');
    if (!this.list.childElementCount) this.skeleton();
    const [rows, me] = await Promise.all([
      Leaderboard.list(this.sort, this.term, fresh),
      this.opts.full ? Leaderboard.myPosition(this.sort, fresh) : Promise.resolve<Loaded<MyPosition | null>>({ ok: true, data: null }),
    ]);
    if (id !== this.request) return; // A newer search or sort finished first.
    this.el.classList.remove('loading');
    this.render(rows, me.ok ? me.data : null);
  }

  private skeleton(): void {
    const n = Math.min(this.opts.limit, 5);
    this.list.replaceChildren(...Array.from({ length: n }, () => h('li', { class: 'lb-row skeleton', attrs: { 'aria-hidden': 'true' } })));
  }

  private render(result: Loaded<LeaderboardRow[]>, me: MyPosition | null): void {
    this.pinned.replaceChildren();
    if (!result.ok) {
      this.list.replaceChildren();
      const msg = h('p', { text: result.message });
      const action =
        result.reason === 'guest' && this.opts.onLogin
          ? h('button', { class: 'btn primary', attrs: { type: 'button' }, on: { click: () => this.opts.onLogin?.() } }, [h('span', { class: 'btn-icon', html: ICONS.user }), 'Log in / Sign up'])
          : result.reason === 'offline' || result.reason === 'error'
            ? h('button', { class: 'btn', text: 'Try again', attrs: { type: 'button' }, on: { click: () => void this.reload() } })
            : null;
      this.status.replaceChildren(msg, ...(action ? [action] : []));
      this.status.className = `lb-status ${result.reason}`;
      return;
    }
    const rows = result.data.slice(0, this.opts.limit);
    this.status.className = 'lb-status';
    if (!rows.length) {
      this.list.replaceChildren();
      this.status.replaceChildren(
        h('p', { text: this.term ? `No commander called “${this.term}” on the board.` : 'No commanders on the board yet — be the first!' }),
      );
      return;
    }
    this.status.replaceChildren();
    this.list.replaceChildren(...rows.map((r) => this.row(r)));

    // Your own place, pinned under the board when you are not in the rows shown.
    if (this.opts.full && !this.term && me && !rows.some((r) => r.isMe)) {
      const unit = SORTS.find((s) => s.id === this.sort)!.unit;
      this.pinned.append(
        h('div', { class: 'lb-me' }, [
          h('span', { class: 'lb-pos', text: me.listed ? `#${me.position}` : '—' }),
          h('span', {
            class: 'lb-me-text',
            text: me.listed ? `You · ${me.score.toLocaleString()} ${unit} · of ${me.total} commanders` : 'You are hidden from the board (see My profile).',
          }),
        ]),
      );
    }
  }

  private row(r: LeaderboardRow): HTMLElement {
    const rank = rankForXp(r.xp);
    const sort = SORTS.find((s) => s.id === this.sort)!;
    const value = this.opts.full ? r.score : r.xp;
    const unit = this.opts.full ? sort.unit : 'XP';
    const pos = r.position <= 3 ? MEDALS[r.position - 1] : `#${r.position}`;
    const btn = h(
      'button',
      {
        class: `lb-row${r.isMe ? ' me' : ''}${r.position <= 3 ? ` top top-${r.position}` : ''}`,
        attrs: { type: 'button', 'aria-label': `${r.username}, place ${r.position}, ${rank.title}, ${value} ${unit}${r.online ? ', online now' : ''}` },
        on: { click: () => this.opts.onOpen(r.userId) },
      },
      [
        h('span', { class: 'lb-pos', text: pos }),
        h('span', { class: `rank-badge small rank-${rank.level}`, html: rankBadgeSvg(rank) }),
        h('span', { class: 'lb-name' }, [
          h('strong', {}, [r.username, r.isMe ? h('span', { class: 'lb-you', text: 'you' }) : null]),
          h('span', { class: 'muted', text: rank.title }),
        ]),
        r.online ? h('span', { class: 'lb-online', title: 'Playing now' }) : null,
        h('span', { class: 'lb-score' }, [h('strong', { text: value.toLocaleString() }), h('span', { class: 'muted', text: unit })]),
      ],
    );
    return h('li', {}, [btn]);
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.request++;
  }
}
