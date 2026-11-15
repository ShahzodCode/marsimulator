import { CARGO, PIPE_DESIGN, PIPE_FAULTS, PIPELINE, pipelineFlowCap, thermalGrowthMPerKm } from '../data/logistics';
import { RESOURCES, RESOURCE_IDS, formatAmount, type ResourceId } from '../data/resources';
import { describeCost, Logistics } from '../simulation/Logistics';
import { gameStore } from '../state/gameStore';
import type { BuildingInstance, Pipeline } from '../state/types';
import { clear, h, setText, toggleClass } from './dom';
import { RESOURCE_ICONS } from './icons';
import { t, tn } from '../i18n';

/** A block inside the building panel that refreshes with the store. */
export interface PanelSection {
  el: HTMLElement;
  update(b: BuildingInstance): void;
}

function alertFail(title: string, res: { ok: boolean; reason?: string }): void {
  if (!res.ok) gameStore.getState().pushAlert({ key: 'logistics-error', level: 'warning', title, message: res.reason ?? '' });
}

/** Up to three of the biggest flows, like "⇢ 12 water/sol". */
function flowText(p: Pipeline, baseId: string): string {
  const parts = (Object.entries(p.flow) as [ResourceId, number][])
    .map(([id, v]) => [id, p.fromBaseId === baseId ? v : -v] as const)
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([id, v]) => `${v > 0 ? '→' : '←'} ${formatAmount(Math.abs(v))} ${RESOURCES[id].name.toLowerCase()}`);
  return parts.length ? t('{list} per sol', { list: parts.join(' · ') }) : t('Evened out: nothing needs to flow.');
}

