import { LocalPrefs } from '../persistence/LocalPrefs';
import { RU } from './ru';
import { UZ } from './uz';

/**
 * Translations. English text is the key: UI code wraps a string in t('…') and the
 * Russian and Uzbek dictionaries map that exact English text to their own. A string
 * missing from a dictionary falls back to English, so untranslated text never breaks.
 *
 * Placeholders are {name}: t('Rank {n} of {total}', { n: 3, total: 8 }).
 * Changing language saves the game and reloads the page, so every widget is rebuilt.
 */
export type Lang = 'en' | 'ru' | 'uz';

export const LANGUAGES: { id: Lang; name: string; short: string }[] = [
  { id: 'en', name: 'English', short: 'EN' },
  { id: 'ru', name: 'Русский', short: 'RU' },
  // Official Uzbek Latin (1995 alphabet): oʻ and gʻ use the turned comma U+02BB.
  { id: 'uz', name: 'Oʻzbekcha', short: 'UZ' },
];

const DICTS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { ru: RU, uz: UZ };

function initialLang(): Lang {
  const saved = LocalPrefs.get('lang');
  if (saved && LANGUAGES.some((l) => l.id === saved)) return saved;
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase();
  if (nav.startsWith('ru')) return 'ru';
  if (nav.startsWith('uz')) return 'uz';
  return 'en';
}

let lang: Lang = initialLang();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

const missing = new Set<string>();

export function getLang(): Lang {
  return lang;
}

export function t(en: string, params?: Record<string, string | number>): string {
  let out = en;
  if (lang !== 'en') {
    const tr = DICTS[lang][en];
    if (tr !== undefined) out = tr;
    else if (import.meta.env.DEV && !missing.has(en)) {
      missing.add(en);
      console.debug(`[i18n] missing ${lang}:`, en);
    }
  }
  return fill(out, params);
}

function fill(s: string, params?: Record<string, string | number>): string {
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/**
 * A count with the right plural form. The English plural (`other`) is the dictionary key.
 * Russian entries hold three forms split by "|": one|few|many (1 сол | 2 сола | 5 солов).
 * Uzbek nouns stay singular after a number (3 ta bino), so its entry is a single form.
 */
export function tn(n: number, one: string, other: string, params?: Record<string, string | number>): string {
  const all = { n, ...params };
  if (lang === 'en') return t(Math.abs(n) === 1 ? one : other, all);
  const forms = t(other).split('|');
  if (lang !== 'ru' || forms.length < 3) return fill(forms[0], all);
  const abs = Math.abs(n);
  const m10 = abs % 10;
  const m100 = abs % 100;
  let i = 2;
  if (!Number.isInteger(abs)) i = 1;
  else if (m10 === 1 && m100 !== 11) i = 0;
  else if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) i = 1;
  return fill(forms[i], all);
}

let beforeChange: (() => Promise<void>) | null = null;

/** The game registers its save here so switching language never loses progress. */
export function onBeforeLanguageChange(fn: () => Promise<void>): void {
  beforeChange = fn;
}

export async function setLang(next: Lang): Promise<void> {
  if (next === lang) return;
  try {
    await beforeChange?.();
  } catch (e) {
    console.warn('Save before language change failed', e);
  }
  LocalPrefs.set('lang', next);
  window.location.reload();
}
