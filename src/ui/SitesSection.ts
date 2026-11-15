import { sitesIn, TRAITS, visibleTraits, type BaseSite } from '../data/baseSites';
import { FOUNDING, OUTPOST } from '../data/missions';
import { RESOURCES, type ResourceId } from '../data/resources';
import { MissionManager } from '../simulation/MissionManager';
import { gameStore, getRouteHeight, type GameStore } from '../state/gameStore';
import type { Expedition } from '../state/types';
import type { EventBus } from '../core/EventBus';
import { clear, h, setText } from './dom';
import { ICONS, RESOURCE_ICONS } from './icons';
import { t, tn } from '../i18n';

/**
 * Base sites of one region: what the orbiter has spotted, each site's strengths and
 * weaknesses, and the button that sends a founding convoy there.
 */
export class SitesSection {
  readonly el = h('div', { class: 'sites' });
  private live: { el: HTMLElement; fill: HTMLElement; m: string }[] = [];

  constructor(private events: EventBus) {}

  /** A key that changes whenever this section needs a redraw. */
  key(s: GameStore, regionId: string): string {
    const sites = sitesIn(regionId);
    return [
      regionId,
      sites.map((x) => `${x.id}:${s.sitesSeen[x.id] ?? 0}`).join(','),
      s.base.id,
      s.otherBases.length,
      s.missions.filter((m) => m.type === 'expedition' && m.found).map((m) => `${m.id}:${m.status}`).join(','),
      s.research.completed.length,
      sites.map((x) => {
        const c = s.foundingCheck(x.id);
        return c.ok ? 'ok' : c.reason.replace(/\d+ kWh\. Wait/, 'kWh. Wait');
      }).join('|'),
    ].join('#');
  }

  render(s: GameStore, regionId: string): void {
    clear(this.el);
    this.live = [];
    const sites = sitesIn(regionId);
    if (!sites.length) {
      this.el.append(h('p', { class: 'muted', text: t('No base sites here that NASA has studied for landing or resources.') }));
      return;
    }
    const seen = sites.filter((x) => s.sitesSeen[x.id]);
    this.el.append(
      h('h4', { class: 'step-title', text: t('Base sites · {n} of {total} found', { n: seen.length, total: sites.length }) }),
      ...(seen.length < sites.length ? [h('p', { class: 'muted', text: t('Map this region from orbit to find the rest. Sites appear one by one while the orbiter works.') })] : []),
    );
    for (const site of seen) this.el.append(this.card(s, site));
  }

  /** Called every frame-ish to move convoy progress bars. */
  update(s: GameStore): void {
    for (const l of this.live) {
      const m = s.missions.find((x): x is Expedition => x.id === l.m && x.type === 'expedition');
      if (!m) continue;
      l.fill.style.transform = `scaleX(${m.progress.toFixed(3)})`;
      setText(l.el, `≈ ${t('{n} sols to go', { n: MissionManager.remainingSols(m).toFixed(1) })}`);
    }
  }

