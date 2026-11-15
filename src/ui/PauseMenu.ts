import type { EventBus } from '../core/EventBus';
import { Graphics, type FpsLimit, type GraphicsSettings, type Quality } from '../core/Graphics';
import { gameStore } from '../state/gameStore';
import { clear, h, setText, toggleClass } from './dom';
import { ICONS } from './icons';
import { languagePicker } from './LanguagePicker';
import { t } from '../i18n';

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: 'auto', label: t('Auto'), hint: t('Picks the best quality your device can keep smooth, and adjusts it as you play.') },
  { id: 'low', label: t('Low'), hint: t('No shadows and a lower resolution. Best for older computers and phones.') },
  { id: 'medium', label: t('Medium'), hint: t('Simpler shadows and a balanced resolution.') },
  { id: 'high', label: t('High'), hint: t('Sharp shadows at full resolution. Needs a strong graphics card.') },
];

const FPS_LIMITS: { id: FpsLimit; label: string }[] = [
  { id: 30, label: '30' },
  { id: 60, label: '60' },
  { id: 0, label: t('Unlimited') },
];

const TIER_NAME = { low: t('Low'), medium: t('Medium'), high: t('High') };

/**
 * Game menu (Esc or the ☰ button in the top bar): pauses the simulation and offers
 * Continue, Settings (graphics and performance) and the language switch. Closing it
 * resumes the game only if it was running when the menu opened.
 */
export class PauseMenu {
  private el: HTMLElement | null = null;
  private card!: HTMLElement;
  private wasPaused = false;
  private offStats: (() => void) | null = null;

  constructor(
    private parent: HTMLElement,
    events: EventBus,
  ) {
    events.on('menu:open', () => this.open());
  }

  get isOpen(): boolean {
    return this.el !== null;
  }

  open(): void {
    if (this.el || !gameStore.getState().started) return;
    const s = gameStore.getState();
    this.wasPaused = s.paused;
    s.setPaused(true);
    Graphics.menuOpen = true;
    // Focusable so clicks on the card keep keyboard focus inside the menu.
    this.card = h('div', { class: 'auth-card pause-card', attrs: { tabindex: '-1' } });
    this.el = h('div', { class: 'auth-modal pause-modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pause-title' } }, [this.card]);
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.card.classList.contains('settings')) this.showMain();
        else this.close();
      }
      e.stopPropagation();
    });
    this.parent.append(this.el);
    this.showMain();
  }

  close(): void {
    const el = this.el;
    if (!el) return;
    this.el = null;
    this.offStats?.();
    this.offStats = null;
    Graphics.menuOpen = false;
    if (!this.wasPaused) gameStore.getState().setPaused(false);
    el.classList.add('done');
    window.setTimeout(() => el.remove(), 250);
  }

  private showMain(): void {
    this.offStats?.();
    this.offStats = null;
    clear(this.card);
    this.card.classList.remove('settings');
    const resume = h('button', { class: 'btn primary big pause-btn', attrs: { type: 'button' }, html: ICONS.play, on: { click: () => this.close() } });
    resume.append(h('span', { text: t('Continue') }));
    const settings = h('button', { class: 'btn big pause-btn', attrs: { type: 'button' }, on: { click: () => this.showSettings() } }, [
      h('span', { class: 'pause-gear', text: '⚙️' }),
      h('span', { text: t('Settings') }),
    ]);
    this.card.append(
      h('img', { class: 'pause-logo', attrs: { src: '/logo.webp', alt: 'UltraMars Simulator', width: '640', height: '619' } }),
      h('h2', { class: 'pause-title', text: t('Paused'), attrs: { id: 'pause-title' } }),
      h('div', { class: 'pause-actions' }, [resume, settings]),
      h('div', { class: 'pause-lang' }, [
        h('div', {}, [h('strong', { text: t('Language') }), h('p', { class: 'muted', text: t('Changing language saves your colony and reloads the game.') })]),
        languagePicker(),
      ]),
    );
    resume.focus();
  }

  private showSettings(): void {
    clear(this.card);
    this.card.classList.add('settings');
    const back = h('button', { class: 'btn pause-back', attrs: { type: 'button', 'aria-label': t('Back') }, html: ICONS.back, on: { click: () => this.showMain() } });
    back.append(h('span', { text: t('Back') }));

    const st = Graphics.settings;
    const qualityHint = h('p', { class: 'setting-hint' });
    const quality = segmented(
      t('Graphics quality'),
      QUALITIES,
      st.quality,
      (q) => {
        Graphics.set({ quality: q });
        setText(qualityHint, QUALITIES.find((x) => x.id === q)!.hint);
      },
    );
    setText(qualityHint, QUALITIES.find((x) => x.id === st.quality)!.hint);

    const live = h('p', { class: 'setting-live', attrs: { 'aria-live': 'polite' } });
    const renderStats = () => {
      const s = Graphics.stats;
      setText(live, t('Now: {fps} FPS · {quality} · {res}% resolution', { fps: s.fps || '…', quality: TIER_NAME[s.tier], res: Math.round(s.scale * 100) }));
    };
    renderStats();
    this.offStats = Graphics.onStats(renderStats);

    this.card.append(
      h('div', { class: 'pause-head' }, [back, h('h2', { class: 'pause-title', text: t('Settings'), attrs: { id: 'pause-title' } })]),
      h('section', { class: 'setting' }, [quality, qualityHint]),
      toggle(t('Adaptive resolution'), t('Lowers the resolution a little when the game slows down, and raises it again when it can.'), 'adaptive'),
      h('section', { class: 'setting' }, [
        segmented(t('Frame rate limit'), FPS_LIMITS, st.fpsLimit, (v) => Graphics.set({ fpsLimit: v })),
        h('p', { class: 'setting-hint', text: t('A lower limit saves battery and keeps laptops cool.') }),
      ]),
      toggle(t('Show FPS counter'), t('Frames per second, in the top corner of the screen.'), 'showFps'),
      live,
      ...(Graphics.gpu ? [gpuNote()] : []),
    );
    back.focus();
  }
}