/** Pump Station: this base's pipelines, and the button that starts the pipeline tool. */
export function pipelineSection(): PanelSection {
  const list = h('div', { class: 'link-list' });
  let key = '';
  const rows = new Map<string, { status: HTMLElement; detail: HTMLElement; fill: HTMLElement; faults: HTMLElement }>();
  const el = h('div', { class: 'logistics' }, [
    h('h4', { class: 'step-title', text: `🛢️ ${t('Pipelines from this base')}` }),
    list,
    h(
      'button',
      {
        class: 'btn primary',
        attrs: { type: 'button' },
        title: t('Then press on a base with a Pump Station and drag onto another base (P)'),
        on: { click: () => alertFail(t('Can’t lay a pipeline yet'), gameStore.getState().startPipelineMode()) },
      },
      [`🛢️ ${t('Lay a pipeline (P)')}`],
    ),
    h('p', {
      class: 'muted',
      text: t(
        'Like a road: drag from one base to another on the map. Costs a little more than a building, plus more for every 100 km (up to {max} km). Both ends need a Pump Station that is switched on and powered. Longer pipes carry less: past {ref} km the flow falls as 1/√length, like real pipes.',
        { max: PIPELINE.maxKm.toLocaleString(), ref: PIPELINE.flowRefKm },
      ),
    }),
    h('details', { class: 'muted' }, [
      h('summary', { text: `🔩 ${t('How the pipe is built to last')}` }),
      h('p', {
        text: t(
          'A {material} pressure line inside aerogel insulation and an armoured jacket that keeps out UV, dust and tiny meteorites. It is tested to {burst}× its working pressure — NASA asks {small}× for thin lines and {large}× for wide ones, and we chose the stricter number so it lasts for centuries. Each km grows about {growth} m between the {min} °C night and the +{max} °C afternoon, so — like the Trans-Alaska Pipeline — it zigzags and rests on sliding shoes, with bellows joints every few spans. A heat-trace wire stops water freezing inside.',
          {
            material: t(PIPE_DESIGN.material),
            burst: PIPE_DESIGN.burstFactor,
            small: PIPE_DESIGN.nasaFactorSmallLines,
            large: PIPE_DESIGN.nasaFactorLargeLines,
            growth: thermalGrowthMPerKm().toFixed(1),
            min: PIPE_DESIGN.groundMinC,
            max: PIPE_DESIGN.groundMaxC,
          },
        ),
      }),
    ]),
  ]);

  const build = (pipes: Pipeline[], baseId: string) => {
    clear(list);
    rows.clear();
    if (!pipes.length) {
      list.append(h('p', { class: 'muted', text: t('No pipelines yet.') }));
      return;
    }
    const s = gameStore.getState();
    for (const p of pipes) {
      const other = Logistics.baseById(s, p.fromBaseId === baseId ? p.toBaseId : p.fromBaseId);
      const status = h('span', { class: 'link-status' });
      const detail = h('span', { class: 'muted link-detail' });
      const fill = h('span', { class: 'progress-fill' });
      const faults = h('div', { class: 'link-faults' });
      let armed = false;
      const remove = h(
        'button',
        {
          class: 'btn danger small',
          attrs: { type: 'button' },
          title: t('Take the pipeline up and get back half of what it cost'),
          on: {
            click: () => {
              if (!armed) {
                armed = true;
                setText(remove, t('Sure?'));
                window.setTimeout(() => {
                  armed = false;
                  setText(remove, t('Remove'));
                }, 4000);
                return;
              }
              alertFail(t('Can’t remove it'), gameStore.getState().removePipeline(p.id));
            },
          },
        },
        [t('Remove')],
      );
      list.append(
        h('div', { class: 'link-row' }, [
          h('div', { class: 'link-head' }, [h('strong', { text: `⇄ ${other?.name ?? t('another base')}` }), h('span', { class: 'muted', text: t('{n} km', { n: Math.round(p.km).toLocaleString() }) }), remove]),
          status,
          h('div', { class: 'progress' }, [fill]),
          detail,
          faults,
        ]),
      );
      rows.set(p.id, { status, detail, fill, faults });
    }
  };

  return {
    el,
    update() {
      const s = gameStore.getState();
      const pipes = s.pipelines.filter((p) => p.fromBaseId === s.base.id || p.toBaseId === s.base.id);
      const k = `${s.base.id}|${pipes.map((p) => p.id).join(',')}`;
      if (k !== key) {
        key = k;
        build(pipes, s.base.id);
      }
      for (const p of pipes) {
        const r = rows.get(p.id);
        if (!r) continue;
        const otherId = p.fromBaseId === s.base.id ? p.toBaseId : p.fromBaseId;
        const other = Logistics.baseById(s, otherId);
        const building = p.progress < 1;
        setText(
          r.status,
          building
            ? `🏗️ ${t('Laying pipe…')} ${Math.floor(p.progress * 100)}%`
            : p.working
              ? `✔ ${t('Pumping')}`
              : !Logistics.hasPump(s.buildings, true)
                ? `✖ ${t('This base’s Pump Station is off, unpowered or unfinished')}`
                : `✖ ${t('{base} needs a working Pump Station', { base: other?.name ?? t('The other base') })}`,
        );
        toggleClass(r.status, 'bad', !building && !p.working);
        r.fill.parentElement!.style.display = building ? '' : 'none';
        r.fill.style.transform = `scaleX(${p.progress.toFixed(3)})`;
        const cap = Logistics.flowCap(p);
        const capText = p.faults.length
          ? t('Carries up to {n} of each resource per sol ({straight} when straight).', { n: formatAmount(cap), straight: formatAmount(pipelineFlowCap(p.km)) })
          : t('Carries up to {n} of each resource per sol.', { n: formatAmount(cap) });
        setText(r.detail, building ? t('Ready in about {n} sols.', { n: ((1 - p.progress) * p.buildSols).toFixed(1) }) : p.working ? `${flowText(p, s.base.id)} ${capText}` : capText);
        const fk = p.faults.map((f) => `${f.id}:${Math.floor(f.repair * 20)}`).join(',');
        if (r.faults.dataset.key !== fk) {
          r.faults.dataset.key = fk;
          clear(r.faults);
          for (const f of p.faults) {
            const fromHere = p.fromBaseId === s.base.id ? f.at : 1 - f.at;
            r.faults.append(
              h('div', { class: 'link-fault bad', title: PIPE_FAULTS[f.kind].why }, [
                h('span', {
                  text: `⚠️ ${t('{fault} {km} km out — {pct}% pinched', { fault: PIPE_FAULTS[f.kind].name, km: Math.round(fromHere * p.km).toLocaleString(), pct: Math.round(f.pinch * 100) })}`,
                }),
                h('span', { class: 'muted', text: ` · ${f.repair < 0.05 ? t('robots on the way') : t('robots repairing {pct}%', { pct: Math.floor(f.repair * 100) })}` }),
              ]),
            );
          }
        }
      }
    },
  };
}

