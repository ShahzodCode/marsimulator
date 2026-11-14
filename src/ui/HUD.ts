import { RESOURCES, RESOURCE_IDS, formatAmount, formatRate, type ResourceId } from '../data/resources';
import { LEVELS, levelForXp, nextLevel } from '../data/progression';
import { SETTLEMENT } from '../data/settlement';
import { formatMarsTime } from '../core/GameClock';
import { ResourceManager } from '../simulation/ResourceManager';
import { gameStore, type GameStore } from '../state/gameStore';
import type { SimSpeed } from '../state/types';
import { h, setText, toggleClass } from './dom';
import { ICONS, RESOURCE_ICONS } from './icons';

interface ResourceChip {
  root: HTMLElement;
  amount: HTMLElement;
  rate: HTMLElement;
}

/**
 * Top bar: settlement identity, level, resources (amount + net rate per sol),
 * energy balance, population and the time controls.
 */
export class HUD {
  readonly el: HTMLElement;
  private chips = {} as Record<ResourceId, ResourceChip>;
  private energyValue!: HTMLElement;
  private energyFill!: HTMLElement;
  private energyChip!: HTMLElement;
  private popValue!: HTMLElement;
  private popChip!: HTMLElement;
  private solEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private xpFill!: HTMLElement;
  private speedButtons = new Map<SimSpeed | 0, HTMLButtonElement>();

  constructor(parent: HTMLElement) {
    this.el = h('header', { class: 'topbar', attrs: { role: 'banner' } }, [this.brand(), this.resources(), this.time()]);
    parent.append(this.el);
    gameStore.subscribe((s) => this.render(s));
    this.render(gameStore.getState());
  }

  private brand(): HTMLElement {
    this.levelEl = h('span', { class: 'level-title' });
    this.xpFill = h('span', { class: 'xp-fill' });
    return h('div', { class: 'brand' }, [
      h('div', { class: 'brand-mark', html: '<span></span>' }),
      h('div', { class: 'brand-text' }, [
        h('strong', { text: SETTLEMENT.name }),
        h('div', { class: 'level' }, [this.levelEl, h('span', { class: 'xp-bar' }, [this.xpFill])]),
      ]),
    ]);
  }

  private resources(): HTMLElement {
    const wrap = h('div', { class: 'resources', attrs: { role: 'list', 'aria-label': 'Resources' } });
    for (const id of RESOURCE_IDS) {
      const def = RESOURCES[id];
      const amount = h('span', { class: 'chip-value' });
      const rate = h('span', { class: 'chip-rate' });
      const root = h(
        'div',
        { class: 'chip', title: `${def.name}: ${def.description}`, attrs: { role: 'listitem' }, style: { ['--chip-color' as never]: def.color } },
        [
          h('span', { class: 'chip-icon', html: RESOURCE_ICONS[id] }),
          h('span', { class: 'chip-body' }, [h('span', { class: 'chip-label', text: def.name }), h('span', { class: 'chip-row' }, [amount, rate])]),
        ],
      );
      this.chips[id] = { root, amount, rate };
      wrap.append(root);
    }
    this.energyValue = h('span', { class: 'chip-value' });
    this.energyFill = h('span', { class: 'energy-fill' });
    this.energyChip = h(
      'div',
      {
        class: 'chip energy',
        title: 'Energy: electricity made by solar panels (left) and used by buildings (right). If buildings need more than you make, they slow down.',
        style: { ['--chip-color' as never]: '#ffd34d' },
      },
      [
        h('span', { class: 'chip-icon', html: ICONS.energy }),
        h('span', { class: 'chip-body' }, [
          h('span', { class: 'chip-label', text: 'Energy kW' }),
          this.energyValue,
          h('span', { class: 'energy-bar' }, [this.energyFill]),
        ]),
      ],
    );
    this.popValue = h('span', { class: 'chip-value' });
    this.popChip = h(
      'div',
      { class: 'chip', title: 'Colonists living in the base / beds available in habitats.', style: { ['--chip-color' as never]: '#f4a6ff' } },
      [h('span', { class: 'chip-icon', html: ICONS.people }), h('span', { class: 'chip-body' }, [h('span', { class: 'chip-label', text: 'Crew' }), this.popValue])],
    );
    wrap.append(this.energyChip, this.popChip);
    return wrap;
  }

