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
  home: 'Home region',
  explored: 'Explored',
  expedition: 'Crew on the way',
  mapped: 'Mapped',
  scanning: 'Mapping…',
  unknown: 'Not mapped',
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
  scanning: '📡 Photographing from orbit',
  driving: '🚙 Driving',
  night: '🌙 Parked for the night (no sun for the solar panels)',
  storm: '🌪️ Waiting out a dust storm',
  sampling: '🔬 Collecting samples',
  done: '✔ Done',
};

/** Earth years a number of sols lasts (S1: a sol is 24.6597 h). */
const solsToYears = (sols: number) => (sols * 24.6597) / 24 / 365.25;

/** Region browser: map regions from orbit, send crew expeditions, build outposts. Regions are the real USGS Mars Charts. */
export class ExplorationPanel implements Panel {
  readonly id = 'exploration' as const;
  readonly title = 'Exploration';
  readonly subtitle = 'Explore like NASA: map a region from orbit, then send a crew rover to look up close.';
  readonly el: HTMLElement;
  private detail: HTMLElement;
  private list: HTMLElement;
  private summary: HTMLElement;
  private unsub: (() => void) | null = null;
  private lastKey = '';
  /** Live bar + text for the selected region's mission or outpost. */
  private live: { fill: HTMLElement; eta: HTMLElement; note: HTMLElement; update: (s: GameStore) => void } | null = null;

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
    ].join('|');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.renderSummary(s);
      this.renderDetail(s);
      this.renderList(s);
    }
    this.live?.update(s);
  }

  private renderSummary(s: GameStore): void {
    const mapped = REGIONS.filter((r) => s.discoveredRegions[r.id]).length;
    const explored = REGIONS.filter((r) => s.exploredRegions[r.id]).length;
    clear(this.summary);
    this.summary.append(
      h('div', { class: 'summary-row' }, [h('strong', { text: `${mapped} / ${REGIONS.length}` }), h('span', { text: ' mapped from orbit · ' }), h('strong', { text: `${explored}` }), h('span', { text: ' visited by crew' })]),
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
    const plan = MissionManager.planRoute(regionManager, id, getRouteHeight());
    this.live = null;
    clear(this.detail);

    this.detail.append(
      h('div', { class: 'region-head' }, [h('span', { class: 'region-code', text: r.id }), h('span', { class: `status-pill ${STATUS_CLASS[status]}`, text: STATUS_TEXT[status] })]),
      h('h3', { class: 'region-name', text: r.name }),
      h('p', { class: 'region-desc', text: r.description }),
      h('ul', { class: 'highlights' }, r.highlights.map((t) => h('li', { text: t }))),
      h('div', { class: 'region-meta' }, [
        h('span', { text: `${r.latMin}° to ${r.latMax}° lat` }),
        h('span', { text: status === 'home' ? 'Our base is here' : `${Math.round(plan.routeKm).toLocaleString()} km from base` }),
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
          [h('span', { class: 'btn-icon', html: ICONS.target }), 'Fly there'],
        ),
      ]),
    );
    if (status === 'home') return;

    // Step 1: map from orbit.
    if (status === 'unknown' || status === 'scanning') {
      this.detail.append(h('h4', { class: 'step-title', text: 'Step 1 · Map it from orbit' }));
      const scan = activeScan(s, id);
      if (scan) {
        this.detail.append(
          this.liveCard(ICONS.satellite, 'Orbiter mapping', (st, fill, eta, note) => {
            const m = st.missions.find((x) => x.id === scan.id);
            if (!m) return;
            fill.style.transform = `scaleX(${m.progress.toFixed(3)})`;
            setText(eta, `${MissionManager.remainingSols(m).toFixed(1)} sols to go`);
            setText(note, ACTIVITY_TEXT.scanning);
          }),
        );
      } else {
        const check = s.scanCheck(id);
        const sols = MissionManager.scanSols(regionManager, id);
        this.detail.append(
          h('div', { class: 'region-actions' }, [this.button(`Map from orbit · ${sols.toFixed(1)} sols`, ICONS.satellite, check, () => gameStore.getState().launchScan(id), 'Can’t map it yet')]),
          h('div', { class: 'survey-cost reward' }, [h('span', { class: 'label', text: 'Reward' }), h('span', { class: 'cost xp', style: { ['--chip-color' as never]: '#ffb03d' } }, [`★ +${ORBITAL_SCAN.xp} XP`])]),
          ...(check.ok ? [] : [h('p', { class: 'reason', text: check.reason })]),
        );
      }
      const realSols = realScanSols(regionManager.areaFraction(id));
      this.detail.append(
        h('div', { class: 'fun-fact' }, [
          h('strong', { text: 'Real NASA data: ' }),
          `The Context Camera on NASA’s Mars Reconnaissance Orbiter, which circles Mars every ${NASA_ROVER_DATA.mroOrbitMinutes} minutes, took more than 10 years to photograph 99% of Mars. At that pace this region would take about ${Math.round(realSols)} sols. Our orbiter is sped up ${ORBITAL_SCAN.timeScale}×.`,
        ]),
      );
      return;
    }

    this.detail.append(h('div', { class: 'fun-fact' }, [h('strong', { text: 'Orbit map: ' }), reward.hint]));

    // Step 2: send the crew.
    if (status === 'mapped' || status === 'expedition') {
      this.detail.append(h('h4', { class: 'step-title', text: 'Step 2 · Send a crew rover' }));
      const exp = activeExpedition(s, id);
      if (exp) {
        this.detail.append(
          this.liveCard(ICONS.rover, exp.arrived ? 'Crew driving home' : 'Crew driving there', (st, fill, eta, note) => {
            const m = st.missions.find((x) => x.id === exp.id);
            if (!m || m.type !== 'expedition') return;
            fill.style.transform = `scaleX(${m.progress.toFixed(3)})`;
            setText(eta, `≈ ${MissionManager.remainingSols(m).toFixed(1)} sols to go`);
            setText(note, `${ACTIVITY_TEXT[m.activity]} · ${Math.round(Math.min(m.drivenKm, m.legKm * 2)).toLocaleString()} of ${Math.round(m.legKm * 2).toLocaleString()} km`);
          }),
        );
      } else {
        const check = s.expeditionCheck(id);
        const { supplies } = MissionManager.supplies(plan);
        const rewardEls = [
          ...(Object.entries(reward.resources ?? {}) as [ResourceId, number][]).map(([rid, v]) => this.chip(rid, v, true)),
          h('span', { class: 'cost xp', style: { ['--chip-color' as never]: '#ffb03d' } }, [`★ +${reward.xp} XP`]),
          reward.outpost ? h('span', { class: 'cost', style: { ['--chip-color' as never]: RESOURCES[reward.outpost.resource].color } }, ['⛏️ outpost site']) : null,
        ];
        this.detail.append(
          h('ul', { class: 'route-facts' }, [
            h('li', { text: `Route: ${Math.round(plan.routeKm).toLocaleString()} km, climbing ${Math.round(plan.climbM).toLocaleString()} m up and down` }),
            h('li', { text: `There and back: about ${plan.totalSols.toFixed(1)} sols (longer if a dust storm hits)` }),
            h('li', { text: `Crew: ${EXPEDITION.crew} astronauts. They pack food, water and oxygen for the trip plus 72 hours spare.` }),
          ]),
          h('div', { class: 'region-actions' }, [this.button('Send crew rover', ICONS.rover, check, () => gameStore.getState().launchExpedition(id), 'Can’t send the crew')]),
          h('div', { class: 'survey-cost' }, [
            h('span', { class: 'label', text: 'Packs' }),
            ...(Object.entries(supplies) as [ResourceId, number][]).map(([rid, v]) => this.chip(rid, v)),
            h('span', { class: 'cost', style: { ['--chip-color' as never]: '#ffd34d' }, title: 'Battery charge for the rover' }, [`🔋 ${EXPEDITION.energyKwh} kWh`]),
          ]),
          h('div', { class: 'survey-cost reward' }, [h('span', { class: 'label', text: reward.rank ? `🔒 ${rankById(reward.rank).title}` : 'Reward' }), ...rewardEls]),
          ...(check.ok ? [] : [h('p', { class: 'reason', text: check.reason })]),
        );
      }
      const perseveranceSols = (plan.routeKm * 1000) / NASA_ROVER_DATA.perseveranceRecordMPerSol;
      this.detail.append(
        h('div', { class: 'fun-fact' }, [
          h('strong', { text: 'Real NASA data: ' }),
          `NASA’s crew rover design drives about ${NASA_ROVER_DATA.sevSpeedKmh} km/h, and only in daylight here because it runs on solar power. The Perseverance robot drove its record ${NASA_ROVER_DATA.perseveranceRecordMPerSol} m in one sol; at that pace this trip would take it about ${Math.round(solsToYears(perseveranceSols))} years! Our crew rover is sped up ${EXPEDITION.timeScale}×.`,
        ]),
      );
      return;
    }

    // Step 3: explored. Show the report and the outpost.
    const done = [...s.missions].reverse().find((m): m is Expedition => m.type === 'expedition' && m.regionId === id && !!m.reward);
    this.detail.append(h('div', { class: 'fun-fact' }, [h('strong', { text: 'Crew report: ' }), done?.reward?.find ?? reward.find]));
    const site = reward.outpost;
    if (!site) return;
    this.detail.append(h('h4', { class: 'step-title', text: 'Step 3 · Build an outpost' }));
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
            setText(eta, `Ready in ${(o.readySol - st.timeSols).toFixed(1)} sols`);
            setText(note, '🏗️ The kit is being driven there and set up.');
          } else if (o.reserveLeft <= 0) {
            fill.style.transform = 'scaleX(1)';
            setText(eta, 'Empty');
            setText(note, 'This site has been mined out.');
          } else {
            const f = (st.timeSols - o.lastTripSol) / o.tripSols;
            fill.style.transform = `scaleX(${Math.min(1, Math.max(0, f)).toFixed(3)})`;
            setText(eta, `Cargo in ${Math.max(0, o.lastTripSol + o.tripSols - st.timeSols).toFixed(1)} sols`);
            setText(note, `🚚 Next load: ${Math.round(MissionManager.cargoLoad(o))} ${res.unit} ${res.name.toLowerCase()} · ${(o.reserveLeft / 1000).toFixed(1)} t left at the site`);
          }
        }),
      );
    } else {
      const check = s.outpostCheck(id);
      this.detail.append(
        h('p', { class: 'region-desc', text: `${site.label}: about ${site.perSol} ${res.unit} of ${res.name.toLowerCase()} per sol. A cargo rover brings it home, up to ${OUTPOST.cargoPayloadKg} kg per trip (the payload of NASA’s crew rover design).` }),
        h('div', { class: 'region-actions' }, [this.button('Build outpost', ICONS.target, check, () => gameStore.getState().buildOutpost(id), 'Can’t build the outpost')]),
        h('div', { class: 'survey-cost' }, [h('span', { class: 'label', text: 'Needs' }), ...(Object.entries(OUTPOST.cost) as [ResourceId, number][]).map(([rid, v]) => this.chip(rid, v))]),
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