/** Cargo Hauler Garage: where the haulers go, what they load, and trips on the road. */
export function garageSection(garageId: string): PanelSection {
  const load: Partial<Record<ResourceId, number>> = {};
  const dest = h('strong');
  const destNote = h('span', { class: 'muted' });
  const free = h('strong');
  const total = h('span', { class: 'cargo-total' });
  const trips = h('div', { class: 'link-list' });
  const send = h('button', { class: 'btn primary', attrs: { type: 'button' } }, [`🚚 ${t('Send haulers')}`]);
  const autoBtn = h('button', { class: 'btn', attrs: { type: 'button' } });
  const autoPlan = h('span');
  const autoHold = h('span', { class: 'cargo-auto-hold' });
  const autoBox = h('div', { class: 'cargo-auto' }, [
    h('strong', { text: `🔁 ${t('Automatic')}` }),
    autoPlan,
    h('span', { class: 'muted', text: t('Sends this load whenever haulers are parked. It stops by itself if the base would keep less than it ships, and starts again when there is enough.') }),
    autoHold,
  ]);
  let autoOn = false;
  const sliders = new Map<ResourceId, { input: HTMLInputElement; value: HTMLElement }>();

  const sliderRows = RESOURCE_IDS.map((id) => {
    const input = h('input', {
      class: 'cargo-slider',
      attrs: { type: 'range', min: '0', max: '0', step: '10', value: '0', 'aria-label': t('{resource} to load', { resource: RESOURCES[id].name }) },
      style: { ['--chip-color' as never]: RESOURCES[id].color },
    }) as HTMLInputElement;
    const value = h('span', { class: 'cargo-value' });
    input.addEventListener('input', () => {
      load[id] = Number(input.value);
      refreshTotal();
    });
    sliders.set(id, { input, value });
    return h('label', { class: 'cargo-row', style: { ['--chip-color' as never]: RESOURCES[id].color } }, [
      h('span', { class: 'cost-icon', html: RESOURCE_ICONS[id] }),
      h('span', { class: 'inv-name', text: RESOURCES[id].name }),
      input,
      value,
    ]);
  });

  const loaded = () => RESOURCE_IDS.reduce((a, id) => a + (load[id] ?? 0), 0);
  const refreshTotal = () => {
    const s = gameStore.getState();
    const n = loaded();
    const haulers = Math.ceil(n / CARGO.payload);
    const cap = Logistics.haulersFree(s.shipments, garageId) * CARGO.payload;
    setText(total, n
        ? `${t('Load: {n} / {cap}', { n: formatAmount(n), cap: formatAmount(cap) })} · ${tn(haulers, '{n} hauler', '{n} haulers')}`
        : t('Move the sliders to load the haulers.'));
    toggleClass(total, 'bad', n > cap);
    for (const [id, r] of sliders) setText(r.value, formatAmount(load[id] ?? 0));
  };

  send.addEventListener('click', () => {
    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const id of RESOURCE_IDS) if ((load[id] ?? 0) > 0) cargo[id] = load[id];
    const res = gameStore.getState().sendCargo(garageId, cargo);
    alertFail(t('Can’t send the haulers'), res);
    if (res.ok) {
      for (const id of RESOURCE_IDS) load[id] = 0;
      for (const r of sliders.values()) r.input.value = '0';
      refreshTotal();
    }
  });

  autoBtn.addEventListener('click', () => {
    const store = gameStore.getState();
    if (autoOn) {
      alertFail(t('Can’t change the garage'), store.setGarageAuto(garageId, null));
      return;
    }
    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const id of RESOURCE_IDS) if ((load[id] ?? 0) > 0) cargo[id] = load[id];
    alertFail(t('Can’t switch to automatic'), store.setGarageAuto(garageId, cargo));
  });

  const clearBtn = h(
    'button',
    { class: 'btn small', attrs: { type: 'button' }, title: t('Forget the destination'), on: { click: () => gameStore.getState().setGarageTarget(garageId, null) } },
    [t('Clear')],
  );

  const el = h('div', { class: 'logistics' }, [
    h('h4', { class: 'step-title', text: `🚚 ${t('Cargo haulers')}` }),
    h('div', { class: 'link-head' }, [h('span', { text: t('Destination:') }), dest, clearBtn]),
    destNote,
    h('div', { class: 'link-head' }, [h('span', { text: t('Parked here:') }), free]),
    h('div', { class: 'cargo-sliders' }, sliderRows),
    total,
    h('div', { class: 'cargo-actions' }, [send, autoBtn]),
    autoBox,
    h('h4', { class: 'step-title', text: t('On the road') }),
    trips,
    h('p', {
      class: 'muted',
      text: t(
        'Each hauler carries up to {payload}. They drive at {speed} km/h like NASA’s crew rover, only in daylight, and come back after unloading. Anything that doesn’t fit at the other base rides back home.',
        { payload: CARGO.payload.toLocaleString(), speed: CARGO.speedKmh },
      ),
    }),
  ]);

  let tripKey = '';
  const tripRows = new Map<string, HTMLElement>();
  return {
    el,
    update(b) {
      const s = gameStore.getState();
      const to = b.target ? s.otherBases.find((x) => x.id === b.target) : undefined;
      setText(dest, to ? to.name : t('none yet'));
      clearBtn.style.display = to ? '' : 'none';
      setText(
        destNote,
        !b.isOperational
          ? t('The haulers move in when the garage is finished.')
          : to
            ? t('Drag the orange arrow onto another base to change it.')
            : s.otherBases.length
              ? t('Drag the orange arrow on the garage onto another base.')
              : t('Found a second base first (Exploration panel).'),
      );
      const parked = Logistics.haulersFree(s.shipments, garageId);
      setText(free, `${parked} / ${tn(CARGO.haulersPerGarage, '{n} hauler', '{n} haulers')}`);
      // Each slider goes up to what is in storage and what the parked haulers can carry.
      const cap = parked * CARGO.payload;
      for (const [id, r] of sliders) {
        const max = Math.max(0, Math.floor(Math.min(s.resources[id], cap) / 10) * 10);
        if (r.input.max !== String(max)) r.input.max = String(max);
        if ((load[id] ?? 0) > max) {
          load[id] = max;
          r.input.value = String(max);
        }
        r.input.disabled = max <= 0;
      }
      refreshTotal();
      const ready = b.isOperational && !!to && parked > 0 && loaded() > 0 && loaded() <= cap;
      send.toggleAttribute('disabled', !ready);

      autoOn = !!b.autoCargo;
      setText(autoBtn, autoOn ? `⏹ ${t('Stop automatic')}` : `🔁 ${t('Send this load automatically')}`);
      autoBtn.title = autoOn ? t('Back to sending by hand') : t('Repeat the load on the sliders every time haulers are parked');
      autoBtn.toggleAttribute('disabled', !autoOn && !(loaded() > 0 && loaded() <= CARGO.haulersPerGarage * CARGO.payload));
      autoBox.style.display = autoOn ? '' : 'none';
      if (b.autoCargo) setText(autoPlan, t('Load: {cargo}', { cargo: describeCost(b.autoCargo) }));
      setText(autoHold, b.autoHold ?? '');
      autoHold.style.display = b.autoHold ? '' : 'none';

      const mine = s.shipments.filter((x) => x.garageId === garageId);
      const k = mine.map((x) => x.id).join(',');
      if (k !== tripKey) {
        tripKey = k;
        clear(trips);
        tripRows.clear();
        if (!mine.length) trips.append(h('p', { class: 'muted', text: t('All haulers are parked.') }));
        for (const x of mine) {
          const eta = h('span', { class: 'muted' });
          const name = s.otherBases.find((o) => o.id === x.toBaseId)?.name ?? t('another base');
          trips.append(h('div', { class: 'link-row' }, [h('strong', { text: `🚚 ×${x.haulers} → ${name}` }), h('span', { class: 'muted', text: describeCost(x.cargo) }), eta]));
          tripRows.set(x.id, eta);
        }
      }
      for (const x of mine) {
        const eta = tripRows.get(x.id);
        if (!eta) continue;
        const what = x.activity === 'unloading' ? t('Unloading') : x.activity === 'night' ? t('Parked for the night') : x.delivered ? t('Driving home') : t('Driving there');
        setText(eta, `${what} · ${t('back in ~{n} sols', { n: Logistics.remainingSols(x).toFixed(1) })}`);
      }
    },
  };
}
