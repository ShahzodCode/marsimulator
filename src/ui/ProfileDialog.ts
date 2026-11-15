import { RANKS, GOALS, rankForXp, nextLevel } from '../data/progression';
import { formatMarsTime } from '../core/GameClock';
import { Auth, USERNAME_MAX, validateUsername } from '../persistence/Auth';
import { gameStore } from '../state/gameStore';
import { AuthDialog } from './AuthDialog';
import { h, setText } from './dom';
import { ICONS } from './icons';
import { rankBadgeSvg } from './RankBadge';
import { Leaderboard } from '../persistence/Leaderboard';
import { LeaderboardView } from './LeaderboardView';
import { PlayerProfileView } from './PlayerProfileView';

type Tab = 'profile' | 'leaderboard';

/**
 * Commander profile, opened from the rank badge in the top bar. Two tabs:
 * - My profile: name, email, rank and XP, colony stats, rank ladder, and a short
 *   online leaderboard (with search) at the bottom;
 * - Leaderboard: the full online board, sortable and searchable.
 * Clicking a player opens their public profile, from where their bases can be visited.
 */
export class ProfileDialog {
  private static open: ProfileDialog | null = null;

  readonly el: HTMLElement;
  private card: HTMLElement;
  private returnFocus: Element | null = document.activeElement;
  private editing = false;
  private offAuth: () => void;
  private tab: Tab = 'profile';
  /** Another player's profile on screen (null: the tab is shown). */
  private player: string | null = null;
  private views: { destroy(): void }[] = [];

  static toggle(parent: HTMLElement): void {
    if (ProfileDialog.open) ProfileDialog.open.close();
    else ProfileDialog.open = new ProfileDialog(parent);
  }

  private constructor(private parent: HTMLElement) {
    this.card = h('div', { class: 'auth-card profile-card' });
    this.el = h('div', { class: 'auth-modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'profile-title' } }, [this.card]);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
      e.stopPropagation();
    });
    parent.append(this.el);
    this.offAuth = Auth.onChange(() => this.render());
    this.render();
    this.card.querySelector<HTMLElement>('.auth-close')?.focus();
  }

  close(): void {
    if (ProfileDialog.open === this) ProfileDialog.open = null;
    this.offAuth();
    this.dropViews();
    this.el.classList.add('done');
    window.setTimeout(() => this.el.remove(), 250);
    (this.returnFocus as HTMLElement | null)?.focus?.();
  }

  private dropViews(): void {
    for (const v of this.views) v.destroy();
    this.views = [];
  }

  private render(): void {
    this.dropViews();
    const close = h('button', { class: 'icon-btn small auth-close', html: ICONS.close, attrs: { type: 'button', 'aria-label': 'Close' }, on: { click: () => this.close() } });
    if (this.player) {
      const view = new PlayerProfileView(this.player, {
        onBack: () => this.showTab(this.tab),
        onVisit: () => this.close(),
      });
      this.views.push(view);
      this.card.replaceChildren(close, view.el);
      return;
    }
    const body = this.tab === 'leaderboard' ? this.leaderboardTab() : this.profileTab();
    this.card.replaceChildren(close, this.tabs(), ...body.filter((x): x is HTMLElement => !!x));
  }

  private showTab(tab: Tab, focusSearch = false): void {
    this.tab = tab;
    this.player = null;
    this.editing = false;
    this.render();
    this.card.scrollTop = 0;
    if (focusSearch) this.card.querySelector<HTMLInputElement>('.lb-search input')?.focus();
    else this.card.querySelector<HTMLElement>('.profile-tab.on')?.focus();
  }

  private openPlayer(userId: string): void {
    this.player = userId;
    this.render();
    this.card.scrollTop = 0;
  }

