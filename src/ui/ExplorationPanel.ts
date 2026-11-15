import { REGIONS, HOME_REGION_ID } from '../data/regions';
import { EXPEDITION, NASA_ROVER_DATA, ORBITAL_SCAN, OUTPOST, realScanSols, rewardFor } from '../data/missions';
import { rankById } from '../data/progression';
import { MissionManager } from '../simulation/MissionManager';
import { RESOURCES, type ResourceId } from '../data/resources';
import type { EventBus } from '../core/EventBus';
import { gameStore, getRouteHeight, regionManager, type GameStore } from '../state/gameStore';
import type { Expedition, MissionActivity, OrbitalScan } from '../state/types';
import { clear, h, setText } from './dom';
import { ICONS, RESOURCE_ICONS } from './icons';
import type { Panel } from './SidePanel';
import { SitesSection } from './SitesSection';
import { t } from '../i18n';

type Status = 'home' | 'explored' | 'expedition' | 'mapped' | 'scanning' | 'unknown';

function statusOf(s: GameStore, id: string): Status {
  if (id === HOME_REGION_ID) return 'home';
  if (s.exploredRegions[id] && !activeExpedition(s, id)) return 'explored';
  if (activeExpedition(s, id)) return 'expedition';
  if (s.discoveredRegions[id]) return 'mapped';
  if (activeScan(s, id)) return 'scanning';
  return 'unknown';
}

function activeExpedition(s: GameStore, id: string): Expedition | undefined {
  return s.missions.find((m): m is Expedition => m.type === 'expedition' && m.status === 'active' && m.regionId === id);
}

function activeScan(s: GameStore, id: string): OrbitalScan | undefined {
  return s.missions.find((m): m is OrbitalScan => m.type === 'orbital' && m.status === 'active' && m.regionId === id);
}

const STATUS_TEXT: Record<Status, string> = {
  home: t('Home region'),
  explored: t('Explored'),
  expedition: t('Crew on the way'),
  mapped: t('Mapped'),
  scanning: t('Mapping…'),
  unknown: t('Not mapped'),
};

/** Same colours as before: green explored, blue ready for the next step, orange busy. */
const STATUS_CLASS: Record<Status, string> = {
  home: 'explored',
  explored: 'explored',
  expedition: 'surveying',
  mapped: 'frontier',
  scanning: 'surveying',
  unknown: 'unknown',
};

export const ACTIVITY_TEXT: Record<MissionActivity, string> = {
  scanning: `📡 ${t('Photographing from orbit')}`,
  driving: `🚙 ${t('Driving')}`,
  night: `🌙 ${t('Parked for the night (no sun for the solar panels)')}`,
  storm: `🌪️ ${t('Waiting out a dust storm')}`,
  sampling: `🔬 ${t('Collecting samples')}`,
  done: `✔ ${t('Done')}`,
};

/** Earth years a number of sols lasts (S1: a sol is 24.6597 h). */
const solsToYears = (sols: number) => (sols * 24.6597) / 24 / 365.25;

/** Map → Crew → Outpost: where this region stands, with the reason a step is locked. */
function stepTracker(s: GameStore, id: string, status: Status): HTMLElement {
  const mapped = !!s.discoveredRegions[id];
  const explored = !!s.exploredRegions[id];
  const hasOutpost = s.outposts.some((o) => o.regionId === id);
  const canOutpost = !!rewardFor(id).outpost;
  const step = (n: number, label: string, done: boolean, busy: boolean, why: string | null) =>
    h('div', { class: `step ${done ? 'done' : busy ? 'busy' : why ? 'locked' : 'ready'}`, title: why ?? '' }, [
      h('span', { class: 'step-n', text: done ? '✓' : String(n) }),
      h('span', { text: label }),
    ]);
  const exp = s.expeditionCheck(id);
  return h('div', { class: 'step-tracker' }, [
    step(1, t('Map from orbit'), mapped, status === 'scanning', null),
    step(2, t('Send a crew'), explored, status === 'expedition', !mapped ? t('Map it from orbit first.') : exp.ok ? null : exp.reason),
    canOutpost ? step(3, t('Build an outpost'), hasOutpost, false, !explored ? t('Send a crew first.') : null) : step(3, t('Found a base (below)'), false, false, null),
  ]);
}

