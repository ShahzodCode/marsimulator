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
import { t } from '../i18n';

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
  private badge!: HTMLElement;
  private pauseBtn!: HTMLButtonElement;
  private speedBtn!: HTMLButtonElement;

  constructor(parent: HTMLElement, events: EventBus) {
    this.el = h('header', { class: 'topbar', attrs: { role: 'banner' } }, [
      this.brand(parent),
      // Resources on the right edge, with the clock and speed controls tucked under them.
      h('div', { class: 'hud-right' }, [this.resources(), this.time(events)]),
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
    // The rank emblem changes as the player ranks up.
    this.badge = h('span', { class: 'brand-mark rank-badge', attrs: { 'aria-hidden': 'true' } });
    // The whole box (emblem, name, rank and progress) opens the profile and leaderboard.
    const box = h('button', { class: 'brand', attrs: { type: 'button' }, on: { click: () => ProfileDialog.toggle(parent) } }, [
      this.badge,
      h('span', { class: 'brand-text' }, [
        name,
        h('span', { class: 'level' }, [this.levelEl, h('span', { class: 'xp-bar' }, [this.xpFill])]),
      ]),
    ]);
    const label = () => {
      const a = Auth.current;
      box.setAttribute('aria-label', a?.username ? t('Open your profile ({name})', { name: a.username }) : t('Open your profile'));
      box.title = a ? t('{name} — open profile', { name: a.username ?? t('Commander') }) : t('Open your commander profile');
      setText(name, a ? (a.username ?? a.email.split('@')[0]) : SETTLEMENT.name);
    };
    Auth.onChange(label);
    Auth.ready.then(label);
    label();
    return box;
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
    const wrap = h('div', { class: 'resources', attrs: { role: 'list', 'aria-label': t('Resources') } });
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

  private time(events: EventBus): HTMLElement {
    this.solEl = h('span', { class: 'sol' });
    this.clockEl = h('span', { class: 'clock' });
    const group = h('div', { class: 'speed-group', attrs: { role: 'group', 'aria-label': t('Simulation speed') } });
    this.pauseBtn = h('button', {
      class: 'speed-btn',
      html: ICONS.pause,
      title: t('Pause / resume (Space)'),
      attrs: { type: 'button', 'aria-label': t('Pause / resume (Space)') },
      on: { click: () => gameStore.getState().togglePause() },
    });
    // One button that steps through the speeds: 1× → 2× → 4× → 1×.
    this.speedBtn = h('button', {
      class: 'speed-btn speed-cycle',
      title: t('Change speed: 1× → 2× → 4× (keys 1, 2, 3)'),
      attrs: { type: 'button' },
      on: {
        click: () => {
          const st = gameStore.getState();
          const i = SPEEDS.indexOf(st.speed);
          st.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
        },
      },
    });
    const menuBtn = h('button', {
      class: 'speed-btn menu-btn',
      html: ICONS.menu,
      title: t('Game menu (Esc)'),
      attrs: { type: 'button', 'aria-label': t('Game menu (Esc)') },
      on: { click: () => events.emit('menu:open') },
    });
    group.append(this.pauseBtn, this.speedBtn, menuBtn);
    return h('div', { class: 'timebox' }, [h('div', { class: 'time-readout', title: t('A sol is one Martian day — 24 hours and 39 minutes long.') }, [this.solEl, this.clockEl]), group]);
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
${t('In stock: {amount} {unit} ({rate})', { amount: formatAmount(amt), unit: def.unit, rate: formatRate(rate) })}
${t('Max storage: {amount} {unit}', { amount: formatAmount(cap), unit: def.unit })}`;
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
    const tip = [
      day ? t('Electricity (day)') : t('Electricity (night)'),
      t('Current — buildings asking for: {kw} kW', { kw: p.demandKw.toFixed(1) }),
      t('Max — solar panels now: {kw} kW', { kw: p.generationKw.toFixed(1) }),
      t('Solar averaged over day and night: about {kw} kW', { kw: p.avgGenerationKw.toFixed(0) }),
      t('Buildings using: {kw} kW', { kw: p.suppliedKw.toFixed(1) }) + (p.unpowered ? t(' — {n} waiting for power', { n: p.unpowered }) : ''),
      t('Batteries (bar): {now} / {max} kWh', { now: p.batteryKwh.toFixed(0), max: p.batteryCapacityKwh.toFixed(0) }),
      t('Spare for new buildings: {kw} kW', { kw: Math.max(0, p.avgGenerationKw - p.plannedDemandKw).toFixed(1) }),
    ].join('\n');
    if (this.energyChip.title !== tip) this.energyChip.title = tip;

    setText(this.popMax, String(s.colony.housing));
    setText(this.popCur, String(s.colony.colonists));
    const popTip = [
      t('Crew'),
      t('Current — colonists living in the base: {n}', { n: s.colony.colonists }),
      t('Max — beds in habitats: {n}', { n: s.colony.housing }),
    ].join('\n');
    if (this.popChip.title !== popTip) this.popChip.title = popTip;
    toggleClass(this.popChip, 'low', s.colony.housing < s.colony.colonists);

    const time = formatMarsTime(s.timeSols);
    setText(this.solEl, t('Sol {n}', { n: time.sol }));
    setText(this.clockEl, time.clock);
    toggleClass(this.pauseBtn, 'active', s.paused);
    const icon = s.paused ? 'play' : 'pause';
    if (this.pauseBtn.dataset.icon !== icon) {
      this.pauseBtn.innerHTML = s.paused ? ICONS.play : ICONS.pause;
      this.pauseBtn.dataset.icon = icon;
    }
    setText(this.speedBtn, `${s.speed}×`);
    this.speedBtn.setAttribute('aria-label', t('Speed {now}×, click for {next}×', { now: s.speed, next: SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length] }));
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
      ? t('{xp} XP — {left} XP to {rank}', { xp: s.progression.xp, left: next.xp - s.progression.xp, rank: next.title })
      : t('{xp} XP — highest rank!', { xp: s.progression.xp });
  }
}