  private tabs(): HTMLElement {
    const names: [Tab, string][] = [
      ['profile', 'My profile'],
      ['leaderboard', 'Leaderboard'],
    ];
    const list = h(
      'div',
      { class: 'profile-tabs', attrs: { role: 'tablist', 'aria-label': 'Profile sections' } },
      names.map(([id, label]) =>
        h('button', {
          class: `profile-tab${this.tab === id ? ' on' : ''}`,
          text: label,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(this.tab === id), tabindex: this.tab === id ? '0' : '-1' },
          on: { click: () => this.tab !== id && this.showTab(id) },
        }),
      ),
    );
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      this.showTab(this.tab === 'profile' ? 'leaderboard' : 'profile');
    });
    return list;
  }

  private board(full: boolean): LeaderboardView {
    const view = new LeaderboardView({
      full,
      limit: full ? 50 : 5,
      onOpen: (id) => this.openPlayer(id),
      onShowAll: full ? undefined : () => this.showTab('leaderboard', true),
      onLogin: () => this.openAuth('login'),
    });
    this.views.push(view);
    return view;
  }

  private leaderboardTab(): (HTMLElement | null)[] {
    return [
      h('div', { class: 'lb-head' }, [
        h('span', { class: 'lb-head-icon', html: ICONS.trophy }),
        h('div', {}, [
          h('h2', { text: 'Online leaderboard', attrs: { id: 'profile-title' } }),
          h('p', { class: 'muted', text: 'Commanders from all over Earth. Tap one to see their profile and visit their bases.' }),
        ]),
      ]),
      this.board(true).el,
    ];
  }

  /**
   * "Show me on the leaderboard" and the player's current place. Every signed-in player
   * is on the board from sign-up; until they pick a name they show under a placeholder.
   */
  private boardSwitch(): HTMLElement | null {
    const account = Auth.current;
    if (!account || !Auth.available) return null;
    const box = h('input', { attrs: { type: 'checkbox', disabled: '' } });
    const place = h('span', { class: 'muted lb-place' });
    const hint = h('p', { class: 'muted lb-hint' });
    const error = h('p', { class: 'auth-error', attrs: { role: 'alert' } });
    const showPlace = async (fresh: boolean) => {
      const me = await Leaderboard.myPosition('xp', fresh);
      setText(place, me.ok && me.data?.listed ? `You are #${me.data.position} of ${me.data.total} by XP` : '');
    };
    void Leaderboard.myProfile()
      .then((p) => {
        box.checked = p?.visible ?? true;
        if (!account.username && p?.username) setText(hint, `Other players see you as “${p.username}” until you pick your own name.`);
      })
      .catch(() => (box.checked = true))
      .finally(() => (box.disabled = false));
    void showPlace(false);
    box.addEventListener('change', async () => {
      box.disabled = true;
      setText(error, '');
      const r = await Leaderboard.setVisible(box.checked);
      box.disabled = false;
      if (!r.ok) {
        box.checked = !box.checked;
        setText(error, r.message ?? 'Could not change that right now.');
        return;
      }
      void showPlace(true);
      for (const v of this.views) if (v instanceof LeaderboardView) void v.reload();
    });
    return h('div', { class: 'lb-switch-row' }, [
      h('label', { class: 'lb-switch' }, [box, h('span', { class: 'lb-switch-track', attrs: { 'aria-hidden': 'true' } }), 'Show me on the leaderboard']),
      place,
      hint,
      error,
    ]);
  }

  private profileTab(): (HTMLElement | null)[] {
    const s = gameStore.getState();
    const account = Auth.current;
    const rank = rankForXp(s.progression.xp);
    const next = nextLevel(rank.level);
    const frac = next ? Math.min(1, (s.progression.xp - rank.xp) / (next.xp - rank.xp)) : 1;

    const name = account ? (account.username ?? 'New commander') : 'Guest commander';
    const header = h('div', { class: 'profile-head' }, [
      h('span', { class: `rank-badge large rank-${rank.level}`, html: rankBadgeSvg(rank) }),
      h('div', { class: 'profile-id' }, [
        h('span', { class: 'eyebrow', text: 'Commander profile' }),
        this.editing && account ? this.nameForm(account.username ?? '') : h('h2', { text: name, attrs: { id: 'profile-title' } }),
        h('p', { class: 'profile-email', text: account ? account.email : Auth.available ? 'Playing as a guest — not signed in' : 'Playing offline on this device' }),
      ]),
    ]);

    const rankBox = h('div', { class: 'profile-rank' }, [
      h('div', { class: 'profile-rank-row' }, [
        h('strong', { text: `${rank.icon} ${rank.title}` }),
        h('span', { class: 'muted', text: `Rank ${rank.level} of ${RANKS.length}` }),
      ]),
      h('span', { class: 'xp-bar profile-xp' }, [h('span', { class: 'xp-fill', style: { transform: `scaleX(${frac.toFixed(3)})` } })]),
      h('p', {
        class: 'muted',
        text: next ? `${s.progression.xp} XP — ${next.xp - s.progression.xp} XP to ${next.title}` : `${s.progression.xp} XP — you reached the highest rank!`,
      }),
    ]);

    const regions = Object.values(s.discoveredRegions).filter(Boolean).length;
    const goalsDone = GOALS.filter((g) => s.progression.milestones.includes(g.id)).length;
    const stats = h('div', { class: 'profile-stats' }, [
      stat('Sol', String(formatMarsTime(s.timeSols).sol)),
      stat('Buildings', String(s.buildings.length)),
      stat('Regions', String(regions)),
      stat('Crew', String(s.colony.colonists)),
      stat('Goals', `${goalsDone} / ${GOALS.length}`),
      stat('XP', String(s.progression.xp)),
    ]);

    const ladder = h(
      'ol',
      { class: 'rank-ladder' },
      RANKS.map((r) => {
        const state = r.level < rank.level ? 'done' : r.level === rank.level ? 'current' : 'locked';
        return h('li', { class: `rank-step ${state}` }, [
          h('span', { class: `rank-badge small rank-${r.level}`, html: rankBadgeSvg(r) }),
          h('div', { class: 'rank-step-text' }, [
            h('strong', { text: r.title }),
            h('span', { class: 'muted', text: state === 'locked' ? `Unlocks at ${r.xp} XP` : state === 'current' ? 'Your rank' : 'Earned' }),
            h('span', { class: 'rank-perks', text: r.perks.join(' · ') }),
          ]),
        ]);
      }),
    );

    return [
      header,
      rankBox,
      stats,
      this.actions(),
      h('h3', { class: 'section-title', text: 'Ranks' }),
      ladder,
      // The online leaderboard sits at the bottom of the profile: search bar on top of the best player.
      h('h3', { class: 'section-title lb-title' }, [h('span', { class: 'lb-title-icon', html: ICONS.trophy }), 'Online leaderboard']),
      this.boardSwitch(),
      this.board(false).el,
    ];
  }

  private actions(): HTMLElement {
    const account = Auth.current;
    const row = h('div', { class: 'auth-actions' });
    if (!Auth.available) return row;
    if (!account) {
      row.append(
        h('button', { class: 'btn primary', attrs: { type: 'button' }, on: { click: () => this.openAuth('login') } }, [h('span', { class: 'btn-icon', html: ICONS.user }), 'Log in / Sign up']),
      );
      return row;
    }
    if (!this.editing) {
      row.append(
        h('button', {
          class: 'btn',
          text: account.username ? 'Change name' : 'Pick your name',
          attrs: { type: 'button' },
          on: {
            click: () => {
              this.editing = true;
              this.render();
              this.card.querySelector<HTMLInputElement>('.profile-name-form input')?.focus();
            },
          },
        }),
      );
    }
    row.append(
      h('button', {
        class: 'btn danger',
        text: 'Log out',
        attrs: { type: 'button' },
        on: {
          click: async () => {
            await Auth.logOut();
            this.close();
          },
        },
      }),
    );
    return row;
  }

  private nameForm(current: string): HTMLElement {
    const input = h('input', {
      attrs: { type: 'text', name: 'username', autocomplete: 'nickname', maxlength: String(USERNAME_MAX), placeholder: 'Commander Nova', value: current, 'aria-label': 'Commander name', id: 'profile-title' },
    });
    const error = h('p', { class: 'auth-error', attrs: { role: 'alert' } });
    const save = h('button', { class: 'btn primary', text: 'Save', attrs: { type: 'submit' } });
    const cancel = h('button', {
      class: 'btn',
      text: 'Cancel',
      attrs: { type: 'button' },
      on: {
        click: () => {
          this.editing = false;
          this.render();
        },
      },
    });
    const form = h('form', { class: 'profile-name-form auth-field', attrs: { novalidate: '' } }, [input, h('div', { class: 'auth-actions' }, [save, cancel]), error]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const problem = validateUsername(input.value);
      if (problem) return setText(error, problem);
      setText(error, '');
      save.disabled = true;
      const r = await Auth.setUsername(input.value);
      save.disabled = false;
      if (!r.ok) return setText(error, r.error);
      this.editing = false;
      this.render(); // Auth.onChange already re-rendered; this keeps the view in sync if it didn't.
    });
    return form;
  }

  private openAuth(mode: 'login'): void {
    this.close();
    AuthDialog.show(this.parent, mode);
  }
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'profile-stat' }, [h('span', { class: 'profile-stat-value', text: value }), h('span', { class: 'profile-stat-label', text: label })]);
}
