import { RESOURCES, RESOURCE_IDS, formatAmount, formatRate, type ResourceId } from '../data/resources';
import { rankForXp, nextLevel } from '../data/progression';
import type { EventBus } from '../core/EventBus';
import { SETTLEMENT } from '../data/settlement';
import { formatMarsTime } from '../core/GameClock';
import { ResourceManager } from '../simulation/ResourceManager';
import { gameStore, type GameStore } from '../state/gameStore';
import type { SimSpeed } from '../state/types';
import { h, setText, toggleClass } from './dom';
import { HUD_ICONS, ICONS } from './icons';
import { ProfileDialog } from './ProfileDialog';
import { rankBadgeSvg } from './RankBadge';
import { Auth } from '../persistence/Auth';

/** Speeds the speed button steps through, in order. */
const SPEEDS: SimSpeed[] = [1, 2, 4];

interface ResourceChip {
  root: HTMLElement;
  /** Amount in stock — shown first, in the bright ink. */
  current: HTMLElement;
  /** Storage capacity — shown second, in the accent ink. */
  max: HTMLElement;
}

/**
 * Top bar: settlement identity, level, resources (amount + net rate per sol),
 * energy balance, population and the time controls.
 */
export class HUD {
  readonly el: HTMLElement;
  private chips: Partial<Record<ResourceId, ResourceChip>> = {};
  private energyMax!: HTMLElement;
  private energyCur!: HTMLElement;
  private energyChip!: HTMLElement;
  private popMax!: HTMLElement;
  private popCur!: HTMLElement;
  private popChip!: HTMLElement;
  private solEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private xpFill!: HTMLElement;
  private badge!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private speedBtn!: HTMLButtonElement;

  constructor(parent: HTMLElement, events: EventBus) {
    this.el = h('header', { class: 'topbar', attrs: { role: 'banner' } }, [
      this.brand(parent),
      // Resources on the right edge, with the clock and speed controls tucked under them.
      h('div', { class: 'hud-right' }, [this.resources(), this.time()]),
    ]);
    parent.append(this.el);
    // A soft glow on a resource chip whenever a production cycle delivers to it.
    events.on('production:delivered', ({ delivered }) => {
      for (const id of Object.keys(delivered) as ResourceId[]) {
        const chip = this.chips[id];
        if (!chip) continue;
        chip.root.classList.remove('gain');
        void chip.root.offsetWidth; // restart the animation
        chip.root.classList.add('gain');
      }
    });
    gameStore.subscribe((s) => this.render(s));
    this.render(gameStore.getState());
  }

  private brand(parent: HTMLElement): HTMLElement {
    this.levelEl = h('span', { class: 'level-title' });
    this.xpFill = h('span', { class: 'xp-fill' });
    // The player's name once they're signed in; the base name for guests.
    const name = h('strong', { text: SETTLEMENT.name });
    // The player's profile button: a rank emblem that changes as they rank up.
    this.badge = h('button', { class: 'brand-mark rank-badge', attrs: { type: 'button' }, on: { click: () => ProfileDialog.toggle(parent) } });
    const label = () => {
      const a = Auth.current;
      this.badge.setAttribute('aria-label', `Open your profile${a?.username ? ` (${a.username})` : ''}`);
      this.badge.title = a ? `${a.username ?? 'Commander'} — open profile` : 'Open your commander profile';
      setText(name, a ? (a.username ?? a.email.split('@')[0]) : SETTLEMENT.name);
    };
    Auth.onChange(label);
    Auth.ready.then(label);
    label();
    return h('div', { class: 'brand' }, [
      this.badge,
      h('div', { class: 'brand-text' }, [
        name,
        h('div', { class: 'level' }, [this.levelEl, h('span', { class: 'xp-bar' }, [this.xpFill])]),
      ]),
    ]);
  }

  /** One resource readout: icon, current, then max — like `🜨 320  500`. */
  private chip(icon: string, color: string, title: string, extraClass = ''): { root: HTMLElement; max: HTMLElement; current: HTMLElement } {
    const max = h('span', { class: 'chip-max' });
    const current = h('span', { class: 'chip-cur' });
    const root = h(
      'div',
      { class: `chip ${extraClass}`.trim(), title, attrs: { role: 'listitem' }, style: { ['--chip-color' as never]: color } },
      [h('span', { class: 'chip-icon', html: icon }), current, max],
    );
    return { root, max, current };
  }

  private resources(): HTMLElement {
    const wrap = h('div', { class: 'resources', attrs: { role: 'list', 'aria-label': 'Resources' } });
    for (const id of RESOURCE_IDS) {
      const def = RESOURCES[id];
      if (!def.hud) continue;
      const c = this.chip(HUD_ICONS[id], def.color, `${def.name}: ${def.description}`);
      this.chips[id] = c;
      wrap.append(c.root);
    }
    const energy = this.chip(HUD_ICONS.energy, '#ffd34d', '', 'energy');
    this.energyChip = energy.root;
    this.energyMax = energy.max;
    this.energyCur = energy.current;
    const pop = this.chip(HUD_ICONS.crew, '#f4a6ff', '');
    this.popChip = pop.root;
    this.popMax = pop.max;
    this.popCur = pop.current;
    wrap.append(this.energyChip, this.popChip);
    return wrap;
  }

