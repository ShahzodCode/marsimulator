import { h, setText } from './dom';
import { accountButton } from './AuthDialog';
import { languagePicker } from './LanguagePicker';
import { t } from '../i18n';

/** Loading overlay shown while the planet is generated. */
export class LoadingScreen {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;

  constructor(parent: HTMLElement) {
    this.fill = h('span', { class: 'progress-fill' });
    this.label = h('p', { class: 'loading-label', text: t('Preparing mission…') });
    this.el = h('div', { class: 'loading' }, [
      h('div', { class: 'loading-card' }, [
        h('h1', { class: 'loading-logo' }, [h('img', { attrs: { src: '/logo.webp', alt: 'UltraMars Simulator', width: '640', height: '619' } })]),
        this.label,
        h('div', { class: 'progress' }, [this.fill]),
      ]),
    ]);
    parent.append(this.el);
  }

  progress(fraction: number, label: string): void {
    this.fill.style.transform = `scaleX(${Math.min(1, fraction).toFixed(3)})`;
    // Labels come in English from the loader and the terrain worker.
    setText(this.label, t(label));
  }

  error(message: string): void {
    setText(this.label, message);
    this.el.classList.add('error');
  }

  hide(): void {
    this.el.classList.add('done');
    window.setTimeout(() => this.el.remove(), 700);
  }
}

/** Mission briefing shown before the simulation starts. */
export class WelcomeScreen {
  readonly el: HTMLElement;

  constructor(parent: HTMLElement, onStart: () => void) {
    this.el = h('div', { class: 'welcome', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'welcome-title' } }, [
      h('div', { class: 'welcome-card' }, [
        h('div', { class: 'welcome-top' }, [h('span', { class: 'eyebrow', text: t('Mission briefing · Sol 1') }), languagePicker()]),
        h('h1', { text: t('Welcome, Commander!'), attrs: { id: 'welcome-title' } }),
        h('p', {
          text: t('Your crew has landed in Jezero Crater, an ancient lake bed on Mars. The base already has a habitat, a solar farm, a life-support plant and a greenhouse with plants and chickens.'),
        }),
        h('ul', { class: 'goals' }, [
          h('li', { text: `🏗️ ${t('Build new structures to grow your colony')}` }),
          h('li', { text: `⚡ ${t('Keep enough power, water, oxygen and food')}` }),
          h('li', { text: `🛰️ ${t('Send survey rovers to explore all 30 regions of Mars')}` }),
        ]),
        h('p', { class: 'controls-help', text: t('Drag to move · Scroll or pinch to zoom · Right-drag to rotate & tilt · Space pause') }),
        h('div', { class: 'welcome-actions' }, [
          h('button', { class: 'btn primary big', text: `${t('Start mission')} 🚀`, attrs: { type: 'button' }, on: { click: () => this.close(onStart) } }),
        ]),
        h('div', { class: 'welcome-account' }, [h('span', { class: 'muted', text: t('Save your colony to an account:') }), accountButton(parent)]),
      ]),
    ]);
    parent.append(this.el);
  }

  get open(): boolean {
    return this.el.isConnected && !this.el.classList.contains('done');
  }

  private close(then: () => void): void {
    this.el.classList.add('done');
    window.setTimeout(() => this.el.remove(), 400);
    then();
  }
}
