import { chapterUnlocked, GUIDE, unlockHint, type GuideChapter, type GuidePage } from '../data/guide';
import { LocalPrefs } from '../persistence/LocalPrefs';
import { gameStore, watch } from '../state/gameStore';
import { clear, h, setText, toggleClass } from './dom';
import { t } from '../i18n';

/** One page of the open book: the contents, a chapter page, or the "coming next" teaser. */
type Leaf = { kind: 'contents' } | { kind: 'page'; chapter: GuideChapter; page: GuidePage; n: number } | { kind: 'locked'; chapter: GuideChapter };

/** Drag farther than this (px) to turn the page. */
const SWIPE_PX = 50;

/**
 * The Commander's Guidebook: a cartoon book in the bottom-left corner, next to the
 * coordinates. Chapters open as the player progresses (data/guide.ts); a "NEW" badge shows
 * chapters not read yet. Turn pages with the arrow buttons, a swipe or ← / →.
 */
export class GuideBook {
  private button: HTMLButtonElement;
  private badge: HTMLElement;
  private book: HTMLElement;
  private track: HTMLElement;
  private counter: HTMLElement;
  private prevBtn: HTMLButtonElement;
  private nextBtn: HTMLButtonElement;
  private leaves: Leaf[] = [];
  private index = 0;
  private unlocked: string[] = [];
  private seen = new Set<string>(LocalPrefs.get('guideSeen') ?? []);
  private drag: { id: number; x: number; dx: number } | null = null;