/** A region where the player can do something right now (scan or send a crew), else home. */
function bestNextRegion(s: GameStore): string {
  const home = REGIONS.find((r) => r.id === HOME_REGION_ID)!;
  const byDist = [...REGIONS].sort(
    (a, b) => Math.hypot(a.latMin - home.latMin, a.lonMin - home.lonMin) - Math.hypot(b.latMin - home.latMin, b.lonMin - home.lonMin),
  );
  return (
    byDist.find((r) => s.expeditionCheck(r.id).ok)?.id ??
    byDist.find((r) => s.scanCheck(r.id).ok && regionManager.isFrontier(r.id, s.exploredRegions))?.id ??
    byDist.find((r) => s.scanCheck(r.id).ok)?.id ??
    HOME_REGION_ID
  );
}

/** Region browser: map regions from orbit, send crew expeditions, build outposts. Regions are the real USGS Mars Charts. */
export class ExplorationPanel implements Panel {
  readonly id = 'exploration' as const;
  readonly title = t('Exploration');
  readonly subtitle = t('Explore like NASA: map a region from orbit, then send a crew rover to look up close.');
  readonly el: HTMLElement;
  private detail: HTMLElement;
  private list: HTMLElement;
  private summary: HTMLElement;
  private sites: SitesSection;
  private unsub: (() => void) | null = null;
  private lastKey = '';
  /** Live bar + text for the selected region's mission or outpost. */
  private live: { fill: HTMLElement; eta: HTMLElement; note: HTMLElement; update: (s: GameStore) => void } | null = null;

  constructor(private events: EventBus) {
    this.summary = h('div', { class: 'explore-summary' });
    this.detail = h('div', { class: 'region-detail' });
    this.list = h('div', { class: 'region-list' });
    this.sites = new SitesSection(events);
    this.el = h('div', { class: 'explore' }, [this.summary, this.detail, this.sites.el, h('h3', { class: 'section-title', text: t('All regions') }), this.list]);
  }

