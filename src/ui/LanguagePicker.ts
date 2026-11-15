import { getLang, LANGUAGES, setLang, t } from '../i18n';
import { h } from './dom';

/** EN · RU · UZ buttons. Picking one saves the game and reloads in that language. */
export function languagePicker(): HTMLElement {
  const current = getLang();
  return h(
    'div',
    { class: 'lang-picker', attrs: { role: 'radiogroup', 'aria-label': t('Language') } },
    LANGUAGES.map((l) =>
      h('button', {
        class: `lang-btn${l.id === current ? ' on' : ''}`,
        text: l.short,
        title: l.name,
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(l.id === current), lang: l.id, 'aria-label': l.name },
        on: {
          click: (e) => {
            if (l.id === current) return;
            (e.currentTarget as HTMLButtonElement).disabled = true;
            void setLang(l.id);
          },
        },
      }),
    ),
  );
}