  private time(): HTMLElement {
    this.solEl = h('span', { class: 'sol' });
    this.clockEl = h('span', { class: 'clock' });
    const group = h('div', { class: 'speed-group', attrs: { role: 'group', 'aria-label': 'Simulation speed' } });
    this.pauseBtn = h('button', {
      class: 'speed-btn',
      html: ICONS.pause,
      title: 'Pause / resume (Space)',
      attrs: { type: 'button', 'aria-label': 'Pause / resume (Space)' },
      on: { click: () => gameStore.getState().togglePause() },
    });
    // One button that steps through the speeds: 1× → 2× → 4× → 1×.
    this.speedBtn = h('button', {
      class: 'speed-btn speed-cycle',
      title: 'Change speed: 1× → 2× → 4× (keys 1, 2, 3)',
      attrs: { type: 'button' },
      on: {
        click: () => {
          const st = gameStore.getState();
          const i = SPEEDS.indexOf(st.speed);
          st.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
        },
      },
    });
    group.append(this.pauseBtn, this.speedBtn);
    return h('div', { class: 'timebox' }, [h('div', { class: 'time-readout', title: 'A sol is one Martian day — 24 hours and 39 minutes long.' }, [this.solEl, this.clockEl]), group]);
  }

  private render(s: GameStore): void {
    for (const id of RESOURCE_IDS) {
      const c = this.chips[id];
      if (!c) continue;
      const amt = s.resources[id];
      const rate = s.rates[id];
      const cap = s.storage[id];
      setText(c.max, formatAmount(cap));
      setText(c.current, formatAmount(amt));
      toggleClass(c.current, 'up', rate > 0.05);
      toggleClass(c.current, 'down', rate < -0.05);
      const def = RESOURCES[id];
      const left = ResourceManager.solsRemaining(amt, rate);
      toggleClass(c.root, 'critical', def.vital && amt <= 0.01 && rate < 0);
      toggleClass(c.root, 'low', def.vital && amt > 0.01 && left < def.warnSols);
      toggleClass(c.root, 'full', cap > 0 && amt >= cap - 0.5);
      const title = `${def.name}: ${def.description}
In stock: ${formatAmount(amt)} ${def.unit} (${formatRate(rate)})
Max storage: ${formatAmount(cap)} ${def.unit}`;
      if (c.root.title !== title) c.root.title = title;
    }
    const p = s.power;
    const day = p.sun > 0;
    setText(this.energyMax, `${p.generationKw.toFixed(0)} kW`);
    setText(this.energyCur, `${p.demandKw.toFixed(0)} kW`);
    const charge = p.batteryCapacityKwh > 0 ? p.batteryKwh / p.batteryCapacityKwh : 0;
    toggleClass(this.energyChip, 'critical', p.unpowered > 0);
    toggleClass(this.energyChip, 'low', p.unpowered === 0 && (charge < 0.2 || p.plannedDemandKw > p.avgGenerationKw));
    toggleClass(this.energyChip, 'charging', p.generationKw > p.suppliedKw + 0.05 && charge < 0.999);
    const tip = `Electricity (${day ? 'day' : 'night'})
Current — buildings asking for: ${p.demandKw.toFixed(1)} kW
Max — solar panels now: ${p.generationKw.toFixed(1)} kW
Solar averaged over day and night: about ${p.avgGenerationKw.toFixed(0)} kW
Buildings using: ${p.suppliedKw.toFixed(1)} kW${p.unpowered ? ` — ${p.unpowered} waiting for power` : ''}
Batteries (bar): ${p.batteryKwh.toFixed(0)} / ${p.batteryCapacityKwh.toFixed(0)} kWh
Spare for new buildings: ${Math.max(0, p.avgGenerationKw - p.plannedDemandKw).toFixed(1)} kW`;
    if (this.energyChip.title !== tip) this.energyChip.title = tip;

    setText(this.popMax, String(s.colony.housing));
    setText(this.popCur, String(s.colony.colonists));
    const popTip = `Crew
Current — colonists living in the base: ${s.colony.colonists}
Max — beds in habitats: ${s.colony.housing}`;
    if (this.popChip.title !== popTip) this.popChip.title = popTip;
    toggleClass(this.popChip, 'low', s.colony.housing < s.colony.colonists);

    const t = formatMarsTime(s.timeSols);
    setText(this.solEl, `Sol ${t.sol}`);
    setText(this.clockEl, t.clock);
    toggleClass(this.pauseBtn, 'active', s.paused);
    const icon = s.paused ? 'play' : 'pause';
    if (this.pauseBtn.dataset.icon !== icon) {
      this.pauseBtn.innerHTML = s.paused ? ICONS.play : ICONS.pause;
      this.pauseBtn.dataset.icon = icon;
    }
    setText(this.speedBtn, `${s.speed}×`);
    this.speedBtn.setAttribute('aria-label', `Speed ${s.speed}×, click for ${SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length]}×`);
    toggleClass(this.speedBtn, 'active', !s.paused);

    const rank = rankForXp(s.progression.xp);
    const next = nextLevel(rank.level);
    if (this.badge.dataset.rank !== String(rank.level)) {
      const prev = this.badge.dataset.rank;
      const promoted = prev !== undefined && rank.level > Number(prev);
      this.badge.dataset.rank = String(rank.level);
      this.badge.className = `brand-mark rank-badge rank-${rank.level}`;
      this.badge.innerHTML = rankBadgeSvg(rank);
      if (promoted) {
        void this.badge.offsetWidth; // restart the animation
        this.badge.classList.add('promoted');
      }
    }
    setText(this.levelEl, `${rank.icon} ${rank.title}`);
    const frac = next ? (s.progression.xp - rank.xp) / (next.xp - rank.xp) : 1;
    this.xpFill.style.transform = `scaleX(${Math.min(1, frac).toFixed(3)})`;
    this.levelEl.parentElement!.title = next
      ? `${s.progression.xp} XP — ${next.xp - s.progression.xp} XP to ${next.title}`
      : `${s.progression.xp} XP — highest rank!`;
  }
}
