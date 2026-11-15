import { RANKS, GOALS, rankForXp, nextLevel } from '../data/progression';
import { SITE_BY_ID } from '../data/baseSites';
import { Leaderboard, type PublicColony } from '../persistence/Leaderboard';
import { Visits } from '../core/Visits';
import { h } from './dom';
import { ICONS } from './icons';
import { rankBadgeSvg } from './RankBadge';
import { t, tn } from '../i18n';

export interface PlayerProfileOptions {
  onBack(): void;
  /** Called after a visit starts (the dialog closes). */
  onVisit(): void;
}

/** Another commander's public profile, opened from the leaderboard, with a Visit button per base. */
export class PlayerProfileView {
  readonly el: HTMLElement;
  private alive = true;

  constructor(
    private userId: string,
    private opts: PlayerProfileOptions,
  ) {
    this.el = h('div', { class: 'player-profile' }, [this.backBar(), h('div', { class: 'lb-status', attrs: { role: 'status' }, text: t('Loading profile…') })]);
    void this.load();
  }

  private backBar(): HTMLElement {
    return h('button', { class: 'btn small lb-back', attrs: { type: 'button' }, on: { click: () => this.opts.onBack() } }, [
      h('span', { class: 'btn-icon', html: ICONS.back }),
      t('Leaderboard'),
    ]);
  }

  private async load(): Promise<void> {
    const res = await Leaderboard.colony(this.userId, true);
    if (!this.alive) return;
    if (!res.ok || !res.data) {
      const msg = res.ok ? t('This commander is no longer on the leaderboard.') : res.message;
      this.el.replaceChildren(this.backBar(), h('div', { class: 'lb-status error' }, [h('p', { text: msg })]));
      return;
    }
    this.el.replaceChildren(this.backBar(), ...this.render(res.data));
    this.el.querySelector<HTMLElement>('.lb-visit')?.focus();
  }

  private render(c: PublicColony): HTMLElement[] {
    const rank = rankForXp(c.xp);
    const next = nextLevel(rank.level);
    const frac = next ? Math.min(1, (c.xp - rank.xp) / (next.xp - rank.xp)) : 1;
    const goals = GOALS.filter((g) => c.milestones.includes(g.id)).length;

    const head = h('div', { class: 'profile-head' }, [
      h('span', { class: `rank-badge large rank-${rank.level}`, html: rankBadgeSvg(rank) }),
      h('div', { class: 'profile-id' }, [
        h('span', { class: 'eyebrow', text: t('Commander profile') }),
        h('h2', { text: c.username, attrs: { id: 'profile-title' } }),
        h('p', { class: 'profile-email' }, [
          c.online ? h('span', { class: 'lb-online inline' }) : null,
          c.online ? t('Playing now') : t('Last seen on Sol {n}', { n: c.sol }),
        ]),
      ]),
    ]);

    const rankBox = h('div', { class: 'profile-rank' }, [
      h('div', { class: 'profile-rank-row' }, [h('strong', { text: `${rank.icon} ${rank.title}` }), h('span', { class: 'muted', text: t('Rank {n} of {total}', { n: rank.level, total: RANKS.length }) })]),
      h('span', { class: 'xp-bar profile-xp' }, [h('span', { class: 'xp-fill', style: { transform: `scaleX(${frac.toFixed(3)})` } })]),
      h('p', { class: 'muted', text: `${c.xp.toLocaleString()} ${t('XP')}` }),
    ]);

    const stats = h('div', { class: 'profile-stats' }, [
      stat(t('Sol'), String(c.sol)),
      stat(t('Buildings'), String(c.buildings)),
      stat(t('Regions'), String(c.regions)),
      stat(t('Crew'), String(c.colonists)),
      stat(t('Goals'), `${goals} / ${GOALS.length}`),
      stat(t('Bases'), String(c.bases.length)),
    ]);

    const bases = h(
      'ul',
      { class: 'pp-bases' },
      c.bases.map((b) => {
        const site = SITE_BY_ID[b.siteId];
        return h('li', { class: 'pp-base' }, [
          h('div', { class: 'pp-base-text' }, [
            h('strong', { text: b.name }),
            h('span', {
              class: 'muted',
              text: [
                site?.name ?? t('Mars'),
                tn(b.buildings.length, '{n} building', '{n} buildings'),
                tn(b.colonists, '{n} crew member', '{n} crew'),
                b.foundedSol > 0 ? t('since Sol {n}', { n: Math.floor(b.foundedSol) + 1 }) : '',
              ]
                .filter(Boolean)
                .join(' · '),
            }),
          ]),
          h(
            'button',
            {
              class: 'btn primary lb-visit',
              attrs: { type: 'button', 'aria-label': t('Visit {name}', { name: b.name }) },
              on: {
                click: () => {
                  Visits.start(c, b.id);
                  this.opts.onVisit();
                },
              },
            },
            [h('span', { class: 'btn-icon', html: ICONS.eye }), t('Visit')],
          ),
        ]);
      }),
    );

    return [
      head,
      rankBox,
      stats,
      h('h3', { class: 'section-title', text: c.bases.length === 1 ? t('Base') : t('Bases ({n})', { n: c.bases.length }) }),
      c.bases.length ? bases : h('p', { class: 'muted', text: t('No bases to visit yet.') }),
      h('p', { class: 'pp-note muted', text: t('Visits show the colony from its last save. You can look around but not change anything.') }),
    ];
  }

  destroy(): void {
    this.alive = false;
  }
}

function stat(label: string, value: string): HTMLElement {
  return h('div', { class: 'profile-stat' }, [h('span', { class: 'profile-stat-value', text: value }), h('span', { class: 'profile-stat-label', text: label })]);
}