  constructor(parent: HTMLElement) {
    this.badge = h('span', { class: 'guide-badge', text: t('NEW') });
    this.button = h('button', {
      class: 'guide-btn',
      title: t('Commander’s Guidebook (K)'),
      attrs: { type: 'button', 'aria-label': t('Commander’s Guidebook'), 'aria-expanded': 'false' },
      on: { click: () => this.toggle() },
    }, [h('span', { class: 'guide-btn-icon', text: '📖' }), h('span', { class: 'guide-btn-label', text: t('Guide') }), this.badge]);

    this.track = h('div', { class: 'guide-track' });
    const viewport = h('div', { class: 'guide-viewport' }, [this.track]);
    this.prevBtn = h('button', { class: 'guide-turn', text: '◀', attrs: { type: 'button', 'aria-label': t('Previous page') }, on: { click: () => this.go(this.index - 1) } });
    this.nextBtn = h('button', { class: 'guide-turn', text: '▶', attrs: { type: 'button', 'aria-label': t('Next page') }, on: { click: () => this.go(this.index + 1) } });
    this.counter = h('span', { class: 'guide-counter' });
    this.book = h('div', { class: 'guide-book', attrs: { role: 'dialog', 'aria-label': t('Commander’s Guidebook'), hidden: '' } }, [
      h('div', { class: 'guide-cover' }, [
        h('span', { class: 'guide-cover-title', text: `📖 ${t('Commander’s Guidebook')}` }),
        h('button', { class: 'guide-close', text: '✕', attrs: { type: 'button', 'aria-label': t('Close') }, on: { click: () => this.close() } }),
      ]),
      viewport,
      h('div', { class: 'guide-foot' }, [this.prevBtn, this.counter, this.nextBtn]),
    ]);

    // Swipe: the page follows the finger, then snaps to the next or previous page.
    viewport.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.drag = { id: e.pointerId, x: e.clientX, dx: 0 };
      viewport.setPointerCapture(e.pointerId);
      this.track.classList.add('dragging');
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.drag.dx = e.clientX - this.drag.x;
      this.place();
    });
    const endDrag = (e: PointerEvent) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = this.drag.dx;
      this.drag = null;
      this.track.classList.remove('dragging');
      if (dx <= -SWIPE_PX) this.go(this.index + 1);
      else if (dx >= SWIPE_PX) this.go(this.index - 1);
      else this.place();
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    // While open, the book owns ← → and Esc (capture phase, before the game's own keys).
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
        if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
        if (e.key === 'ArrowLeft') this.go(this.index - 1);
        else if (e.key === 'ArrowRight') this.go(this.index + 1);
        else if (e.key === 'Escape') this.close();
        else return;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );

    parent.querySelector('.bottom-left')?.append(this.button);
    parent.append(this.book);

    watch(
      (s) => GUIDE.filter((c) => chapterUnlocked(c, s)).map((c) => c.id).join(','),
      (ids, prevIds) => this.onUnlocked(ids ? ids.split(',') : [], prevIds ? prevIds.split(',') : []),
    );
  }

  get isOpen(): boolean {
    return !this.book.hasAttribute('hidden');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    this.build();
    // Start on the first chapter not read yet, or the contents.
    const fresh = this.leaves.findIndex((l) => l.kind === 'page' && !this.seen.has(l.chapter.id));
    this.book.removeAttribute('hidden');
    this.button.setAttribute('aria-expanded', 'true');
    this.button.classList.add('active');
    this.go(fresh >= 0 ? fresh : 0, false);
  }

  close(): void {
    this.book.setAttribute('hidden', '');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.classList.remove('active');
  }

  private onUnlocked(ids: string[], prevIds: string[]): void {
    this.unlocked = ids;
    const fresh = ids.filter((id) => !prevIds.includes(id));
    // One or two chapters opening during play gets a message; a save loading in (many at once) does not.
    if (prevIds.length && fresh.length && fresh.length <= 2 && gameStore.getState().started) {
      for (const id of fresh) {
        const c = GUIDE.find((x) => x.id === id)!;
        gameStore.getState().pushAlert({
          key: `guide-${id}`,
          level: 'info',
          title: t('📖 New guidebook chapter: {title}', { title: t(c.title) }),
          message: t('Open the Guide in the bottom-left corner (K) to read it.'),
          where: t('Commander’s Guidebook'),
        });
      }
    }
    this.updateBadge();
    if (this.isOpen) {
      const cur = this.leaves[this.index];
      this.build();
      const keep = cur && cur.kind === 'page' ? this.leaves.findIndex((l) => l.kind === 'page' && l.page === cur.page) : -1;
      this.go(keep >= 0 ? keep : Math.min(this.index, this.leaves.length - 1), false);
    }
  }

  private updateBadge(): void {
    toggleClass(this.button, 'has-new', this.unlocked.some((id) => !this.seen.has(id)));
  }

  /** Lays out every leaf: contents, all pages of unlocked chapters, then the next locked chapter. */
  private build(): void {
    const open = GUIDE.filter((c) => this.unlocked.includes(c.id));
    const next = GUIDE.find((c) => !this.unlocked.includes(c.id));
    this.leaves = [{ kind: 'contents' }];
    for (const c of open) c.pages.forEach((page, n) => this.leaves.push({ kind: 'page', chapter: c, page, n }));
    if (next) this.leaves.push({ kind: 'locked', chapter: next });
    clear(this.track);
    for (const leaf of this.leaves) this.track.append(this.renderLeaf(leaf));
  }

  private renderLeaf(leaf: Leaf): HTMLElement {
    if (leaf.kind === 'contents') return this.renderContents();
    if (leaf.kind === 'locked') {
      return h('article', { class: 'guide-page locked' }, [
        h('div', { class: 'guide-art', text: '🔒' }),
        h('p', { class: 'guide-kicker', text: t('Coming next') }),
        h('h3', { class: 'guide-title', text: `${leaf.chapter.icon} ${t(leaf.chapter.title)}` }),
        h('p', { class: 'guide-text', text: hintText(leaf.chapter) }),
      ]);
    }
    const { chapter, page, n } = leaf;
    const num = GUIDE.indexOf(chapter) + 1;
    const kicker = chapter.pages.length > 1 ? t('Chapter {n} · page {p} of {total}', { n: num, p: n + 1, total: chapter.pages.length }) : t('Chapter {n}', { n: num });
    return h('article', { class: 'guide-page' }, [
      h('p', { class: 'guide-kicker', text: `${chapter.icon} ${kicker} · ${t(chapter.title)}` }),
      h('div', { class: 'guide-art', text: page.art }),
      h('h3', { class: 'guide-title', text: t(page.title) }),
      ...page.body.map((p) => h('p', { class: 'guide-text', text: t(p) })),
      page.tip ? h('div', { class: 'guide-tip' }, [h('span', { class: 'guide-tip-icon', text: '💡' }), h('span', { text: t(page.tip) })]) : null,
    ]);
  }

  private renderContents(): HTMLElement {
    const items = GUIDE.map((c, i) => {
      const isOpen = this.unlocked.includes(c.id);
      const isNew = isOpen && !this.seen.has(c.id);
      const label = [h('span', { class: 'guide-toc-icon', text: isOpen ? c.icon : '🔒' }), h('span', { class: 'guide-toc-name', text: isOpen ? `${i + 1}. ${t(c.title)}` : `${i + 1}. ???` })];
      if (isNew) label.push(h('span', { class: 'guide-toc-new', text: t('NEW') }));
      if (!isOpen) return h('li', { class: 'guide-toc-item locked', title: hintText(c) }, label);
      return h('li', { class: 'guide-toc-item' }, [
        h('button', {
          attrs: { type: 'button' },
          on: { click: () => this.go(this.leaves.findIndex((l) => l.kind === 'page' && l.chapter === c)) },
        }, label),
      ]);
    });
    const count = this.unlocked.length;
    return h('article', { class: 'guide-page contents' }, [
      h('div', { class: 'guide-art', text: '🚀📚' }),
      h('h3', { class: 'guide-title', text: t('Contents') }),
      h('p', { class: 'guide-text small', text: t('{n} of {total} chapters open. More open as you grow your colony!', { n: count, total: GUIDE.length }) }),
      h('ol', { class: 'guide-toc' }, items),
    ]);
  }

  private go(i: number, animate = true): void {
    if (!this.leaves.length) return;
    this.index = Math.max(0, Math.min(this.leaves.length - 1, i));
    toggleClass(this.track, 'instant', !animate);
    this.place();
    this.prevBtn.disabled = this.index === 0;
    this.nextBtn.disabled = this.index === this.leaves.length - 1;
    setText(this.counter, `${this.index + 1} / ${this.leaves.length}`);
    const pages = this.track.children;
    for (let k = 0; k < pages.length; k++) (pages[k] as HTMLElement).inert = k !== this.index;
    (pages[this.index] as HTMLElement | undefined)?.scrollTo?.({ top: 0 });
    const leaf = this.leaves[this.index];
    if (leaf.kind === 'page' && !this.seen.has(leaf.chapter.id)) {
      this.seen.add(leaf.chapter.id);
      LocalPrefs.set('guideSeen', [...this.seen]);
      this.updateBadge();
    }
  }

  private place(): void {
    const dx = this.drag?.dx ?? 0;
    // Resist at the first and last page.
    const atEdge = (dx > 0 && this.index === 0) || (dx < 0 && this.index === this.leaves.length - 1);
    this.track.style.transform = `translateX(calc(${-this.index * 100}% + ${atEdge ? dx / 3 : dx}px))`;
  }
}

function hintText(c: GuideChapter): string {
  const hint = unlockHint(c);
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(hint.params ?? {})) params[k] = t(v);
  return t(hint.text, params);
}
