// UI language (Korean / English), gettext style: the Korean source text is the message
// key, and EN maps it to English. t('{0}개 서열', 3) → "3개 서열" or "3 sequences".
// Placeholders are positional: {0}, {1}, …
import type { Msg } from './core/types';
import { EN } from './i18n.en';

export type Lang = 'ko' | 'en';

const KEY = 'align-assist:lang';
let lang: Lang = detect();
const listeners = new Set<(l: Lang) => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn(l);
}

export function onLangChange(fn: (l: Lang) => void): void {
  listeners.add(fn);
}

function fill(s: string, args: (string | number)[]): string {
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] !== undefined ? String(args[Number(i)]) : m)) : s;
}

/** Translate a Korean source string into the current language. */
export function t(ko: string, ...args: (string | number)[]): string {
  const s = lang === 'en' ? (EN[ko] ?? ko) : ko;
  return fill(s, args);
}

/** Translate a message produced by code that must not depend on the UI (e.g. the worker). */
export function tm(m: Msg): string {
  return t(m.key, ...(m.args ?? []));
}

/** Message of an error in the current language (coded errors carry a translatable key). */
export function errorText(e: unknown): string {
  const err = e as { key?: string; args?: (string | number)[]; message?: string };
  if (err && typeof err.key === 'string') return t(err.key, ...(err.args ?? []));
  return err?.message ?? String(e);
}
