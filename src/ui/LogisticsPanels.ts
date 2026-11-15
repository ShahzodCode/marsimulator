import { CARGO, PIPE_DESIGN, PIPE_FAULTS, PIPELINE, pipelineFlowCap, thermalGrowthMPerKm } from '../data/logistics';
import { RESOURCES, RESOURCE_IDS, formatAmount, type ResourceId } from '../data/resources';
import { describeCost, Logistics } from '../simulation/Logistics';
import { gameStore } from '../state/gameStore';
import type { BuildingInstance, Pipeline } from '../state/types';
import { clear, h, setText, toggleClass } from './dom';
import { RESOURCE_ICONS } from './icons';

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
  return parts.length ? `${parts.join(' · ')} per sol` : 'Evened out: nothing needs to flow.';
}

/** Pump Station: this base's pipelines, and the button that starts the pipeline tool. */
export function pipelineSection(): PanelSection {
  const list = h('div', { class: 'link-list' });
  let key = '';
  const rows = new Map<string, { status: HTMLElement; detail: HTMLElement; fill: HTMLElement; faults: HTMLElement }>();
  const el = h('div', { class: 'logistics' }, [
    h('h4', { class: 'step-title', text: '🛢️ Pipelines from this base' }),
    list,
    h(
      'button',
      {
        class: 'btn primary',
        attrs: { type: 'button' },
        title: 'Then press on a base with a Pump Station and drag onto another base (P)',
        on: { click: () => alertFail('Can’t lay a pipeline yet', gameStore.getState().startPipelineMode()) },
      },
      ['🛢️ Lay a pipeline (P)'],
    ),
    h('p', {
      class: 'muted',
      text: `Like a road: drag from one base to another on the map. Costs a little more than a building, plus more for every 100 km (up to ${PIPELINE.maxKm.toLocaleString()} km). Both ends need a Pump Station that is switched on and powered. Longer pipes carry less: past ${PIPELINE.flowRefKm} km the flow falls as 1/√length, like real pipes.`,
    }),
    h('details', { class: 'muted' }, [
      h('summary', { text: '🔩 How the pipe is built to last' }),
      h('p', {
        text: `A ${PIPE_DESIGN.material} pressure line inside aerogel insulation and an armoured jacket that keeps out UV, dust and tiny meteorites. It is tested to ${PIPE_DESIGN.burstFactor}× its working pressure — NASA asks ${PIPE_DESIGN.nasaFactorSmallLines}× for thin lines and ${PIPE_DESIGN.nasaFactorLargeLines}× for wide ones, and we chose the stricter number so it lasts for centuries. Each km grows about ${thermalGrowthMPerKm().toFixed(1)} m between the ${PIPE_DESIGN.groundMinC} °C night and the +${PIPE_DESIGN.groundMaxC} °C afternoon, so — like the Trans-Alaska Pipeline — it zigzags and rests on sliding shoes, with bellows joints every few spans. A heat-trace wire stops water freezing inside.`,
      }),
    ]),
  ]);

  const build = (pipes: Pipeline[], baseId: string) => {
    clear(list);
    rows.clear();
    if (!pipes.length) {
      list.append(h('p', { class: 'muted', text: 'No pipelines yet.' }));
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
          title: 'Take the pipeline up and get back half of what it cost',
          on: {
            click: () => {
              if (!armed) {
                armed = true;
                setText(remove, 'Sure?');
                window.setTimeout(() => {
                  armed = false;
                  setText(remove, 'Remove');
                }, 4000);
                return;
              }
              alertFail('Can’t remove it', gameStore.getState().removePipeline(p.id));
            },
          },
        },
        ['Remove'],
      );
      list.append(
        h('div', { class: 'link-row' }, [
          h('div', { class: 'link-head' }, [h('strong', { text: `⇄ ${other?.name ?? 'another base'}` }), h('span', { class: 'muted', text: `${Math.round(p.km).toLocaleString()} km` }), remove]),
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
            ? `🏗️ Laying pipe… ${Math.floor(p.progress * 100)}%`
            : p.working
              ? '✔ Pumping'
              : !Logistics.hasPump(s.buildings, true)
                ? '✖ This base’s Pump Station is off, unpowered or unfinished'
                : `✖ ${other?.name ?? 'The other base'} needs a working Pump Station`,
        );
        toggleClass(r.status, 'bad', !building && !p.working);
        r.fill.parentElement!.style.display = building ? '' : 'none';
        r.fill.style.transform = `scaleX(${p.progress.toFixed(3)})`;
        const cap = Logistics.flowCap(p);
        const capText = `Carries up to ${formatAmount(cap)} of each resource per sol${p.faults.length ? ` (${formatAmount(pipelineFlowCap(p.km))} when straight)` : ''}.`;
        setText(r.detail, building ? `Ready in about ${((1 - p.progress) * p.buildSols).toFixed(1)} sols.` : p.working ? `${flowText(p, s.base.id)} ${capText}` : capText);
        const fk = p.faults.map((f) => `${f.id}:${Math.floor(f.repair * 20)}`).join(',');
        if (r.faults.dataset.key !== fk) {
          r.faults.dataset.key = fk;
          clear(r.faults);
          for (const f of p.faults) {
            const fromHere = p.fromBaseId === s.base.id ? f.at : 1 - f.at;
            r.faults.append(
              h('div', { class: 'link-fault bad', title: PIPE_FAULTS[f.kind].why }, [
                h('span', { text: `⚠️ ${PIPE_FAULTS[f.kind].name} ${Math.round(fromHere * p.km).toLocaleString()} km out — ${Math.round(f.pinch * 100)}% pinched` }),
                h('span', { class: 'muted', text: ` · robots ${f.repair < 0.05 ? 'on the way' : `repairing ${Math.floor(f.repair * 100)}%`}` }),
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
  const send = h('button', { class: 'btn primary', attrs: { type: 'button' } }, ['🚚 Send haulers']);
  const autoBtn = h('button', { class: 'btn', attrs: { type: 'button' } });
  const autoPlan = h('span');
  const autoHold = h('span', { class: 'cargo-auto-hold' });
  const autoBox = h('div', { class: 'cargo-auto' }, [
    h('strong', { text: '🔁 Automatic' }),
    autoPlan,
    h('span', { class: 'muted', text: 'Sends this load whenever haulers are parked. It stops by itself if the base would keep less than it ships, and starts again when there is enough.' }),
    autoHold,
  ]);
  let autoOn = false;
  const sliders = new Map<ResourceId, { input: HTMLInputElement; value: HTMLElement }>();

  const sliderRows = RESOURCE_IDS.map((id) => {
    const input = h('input', {
      class: 'cargo-slider',
      attrs: { type: 'range', min: '0', max: '0', step: '10', value: '0', 'aria-label': `${RESOURCES[id].name} to load` },
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
    setText(total, n ? `Load: ${formatAmount(n)} / ${formatAmount(cap)} · ${haulers} hauler${haulers === 1 ? '' : 's'}` : 'Move the sliders to load the haulers.');
    toggleClass(total, 'bad', n > cap);
    for (const [id, r] of sliders) setText(r.value, formatAmount(load[id] ?? 0));
  };

  send.addEventListener('click', () => {
    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const id of RESOURCE_IDS) if ((load[id] ?? 0) > 0) cargo[id] = load[id];
    const res = gameStore.getState().sendCargo(garageId, cargo);
    alertFail('Can’t send the haulers', res);
    if (res.ok) {
      for (const id of RESOURCE_IDS) load[id] = 0;
      for (const r of sliders.values()) r.input.value = '0';
      refreshTotal();
    }
  });

  autoBtn.addEventListener('click', () => {
    const store = gameStore.getState();
    if (autoOn) {
      alertFail('Can’t change the garage', store.setGarageAuto(garageId, null));
      return;
    }
    const cargo: Partial<Record<ResourceId, number>> = {};
    for (const id of RESOURCE_IDS) if ((load[id] ?? 0) > 0) cargo[id] = load[id];
    alertFail('Can’t switch to automatic', store.setGarageAuto(garageId, cargo));
  });

  const clearBtn = h(
    'button',
    { class: 'btn small', attrs: { type: 'button' }, title: 'Forget the destination', on: { click: () => gameStore.getState().setGarageTarget(garageId, null) } },
    ['Clear'],
  );

  const el = h('div', { class: 'logistics' }, [
    h('h4', { class: 'step-title', text: '🚚 Cargo haulers' }),
    h('div', { class: 'link-head' }, [h('span', { text: 'Destination:' }), dest, clearBtn]),
    destNote,
    h('div', { class: 'link-head' }, [h('span', { text: 'Parked here:' }), free]),
    h('div', { class: 'cargo-sliders' }, sliderRows),
    total,
    h('div', { class: 'cargo-actions' }, [send, autoBtn]),
    autoBox,
    h('h4', { class: 'step-title', text: 'On the road' }),
    trips,
    h('p', {
      class: 'muted',
      text: `Each hauler carries up to ${CARGO.payload.toLocaleString()}. They drive at ${CARGO.speedKmh} km/h like NASA’s crew rover, only in daylight, and come back after unloading. Anything that doesn’t fit at the other base rides back home.`,
    }),
  ]);

  let tripKey = '';
  const tripRows = new Map<string, HTMLElement>();
  return {
    el,
    update(b) {
      const s = gameStore.getState();
      const to = b.target ? s.otherBases.find((x) => x.id === b.target) : undefined;
      setText(dest, to ? to.name : 'none yet');
      clearBtn.style.display = to ? '' : 'none';
      setText(
        destNote,
        !b.isOperational
          ? 'The haulers move in when the garage is finished.'
          : to
            ? `Drag the orange arrow onto another base to change it.`
            : s.otherBases.length
              ? 'Drag the orange arrow on the garage onto another base.'
              : 'Found a second base first (Exploration panel).',
      );
      const parked = Logistics.haulersFree(s.shipments, garageId);
      setText(free, `${parked} / ${CARGO.haulersPerGarage} haulers`);
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
      setText(autoBtn, autoOn ? '⏹ Stop automatic' : '🔁 Send this load automatically');
      autoBtn.title = autoOn ? 'Back to sending by hand' : 'Repeat the load on the sliders every time haulers are parked';
      autoBtn.toggleAttribute('disabled', !autoOn && !(loaded() > 0 && loaded() <= CARGO.haulersPerGarage * CARGO.payload));
      autoBox.style.display = autoOn ? '' : 'none';
      if (b.autoCargo) setText(autoPlan, `Load: ${describeCost(b.autoCargo)}`);
      setText(autoHold, b.autoHold ?? '');
      autoHold.style.display = b.autoHold ? '' : 'none';

      const mine = s.shipments.filter((x) => x.garageId === garageId);
      const k = mine.map((x) => x.id).join(',');
      if (k !== tripKey) {
        tripKey = k;
        clear(trips);
        tripRows.clear();
        if (!mine.length) trips.append(h('p', { class: 'muted', text: 'All haulers are parked.' }));
        for (const x of mine) {
          const t = h('span', { class: 'muted' });
          const name = s.otherBases.find((o) => o.id === x.toBaseId)?.name ?? 'another base';
          trips.append(h('div', { class: 'link-row' }, [h('strong', { text: `🚚 ×${x.haulers} → ${name}` }), h('span', { class: 'muted', text: describeCost(x.cargo) }), t]));
          tripRows.set(x.id, t);
        }
      }
      for (const x of mine) {
        const t = tripRows.get(x.id);
        if (!t) continue;
        const what = x.activity === 'unloading' ? 'Unloading' : x.activity === 'night' ? 'Parked for the night' : x.delivered ? 'Driving home' : 'Driving there';
        setText(t, `${what} · back in ~${Logistics.remainingSols(x).toFixed(1)} sols`);
      }
    },
  };
}