  private card(s: GameStore, site: BaseSite): HTMLElement {
    const confirmed = s.sitesSeen[site.id] === 2;
    const traits = visibleTraits(site, s.research.completed);
    const chips = traits.map((id) => {
      const d = TRAITS[id];
      const likely = !confirmed && d.orbitConfidence === 'likely';
      const title = `${d.text}\n${t('In the game:')} ${d.effect}${likely ? `\n${t('The orbiter isn’t sure yet: a crew will confirm it.')}` : ''}`;
      return h('span', { class: `trait ${d.tone}`, title }, [`${d.icon} ${d.name}${likely ? ' ?' : ''}`]);
    });
    const ns = site.lat >= 0 ? t('N') : t('S');
    const lonE = site.lon > 180 ? `${(360 - site.lon).toFixed(1)}°${t('W')}` : `${site.lon.toFixed(1)}°${t('E')}`;
    const body: (HTMLElement | null)[] = [
      h('div', { class: 'site-head' }, [h('strong', { text: site.name }), h('span', { class: 'muted', text: `${Math.abs(site.lat).toFixed(1)}°${ns} ${lonE}` })]),
      h('p', { class: 'region-desc', text: site.blurb }),
      h('div', { class: 'trait-row' }, chips.length ? chips : [h('span', { class: 'trait good', text: `⚖️ ${t('Balanced')}` })]),
    ];
    const here = s.base.siteId === site.id ? s.base : s.otherBases.find((b) => b.siteId === site.id);
    const convoy = s.missions.find((m): m is Expedition => m.type === 'expedition' && m.status === 'active' && m.found?.siteId === site.id);
    if (here) {
      body.push(
        h('div', { class: 'region-actions' }, [
          h('span', { class: 'status-pill explored', text: `🏠 ${here.name}` }),
          here.id === s.base.id
            ? null
            : h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: () => gameStore.getState().switchBase(here.id) } }, [h('span', { class: 'btn-icon', html: ICONS.home }), t('Go to this base')]),
        ]),
      );
    } else if (convoy) {
      const fill = h('span', { class: 'progress-fill' });
      const eta = h('span', { class: 'eta' });
      this.live.push({ el: eta, fill, m: convoy.id });
      body.push(h('div', { class: 'mission-card live' }, [h('div', { class: 'mission-head' }, [h('span', { class: 'btn-icon rover-bob', html: ICONS.rover }), h('strong', { text: t('Founding convoy driving there') }), eta]), h('div', { class: 'progress' }, [fill])]));
    } else {
      const check = s.foundingCheck(site.id);
      const plan = MissionManager.planBetween(s.base, site, getRouteHeight());
      const kit = MissionManager.foundingKit(plan);
      const button = h(
        'button',
        {
          class: 'btn primary',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const res = gameStore.getState().launchFounding(site.id);
              if (!res.ok) gameStore.getState().pushAlert({ key: 'found-fail', level: 'warning', title: t('Can’t send the convoy'), message: res.reason });
            },
          },
        },
        [h('span', { class: 'btn-icon', html: ICONS.rover }), t('Found a base here')],
      );
      if (!check.ok) button.setAttribute('disabled', 'true');
      body.push(
        h('ul', { class: 'route-facts' }, [
          h('li', { text: t('From {base}: {km} km, about {n} sols of driving', { base: s.base.name, km: Math.round(plan.routeKm).toLocaleString(), n: plan.oneWaySols.toFixed(1) }) }),
          h('li', {
            text: t('Convoy: 1 crew rover + {rovers} ({kg} kg; each carries up to {max} kg)', {
              rovers: tn(kit.rovers, '{n} cargo rover', '{n} cargo rovers'),
              kg: Math.round(kit.kg).toLocaleString(),
              max: OUTPOST.cargoPayloadKg,
            }),
          }),
          h('li', { text: t('{n} colonists (a woman and a man) move there for good and start a new family.', { n: FOUNDING.crew }) }),
        ]),
        h('div', { class: 'region-actions' }, [button]),
        h('div', { class: 'survey-cost' }, [
          h('span', { class: 'label', text: t('Packs') }),
          ...(Object.entries(kit.total) as [ResourceId, number][]).map(([rid, v]) =>
            h('span', { class: 'cost', style: { ['--chip-color' as never]: RESOURCES[rid].color } }, [h('span', { class: 'cost-icon', html: RESOURCE_ICONS[rid] }), `${Math.round(v)}`]),
          ),
        ]),
        check.ok ? null : h('p', { class: 'reason', text: check.reason }),
      );
    }
    body.push(
      h('button', { class: 'btn ghost small', attrs: { type: 'button' }, on: { click: () => this.events.emit('camera:flyTo', { lat: site.lat, lon: site.lon, altitude: 18 }) } }, [
        h('span', { class: 'btn-icon', html: ICONS.target }),
        t('Fly to the site'),
      ]),
    );
    return h('div', { class: `site-card${here ? ' has-base' : ''}` }, body);
  }
}
