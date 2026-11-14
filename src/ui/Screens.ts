import { h, setText } from './dom';

/** Loading overlay shown while the planet is generated. */
export class LoadingScreen {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;

  constructor(parent: HTMLElement) {
    this.fill = h('span', { class: 'progress-fill' });
    this.label = h('p', { class: 'loading-label', text: 'Preparing mission…' });
    this.el = h('div', { class: 'loading' }, [
      h('div', { class: 'loading-card' }, [
        h('div', { class: 'loading-planet' }),
        h('h1', { text: 'Mars Colony Command' }),
        this.label,
        h('div', { class: 'progress' }, [this.fill]),
      ]),
    ]);
    parent.append(this.el);
  }

  progress(fraction: number, label: string): void {
    this.fill.style.transform = `scaleX(${Math.min(1, fraction).toFixed(3)})`;
    setText(this.label, label);
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

  constructor(parent: HTMLElement, onStart: () => void, hasSave: Promise<boolean>, onLoad: () => void) {
    const loadBtn = h('button', { class: 'btn', text: 'Continue saved game', attrs: { type: 'button' }, on: { click: () => this.close(onLoad) } });
    loadBtn.style.display = 'none';
    hasSave.then((yes) => {
      if (yes) loadBtn.style.display = '';
    });
    this.el = h('div', { class: 'welcome', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'welcome-title' } }, [
      h('div', { class: 'welcome-card' }, [
        h('span', { class: 'eyebrow', text: 'Mission briefing · Sol 1' }),
        h('h1', { text: 'Welcome, Commander!', attrs: { id: 'welcome-title' } }),
        h('p', {
          text: 'Your crew has landed in Jezero Crater, an ancient lake bed on Mars. The base already has a habitat, a solar farm, a life-support plant and a greenhouse with plants and chickens.',
        }),
        h('ul', { class: 'goals' }, [
          h('li', { text: '🏗️ Build new structures to grow your colony' }),
          h('li', { text: '⚡ Keep enough power, water, oxygen and food' }),
          h('li', { text: '🛰️ Send survey rovers to explore all 30 regions of Mars' }),
        ]),
        h('p', { class: 'controls-help', text: 'Drag to move · Scroll or pinch to zoom · Right-drag to rotate & tilt · Space pause' }),
        h('div', { class: 'welcome-actions' }, [
          h('button', { class: 'btn primary big', text: 'Start mission 🚀', attrs: { type: 'button' }, on: { click: () => this.close(onStart) } }),
          loadBtn,
        ]),
      ]),
    ]);
    parent.append(this.el);
  }

  private close(then: () => void): void {
    this.el.classList.add('done');
    window.setTimeout(() => this.el.remove(), 400);
    then();
  }
}