  show(): void {
    this.lastKey = '';
    // Open on the most useful region: one where the next step can be taken right now.
    const st = gameStore.getState();
    if (!st.selectedRegionId) st.selectRegion(bestNextRegion(st));
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
    const id = s.selectedRegionId ?? HOME_REGION_ID;
    const reasons = [s.scanCheck(id), s.expeditionCheck(id), s.outpostCheck(id)].map((c) => (c.ok ? 'ok' : c.reason.replace(/\d+ kWh\. Wait/, 'kWh. Wait')));
    const key = [
      id,
      Object.values(s.discoveredRegions).filter(Boolean).length,
      Object.values(s.exploredRegions).filter(Boolean).length,
      s.missions.map((m) => `${m.id}:${m.status}:${m.type === 'expedition' ? m.arrived : ''}`).join(','),
      s.outposts.map((o) => `${o.id}:${s.timeSols >= o.readySol}:${o.reserveLeft > 0}`).join(','),
      ...reasons,
      s.progression.level,
      this.sites.key(s, id),
    ].join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.renderSummary(s);
      this.renderDetail(s);
      this.renderList(s);
      this.sites.render(s, id);
    }
    this.live?.update(s);
    this.sites.update(s);
  }

  private renderSummary(s: GameStore): void {
    const mapped = REGIONS.filter((r) => s.discoveredRegions[r.id]).length;
    const explored = REGIONS.filter((r) => s.exploredRegions[r.id]).length;
    clear(this.summary);
    this.summary.append(
      h('div', { class: 'summary-row' }, [
        h('strong', { text: `${mapped} / ${REGIONS.length}` }),
        h('span', { text: ` ${t('mapped from orbit')} · ` }),
        h('strong', { text: `${explored}` }),
        h('span', { text: ` ${t('visited by crew')}` }),
      ]),
      h('div', { class: 'progress' }, [h('span', { class: 'progress-fill', style: { transform: `scaleX(${mapped / REGIONS.length})` } })]),
    );
  }

  private chip(rid: ResourceId, v: number, plus = false): HTMLElement {
    return h('span', { class: 'cost', style: { ['--chip-color' as never]: RESOURCES[rid].color } }, [h('span', { class: 'cost-icon', html: RESOURCE_ICONS[rid] }), `${plus ? '+' : ''}${Math.round(v).toLocaleString()}`]);
  }

  private button(label: string, icon: string, check: { ok: boolean }, run: () => { ok: true } | { ok: false; reason: string }, title: string): HTMLElement {
    const b = h(
      'button',
      {
        class: 'btn primary',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const res = run();
            if (!res.ok) gameStore.getState().pushAlert({ key: 'explore-fail', level: 'warning', title, message: res.reason });
          },
        },
      },
      [h('span', { class: 'btn-icon', html: icon }), label],
    );
    if (!check.ok) b.setAttribute('disabled', 'true');
    return b;
  }

  private liveCard(icon: string, title: string, update: (s: GameStore, fill: HTMLElement, eta: HTMLElement, note: HTMLElement) => void): HTMLElement {
    const fill = h('span', { class: 'progress-fill' });
    const eta = h('span', { class: 'eta' });
    const note = h('div', { class: 'mission-note' });
    this.live = { fill, eta, note, update: (s) => update(s, fill, eta, note) };
    return h('div', { class: 'mission-card live' }, [
      h('div', { class: 'mission-head' }, [h('span', { class: 'btn-icon rover-bob', html: icon }), h('strong', { text: title }), eta]),
      h('div', { class: 'progress' }, [fill]),
      note,
    ]);
  }

  private renderDetail(s: GameStore): void {
    const id = s.selectedRegionId ?? HOME_REGION_ID;
    const r = regionManager.get(id)!;
    const status = statusOf(s, id);
    const reward = rewardFor(id);
    const plan = MissionManager.planRoute(regionManager, id, getRouteHeight(), s.base);
    this.live = null;
    clear(this.detail);

    this.detail.append(
      h('div', { class: 'region-head' }, [h('span', { class: 'region-code', text: r.id }), h('span', { class: `status-pill ${STATUS_CLASS[status]}`, text: STATUS_TEXT[status] })]),
      h('h3', { class: 'region-name', text: r.name }),
      h('p', { class: 'region-desc', text: r.description }),
      h('ul', { class: 'highlights' }, r.highlights.map((line) => h('li', { text: line }))),
      h('div', { class: 'region-meta' }, [
        h('span', { text: t('{min}° to {max}° lat', { min: r.latMin, max: r.latMax }) }),
        h('span', { text: status === 'home' ? t('Our base is here') : t('{n} km from base', { n: Math.round(plan.routeKm).toLocaleString() }) }),
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
                if (status === 'home') this.events.emit('camera:home');
                else this.events.emit('camera:flyTo', { lat: c.lat, lon: c.lon, altitude: r.latMin >= 65 || r.latMax <= -65 ? 110 : 75 });
              },
            },
          },
          [h('span', { class: 'btn-icon', html: ICONS.target }), t('Fly there')],
        ),
      ]),
    );
    if (status !== 'home') this.detail.append(stepTracker(s, id, status));
    if (status === 'home') return;

    // Step 1: map from orbit.
    if (status === 'unknown' || status === 'scanning') {
      this.detail.append(h('h4', { class: 'step-title', text: t('Step 1 · Map it from orbit') }));
      const scan = activeScan(s, id);
      if (scan) {
        this.detail.append(
          this.liveCard(ICONS.satellite, t('Orbiter mapping'), (st, fill, eta, note) => {
            const m = st.missions.find((x) => x.id === scan.id);
            if (!m) return;
            fill.style.transform = `scaleX(${m.progress.toFixed(3)})`;
            setText(eta, t('{n} sols to go', { n: MissionManager.remainingSols(m).toFixed(1) }));
            setText(note, ACTIVITY_TEXT.scanning);
          }),
        );
      } else {
        const check = s.scanCheck(id);
        const sols = MissionManager.scanSols(regionManager, id);
        this.detail.append(
          h('div', { class: 'region-actions' }, [this.button(`${t('Map from orbit')} · ${t('{n} sols', { n: sols.toFixed(1) })}`, ICONS.satellite, check, () => gameStore.getState().launchScan(id), t('Can’t map it yet'))]),
          h('div', { class: 'survey-cost reward' }, [h('span', { class: 'label', text: t('Reward') }), h('span', { class: 'cost xp', style: { ['--chip-color' as never]: '#ffb03d' } }, [`★ +${ORBITAL_SCAN.xp} ${t('XP')}`])]),
          ...(check.ok ? [] : [h('p', { class: 'reason', text: check.reason })]),
        );
      }
      const realSols = realScanSols(regionManager.areaFraction(id));
      this.detail.append(
        h('div', { class: 'fun-fact' }, [
          h('strong', { text: `${t('Real NASA data:')} ` }),
          t(
            'The Context Camera on NASA’s Mars Reconnaissance Orbiter, which circles Mars every {orbit} minutes, took more than 10 years to photograph 99% of Mars. At that pace this region would take about {sols} sols. Our orbiter is sped up {scale}×.',
            { orbit: NASA_ROVER_DATA.mroOrbitMinutes, sols: Math.round(realSols), scale: ORBITAL_SCAN.timeScale },
          ),
        ]),
      );
      return;
    }

    this.detail.append(h('div', { class: 'fun-fact' }, [h('strong', { text: `${t('Orbit map:')} ` }), reward.hint]));

    // Step 2: send the crew.
    if (status === 'mapped' || status === 'expedition') {
      this.detail.append(h('h4', { class: 'step-title', text: t('Step 2 · Send a crew rover') }));
      const exp = activeExpedition(s, id);
      if (exp) {
        this.detail.append(
          this.liveCard(ICONS.rover, exp.arrived ? t('Crew driving home') : t('Crew driving there'), (st, fill, eta, note) => {
            const m = st.missions.find((x) => x.id === exp.id);
            if (!m || m.type !== 'expedition') return;
            fill.style.transform = `scaleX(${m.progress.toFixed(3)})`;
            setText(eta, `≈ ${t('{n} sols to go', { n: MissionManager.remainingSols(m).toFixed(1) })}`);
            setText(note, `${ACTIVITY_TEXT[m.activity]} · ${t('{done} of {total} km', { done: Math.round(Math.min(m.drivenKm, m.legKm * 2)).toLocaleString(), total: Math.round(m.legKm * 2).toLocaleString() })}`);
          }),
        );
      } else {
        const check = s.expeditionCheck(id);
        const { supplies } = MissionManager.supplies(plan);
        const rewardEls = [
          ...(Object.entries(reward.resources ?? {}) as [ResourceId, number][]).map(([rid, v]) => this.chip(rid, v, true)),
          h('span', { class: 'cost xp', style: { ['--chip-color' as never]: '#ffb03d' } }, [`★ +${reward.xp} ${t('XP')}`]),
          reward.outpost ? h('span', { class: 'cost', style: { ['--chip-color' as never]: RESOURCES[reward.outpost.resource].color } }, [`⛏️ ${t('outpost site')}`]) : null,
        ];
        this.detail.append(
          h('ul', { class: 'route-facts' }, [
            h('li', { text: t('Route: {km} km, climbing {m} m up and down', { km: Math.round(plan.routeKm).toLocaleString(), m: Math.round(plan.climbM).toLocaleString() }) }),
            h('li', { text: t('There and back: about {n} sols (longer if a dust storm hits)', { n: plan.totalSols.toFixed(1) }) }),
            h('li', { text: t('Crew: {n} astronauts. They pack food, water and oxygen for the trip plus 72 hours spare.', { n: EXPEDITION.crew }) }),
          ]),
          h('div', { class: 'region-actions' }, [this.button(t('Send crew rover'), ICONS.rover, check, () => gameStore.getState().launchExpedition(id), t('Can’t send the crew'))]),
          h('div', { class: 'survey-cost' }, [
            h('span', { class: 'label', text: t('Packs') }),
            ...(Object.entries(supplies) as [ResourceId, number][]).map(([rid, v]) => this.chip(rid, v)),
            h('span', { class: 'cost', style: { ['--chip-color' as never]: '#ffd34d' }, title: t('Battery charge for the rover') }, [`🔋 ${EXPEDITION.energyKwh} ${t('kWh')}`]),
          ]),
          h('div', { class: 'survey-cost reward' }, [h('span', { class: 'label', text: reward.rank ? `🔒 ${rankById(reward.rank).title}` : t('Reward') }), ...rewardEls]),
          ...(check.ok ? [] : [h('p', { class: 'reason', text: check.reason })]),
        );
      }
      const perseveranceSols = (plan.routeKm * 1000) / NASA_ROVER_DATA.perseveranceRecordMPerSol;
      this.detail.append(
        h('div', { class: 'fun-fact' }, [
          h('strong', { text: `${t('Real NASA data:')} ` }),
          t(
            'NASA’s crew rover design drives about {speed} km/h, and only in daylight here because it runs on solar power. The Perseverance robot drove its record {record} m in one sol; at that pace this trip would take it about {years} years! Our crew rover is sped up {scale}×.',
            { speed: NASA_ROVER_DATA.sevSpeedKmh, record: NASA_ROVER_DATA.perseveranceRecordMPerSol, years: Math.round(solsToYears(perseveranceSols)), scale: EXPEDITION.timeScale },
          ),
        ]),
      );
      return;
    }

    // Step 3: explored. Show the report and the outpost.
    const done = [...s.missions].reverse().find((m): m is Expedition => m.type === 'expedition' && m.regionId === id && !!m.reward);
    this.detail.append(h('div', { class: 'fun-fact' }, [h('strong', { text: `${t('Crew report:')} ` }), done?.reward?.find ?? reward.find]));
    const site = reward.outpost;
    if (!site) return;
    this.detail.append(h('h4', { class: 'step-title', text: t('Step 3 · Build an outpost') }));
    const outpost = s.outposts.find((o) => o.regionId === id);
    const res = RESOURCES[site.resource];
    if (outpost) {
      this.detail.append(
        this.liveCard(ICONS.rover, site.label, (st, fill, eta, note) => {
          const o = st.outposts.find((x) => x.id === outpost.id);
          if (!o) return;
          if (st.timeSols < o.readySol) {
            const start = o.readySol - OUTPOST.setupSols - o.tripSols / 2;
            fill.style.transform = `scaleX(${Math.min(1, Math.max(0, (st.timeSols - start) / (o.readySol - start))).toFixed(3)})`;
            setText(eta, t('Ready in {n} sols', { n: (o.readySol - st.timeSols).toFixed(1) }));
            setText(note, `🏗️ ${t('The kit is being driven there and set up.')}`);
          } else if (o.reserveLeft <= 0) {
            fill.style.transform = 'scaleX(1)';
            setText(eta, t('Empty'));
            setText(note, t('This site has been mined out.'));
          } else {
            const f = (st.timeSols - o.lastTripSol) / o.tripSols;
            fill.style.transform = `scaleX(${Math.min(1, Math.max(0, f)).toFixed(3)})`;
            setText(eta, t('Cargo in {n} sols', { n: Math.max(0, o.lastTripSol + o.tripSols - st.timeSols).toFixed(1) }));
            setText(
              note,
              `🚚 ${t('Next load: {n} {unit} {resource} · {left} t left at the site', { n: Math.round(MissionManager.cargoLoad(o)), unit: res.unit, resource: res.name.toLowerCase(), left: (o.reserveLeft / 1000).toFixed(1) })}`,
            );
          }
        }),
      );
    } else {
      const check = s.outpostCheck(id);
      this.detail.append(
        h('p', { class: 'region-desc', text: t('{site}: about {n} {unit} of {resource} per sol. A cargo rover brings it home, up to {kg} kg per trip (the payload of NASA’s crew rover design).', { site: site.label, n: site.perSol, unit: res.unit, resource: res.name.toLowerCase(), kg: OUTPOST.cargoPayloadKg }) }),
        h('div', { class: 'region-actions' }, [this.button(t('Build outpost'), ICONS.target, check, () => gameStore.getState().buildOutpost(id), t('Can’t build the outpost'))]),
        h('div', { class: 'survey-cost' }, [h('span', { class: 'label', text: t('Needs') }), ...(Object.entries(OUTPOST.cost) as [ResourceId, number][]).map(([rid, v]) => this.chip(rid, v))]),
        ...(check.ok ? [] : [h('p', { class: 'reason', text: check.reason })]),
      );
    }
  }

  private renderList(s: GameStore): void {
    clear(this.list);
    const order: Status[] = ['expedition', 'scanning', 'mapped', 'unknown', 'explored', 'home'];
    const sorted = [...REGIONS].sort((a, b) => order.indexOf(statusOf(s, a.id)) - order.indexOf(statusOf(s, b.id)));
    for (const r of sorted) {
      const st = statusOf(s, r.id);
      const row = h(
        'button',
        {
          class: `region-row ${STATUS_CLASS[st]} ${s.selectedRegionId === r.id ? 'selected' : ''}`,
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
