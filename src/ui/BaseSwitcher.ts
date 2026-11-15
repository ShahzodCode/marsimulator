import { SITE_BY_ID, TRAITS, visibleTraits } from '../data/baseSites';
import { gameStore } from '../state/gameStore';
import { clear, h, setText } from './dom';
import { t } from '../i18n';

/**
 * Which base is on screen, its site traits, and a list to jump to another base.
 * Every base keeps its own resources; the top bar always shows the base on screen.
 */
export class BaseSwitcher {
  private button: HTMLButtonElement;
  private name: HTMLElement;
  private traits: HTMLElement;
  private list: HTMLElement;
  private key = '';

  constructor(parent: HTMLElement) {
    this.name = h('strong', { class: 'base-name' });
    this.traits = h('span', { class: 'base-traits' });
    this.list = h('div', { class: 'base-list', attrs: { hidden: '', role: 'menu' } });
    this.button = h(
      'button',
      {
        class: 'base-switch',
        attrs: { type: 'button', 'aria-haspopup': 'menu', 'aria-label': t('Switch base') },
        on: {
          click: () => {
            if (this.list.hasAttribute('hidden')) this.list.removeAttribute('hidden');
            else this.list.setAttribute('hidden', '');
          },
        },
      },
      [h('span', { text: '📍' }), this.name, this.traits, h('span', { class: 'caret', text: '▾' })],
    );
    parent.append(h('div', { class: 'base-switcher' }, [this.button, this.list]));
    document.addEventListener('click', (e) => {
      if (!this.button.parentElement!.contains(e.target as Node)) this.list.setAttribute('hidden', '');
    });
    gameStore.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = gameStore.getState();
    const all = [{ ...s.base, colonists: s.colony.colonists }, ...s.otherBases.map((b) => ({ ...b, colonists: b.colony.colonists }))];
    const key = `${s.base.id}|${all.map((b) => `${b.id}:${b.colonists}`).join(',')}|${s.research.completed.length}`;
    if (key === this.key) return;
    this.key = key;
    const traitIcons = (siteId: string) => {
      const site = SITE_BY_ID[siteId];
      return site ? visibleTraits(site, s.research.completed).map((id) => TRAITS[id].icon).join('') : '';
    };
    setText(this.name, s.base.name);
    setText(this.traits, traitIcons(s.base.siteId));
    const site = SITE_BY_ID[s.base.siteId];
    this.button.title = site
      ? `${site.name}: ${visibleTraits(site, s.research.completed).map((id) => TRAITS[id].name).join(', ') || t('balanced site')}. ${t('Click to switch base.')}`
      : t('Switch base');
    this.button.classList.toggle('single', all.length < 2);
    clear(this.list);
    for (const b of all) {
      const here = b.id === s.base.id;
      this.list.append(
        h(
          'button',
          {
            class: `base-item${here ? ' current' : ''}`,
            attrs: { type: 'button', role: 'menuitem' },
            on: {
              click: () => {
                gameStore.getState().switchBase(b.id);
                this.list.setAttribute('hidden', '');
              },
            },
          },
          [h('strong', { text: b.name }), h('span', { class: 'base-traits', text: traitIcons(b.siteId) }), h('span', { class: 'muted', text: `👥 ${b.colonists}` })],
        ),
      );
    }
    if (all.length < 2) this.list.append(h('p', { class: 'muted base-hint', text: t('Map regions from orbit, then send a founding convoy from the Exploration panel to start a second base.') }));
  }
}
