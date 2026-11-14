import { REGIONS, HOME_REGION_ID } from '../data/regions';
import { SURVEY } from '../data/progression';
import { RESOURCES, type ResourceId } from '../data/resources';
import { SETTLEMENT } from '../data/settlement';
import type { EventBus } from '../core/EventBus';
import { gameStore, regionManager, type GameStore } from '../state/gameStore';
import { clear, h } from './dom';
import { ICONS, RESOURCE_ICONS } from './icons';
import type { Panel } from './SidePanel';

type Status = 'explored' | 'frontier' | 'surveying' | 'unknown';

function statusOf(s: GameStore, id: string): Status {
  if (s.discoveredRegions[id]) return 'explored';
  if (s.missions.some((m) => m.status === 'active' && m.regionId === id)) return 'surveying';
  if (regionManager.isFrontier(id, s.discoveredRegions)) return 'frontier';
  return 'unknown';
}

const STATUS_TEXT: Record<Status, string> = {
  explored: 'Explored',
  frontier: 'Ready to survey',
  surveying: 'Rover on the way',
  unknown: 'Unexplored',
};

/** Region browser + survey-mission launcher. Regions are the real USGS Mars Charts. */
export class ExplorationPanel implements Panel {
  readonly id = 'exploration' as const;
  readonly title = 'Exploration';
  readonly subtitle = 'Mars is split into 30 map regions. Send survey rovers to explore new ones!';
  readonly el: HTMLElement;
  private detail: HTMLElement;
  private list: HTMLElement;
  private summary: HTMLElement;
  private unsub: (() => void) | null = null;
  private lastKey = '';

  constructor(private events: EventBus) {
    this.summary = h('div', { class: 'explore-summary' });
    this.detail = h('div', { class: 'region-detail' });
    this.list = h('div', { class: 'region-list' });
    this.el = h('div', { class: 'explore' }, [this.summary, this.detail, h('h3', { class: 'section-title', text: 'All regions' }), this.list]);
  }

  show(): void {
    this.lastKey = '';
    this.render();
    this.unsub = gameStore.subscribe(() => this.render());
  }

  hide(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private render(): void {
    const s = gameStore.getState();
    // Re-render only when something relevant changed (not on every resource tick).
    const affordable = s.resources.iron >= (SURVEY.cost.iron ?? 0) && s.resources.regolith >= (SURVEY.cost.regolith ?? 0);
    const key = [
      s.selectedRegionId,
      Object.values(s.discoveredRegions).filter(Boolean).length,
      s.missions.map((m) => `${m.id}:${m.status}`).join(','),
      affordable,
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.renderSummary(s);
    this.renderDetail(s);
    this.renderList(s);
  }

  private renderSummary(s: GameStore): void {
    const n = REGIONS.filter((r) => s.discoveredRegions[r.id]).length;
    clear(this.summary);
    this.summary.append(
      h('div', { class: 'summary-row' }, [h('strong', { text: `${n} / ${REGIONS.length}` }), h('span', { text: ' regions explored' })]),
      h('div', { class: 'progress' }, [h('span', { class: 'progress-fill', style: { transform: `scaleX(${n / REGIONS.length})` } })]),
    );
  }

  private renderDetail(s: GameStore): void {
    const id = s.selectedRegionId ?? HOME_REGION_ID;
    const r = regionManager.get(id)!;
    const status = statusOf(s, id);
    const km = regionManager.distanceKm(SETTLEMENT.lat, SETTLEMENT.lon, id);
    const isHome = id === HOME_REGION_ID;
    clear(this.detail);

    const check = gameStore.getState().surveyCheck(id);
    const sols = SURVEY.baseSols + km / SURVEY.kmPerSol;
    const costEls = (Object.entries(SURVEY.cost) as [ResourceId, number][]).map(([rid, v]) =>
      h('span', { class: 'cost', style: { ['--chip-color' as never]: RESOURCES[rid].color } }, [h('span', { class: 'cost-icon', html: RESOURCE_ICONS[rid] }), `${v}`]),
    );
    const launch = h(
      'button',
      {
        class: 'btn primary',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const res = gameStore.getState().launchSurvey(id);
            if (!res.ok) gameStore.getState().pushAlert({ key: 'survey-fail', level: 'warning', title: 'Can’t launch rover', message: res.reason });
          },
        },
      },
      [h('span', { class: 'btn-icon', html: ICONS.rover }), `Send survey rover · ${sols.toFixed(1)} sols`],
    );
    if (!check.ok) launch.setAttribute('disabled', 'true');

    this.detail.append(
      h('div', { class: 'region-head' }, [
        h('span', { class: 'region-code', text: r.id }),
        h('span', { class: `status-pill ${status}`, text: isHome ? 'Home region' : STATUS_TEXT[status] }),
      ]),
      h('h3', { class: 'region-name', text: r.name }),
      h('p', { class: 'region-desc', text: r.description }),
      h('ul', { class: 'highlights' }, r.highlights.map((t) => h('li', { text: t }))),
      h('div', { class: 'region-meta' }, [
        h('span', { text: `${r.latMin}° to ${r.latMax}° lat` }),
        h('span', { text: isHome ? 'Our base is here' : `${Math.round(km).toLocaleString()} km from base` }),
      ]),
      h('div', { class: 'region-actions' }, [
        h(
          'button',
          {
            class: 'btn',
            attrs: { type: 'button' },
            on: {
              click: () => {
                const c = regionManager.center(id);
                if (isHome) this.events.emit('camera:home');
                else this.events.emit('camera:flyTo', { lat: c.lat, lon: c.lon, altitude: r.latMin >= 65 || r.latMax <= -65 ? 110 : 75 });
              },
            },
          },
          [h('span', { class: 'btn-icon', html: ICONS.target }), 'Fly there'],
        ),
        status === 'explored' ? null : launch,
      ]),
    );
    if (status !== 'explored') {
      this.detail.append(
        h('div', { class: 'survey-cost' }, [h('span', { text: 'Rover cost:' }), ...costEls, check.ok ? null : h('span', { class: 'reason', text: check.reason })]),
      );
    }
  }

  private renderList(s: GameStore): void {
    clear(this.list);
    const order: Status[] = ['surveying', 'frontier', 'explored', 'unknown'];
    const sorted = [...REGIONS].sort((a, b) => order.indexOf(statusOf(s, a.id)) - order.indexOf(statusOf(s, b.id)));
    for (const r of sorted) {
      const st = statusOf(s, r.id);
      const row = h(
        'button',
        {
          class: `region-row ${st} ${s.selectedRegionId === r.id ? 'selected' : ''}`,
          attrs: { type: 'button' },
          on: {
            click: () => {
              gameStore.getState().selectRegion(r.id);
              const c = regionManager.center(r.id);
              this.events.emit('camera:flyTo', { lat: c.lat, lon: c.lon, altitude: 95 });
            },
          },
        },
        [h('span', { class: 'dot' }), h('span', { class: 'row-code', text: r.id }), h('span', { class: 'row-name', text: r.name }), h('span', { class: 'row-status', text: STATUS_TEXT[st] })],
      );
      this.list.append(row);
    }
  }
}