/** Which graphics chip draws the game, with a tip when it's the laptop's slower built-in one. */
function gpuNote(): HTMLElement {
  return h('div', { class: `gpu-note${Graphics.integratedGpu ? ' warn' : ''}` }, [
    h('p', { text: t('Graphics card: {gpu}', { gpu: Graphics.gpu }) }),
    Graphics.integratedGpu
      ? h('p', {
          class: 'setting-hint',
          text: t('This is the built-in graphics chip. If your computer also has a gaming card (NVIDIA or AMD), open Windows Settings → System → Display → Graphics, choose your browser, set it to “High performance”, and restart the browser.'),
        })
      : null,
  ]);
}

/** A row of buttons where exactly one is chosen. */
function segmented<T extends string | number>(label: string, options: { id: T; label: string }[], value: T, onPick: (v: T) => void): HTMLElement {
  const buttons = options.map((o) =>
    h('button', {
      class: `seg-btn${o.id === value ? ' on' : ''}`,
      text: o.label,
      attrs: { type: 'button', role: 'radio', 'aria-checked': String(o.id === value) },
      on: {
        click: () => {
          buttons.forEach((b, i) => {
            const on = options[i].id === o.id;
            toggleClass(b, 'on', on);
            b.setAttribute('aria-checked', String(on));
          });
          onPick(o.id);
        },
      },
    }),
  );
  return h('div', { class: 'setting-row' }, [h('strong', { text: label }), h('div', { class: 'seg', attrs: { role: 'radiogroup', 'aria-label': label } }, buttons)]);
}

/** An on/off switch bound to a boolean graphics setting. */
function toggle(label: string, hint: string, key: keyof Pick<GraphicsSettings, 'adaptive' | 'showFps'>): HTMLElement {
  const input = h('input', { class: 'toggle-switch', attrs: { type: 'checkbox', role: 'switch' } });
  input.checked = Graphics.settings[key];
  input.addEventListener('change', () => Graphics.set({ [key]: input.checked }));
  return h('label', { class: 'setting setting-toggle' }, [h('span', {}, [h('strong', { text: label }), h('span', { class: 'setting-hint', text: hint })]), input]);
}
