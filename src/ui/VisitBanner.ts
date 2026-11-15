import { BUILDINGS } from '../data/buildings';
import { SITE_BY_ID } from '../data/baseSites';
import { buildingThumbnail } from '../settlement/buildings/thumbnails';
import { Visits, type Visit } from '../core/Visits';
import type { PublicBuilding } from '../persistence/Leaderboard';
import { buildingIcon, h, setText } from './dom';
import { BUILDING_ICONS, ICONS } from './icons';

/**
 * Shown while visiting another player's colony: whose it is, a picker for their
 * bases, and the way back home. Also a small read-only card for a clicked building.
 */
export class VisitBanner {
  private el: HTMLElement;
  private name: HTMLElement;
  private sub: HTMLElement;
  private bases: HTMLSelectElement;
  private card: HTMLElement;

  constructor(parent: HTMLElement) {
    this.name = h('strong');
    this.sub = h('span');
    this.bases = h('select', { class: 'visit-bases', attrs: { 'aria-label': 'Which base to look at' } });
    this.bases.addEventListener('change', () => {
      const v = Visits.current;
      if (v) Visits.start(v.colony, this.bases.value);
    });
    const home = h('button', { class: 'btn primary', attrs: { type: 'button' }, on: { click: () => Visits.stop() } }, [
      h('span', { class: 'btn-icon', html: ICONS.home }),
      'Return home',
    ]);
    this.el = h('div', { class: 'visit-banner', attrs: { role: 'region', 'aria-label': 'Visiting another colony', hidden: '' } }, [
      h('div', { class: 'visit-who' }, [h('span', { class: 'visit-eye', html: ICONS.eye }), h('div', { class: 'visit-text' }, [this.name, this.sub])]),
      this.bases,
      home,
    ]);
    this.card = h('div', { class: 'visit-card', attrs: { hidden: '', role: 'status' } });
    parent.append(this.el, this.card);
    Visits.onChange((v) => this.render(v));
  }

  private render(v: Visit | null): void {
    this.showBuilding(null);
    if (!v) {
      this.el.setAttribute('hidden', '');
      return;
    }
    this.el.removeAttribute('hidden');
    setText(this.name, `Visiting ${v.colony.username}’s colony`);
    setText(this.sub, `Sol ${v.colony.sol} · look around, nothing can be changed here`);
    this.bases.replaceChildren(
      ...v.colony.bases.map((b) => h('option', { text: `${b.name} (${SITE_BY_ID[b.siteId]?.name ?? 'Mars'})`, attrs: { value: b.id } })),
    );
    this.bases.value = v.baseId;
    this.bases.hidden = v.colony.bases.length < 2;
  }

  showBuilding(b: PublicBuilding | null): void {
    const def = b ? BUILDINGS[b.type] : undefined;
    if (!b || !def) {
      this.card.setAttribute('hidden', '');
      return;
    }
    const state = b.constructionProgress < 1 ? `Under construction · ${Math.round(b.constructionProgress * 100)}%` : def.description;
    this.card.replaceChildren(
      buildingIcon('bp-icon', buildingThumbnail(def.id), BUILDING_ICONS[def.id]),
      h('div', { class: 'visit-text' }, [h('strong', { text: def.name }), h('span', { text: state })]),
    );
    this.card.removeAttribute('hidden');
  }
}