  private time(): HTMLElement {
    this.solEl = h('span', { class: 'sol' });
    this.clockEl = h('span', { class: 'clock' });
    const group = h('div', { class: 'speed-group', attrs: { role: 'group', 'aria-label': 'Simulation speed' } });
    const mk = (speed: SimSpeed | 0, label: string, title: string) => {
      const b = h('button', {
        class: 'speed-btn',
        html: label,
        title,
        attrs: { 'aria-label': title },
        on: {
          click: () => {
            const st = gameStore.getState();
            if (speed === 0) st.togglePause();
            else st.setSpeed(speed);
          },
        },
      });
      this.speedButtons.set(speed, b);
      group.append(b);
    };
    mk(0, ICONS.pause, 'Pause / resume (Space)');
    mk(1, '1×', 'Normal speed (key 1)');
    mk(2, '2×', 'Double speed (key 2)');
    mk(4, '4×', 'Fast (key 3)');
    return h('div', { class: 'timebox' }, [h('div', { class: 'time-readout', title: 'A sol is one Martian day — 24 hours and 39 minutes long.' }, [this.solEl, this.clockEl]), group]);
  }

  private render(s: GameStore): void {
    for (const id of RESOURCE_IDS) {
      const c = this.chips[id];
      const amt = s.resources[id];
      const rate = s.rates[id];
      setText(c.amount, formatAmount(amt));
      setText(c.rate, formatRate(rate));
      toggleClass(c.rate, 'up', rate > 0.05);
      toggleClass(c.rate, 'down', rate < -0.05);
      const def = RESOURCES[id];
      const left = ResourceManager.solsRemaining(amt, rate);
      toggleClass(c.root, 'critical', def.vital && amt <= 0.01 && rate < 0);
      toggleClass(c.root, 'low', def.vital && amt > 0.01 && left < def.warnSols);
    }
    const e = s.energy;
    setText(this.energyValue, `${e.generation.toFixed(0)} / ${e.consumption.toFixed(0)}`);
    const ratio = e.generation > 0 ? Math.min(1, e.consumption / e.generation) : e.consumption > 0 ? 1 : 0;
    this.energyFill.style.transform = `scaleX(${ratio.toFixed(3)})`;
    toggleClass(this.energyChip, 'critical', e.consumption > e.generation + 1e-6);
    toggleClass(this.energyChip, 'low', e.consumption <= e.generation && e.generation - e.consumption < 5);

    setText(this.popValue, `${s.colony.colonists} / ${s.colony.housing}`);
    toggleClass(this.popChip, 'low', s.colony.housing < s.colony.colonists);

    const t = formatMarsTime(s.timeSols);
    setText(this.solEl, `Sol ${t.sol}`);
    setText(this.clockEl, t.clock);
    for (const [speed, b] of this.speedButtons) {
      if (speed === 0) {
        toggleClass(b, 'active', s.paused);
        const html = s.paused ? ICONS.play : ICONS.pause;
        if (b.dataset.icon !== (s.paused ? 'play' : 'pause')) {
          b.innerHTML = html;
          b.dataset.icon = s.paused ? 'play' : 'pause';
        }
      } else toggleClass(b, 'active', !s.paused && s.speed === speed);
    }

    const lvl = levelForXp(s.progression.xp);
    const next = nextLevel(lvl.level);
    setText(this.levelEl, `Lv ${lvl.level} · ${lvl.title}`);
    const frac = next ? (s.progression.xp - lvl.xp) / (next.xp - lvl.xp) : 1;
    this.xpFill.style.transform = `scaleX(${Math.min(1, frac).toFixed(3)})`;
    this.levelEl.parentElement!.title = next
      ? `${s.progression.xp} XP — ${next.xp - s.progression.xp} XP to ${LEVELS[lvl.level]?.title ?? 'next level'}`
      : `${s.progression.xp} XP — max level`;
  }
}
