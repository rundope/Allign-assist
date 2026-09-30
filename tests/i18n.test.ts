// Every Korean string in the UI must have an English translation, and Korean text must not
// be built into template literals (it has to go through t('…{0}…', value) to be translatable).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN } from '../src/i18n.en';

const HANGUL = /[가-힣]/;
const ROOT = new URL('..', import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('i18n.en.ts') ? [p] : [];
  });
}

/** String literals of a TS source (comments, regex literals and template expressions handled). */
export function scan(src: string): { literals: string[]; templateText: string[] } {
  const literals: string[] = [];
  const templateText: string[] = [];
  let i = 0;
  let lastSig = '';
  const readQuoted = (q: string) => {
    let j = i + 1;
    let out = '';
    while (src[j] !== q) {
      if (j >= src.length) throw new Error(`unterminated string at ${i}: ${src.slice(i, i + 40)}`);
      if (src[j] === '\\') {
        const n = src[j + 1];
        out += n === 'n' ? '\n' : n;
        j += 2;
        continue;
      }
      out += src[j++];
    }
    i = j + 1;
    return out;
  };
  const readTemplate = () => {
    let j = i + 1;
    let text = '';
    while (src[j] !== '`') {
      if (j >= src.length) throw new Error(`unterminated template at ${i}: ${src.slice(i, i + 40)}`);
      if (src[j] === '\\') {
        text += src[j + 1];
        j += 2;
        continue;
      }
      if (src[j] === '$' && src[j + 1] === '{') {
        let depth = 1;
        let k = j + 2;
        const start = k;
        let sig = '';
        while (depth) {
          if (k >= src.length) throw new Error(`unterminated \${ at ${j}: ${src.slice(j, j + 40)}`);
          const ch = src[k];
          if (ch === '{') depth++;
          else if (ch === '}') depth--;
          else if (ch === '`' || ch === "'" || ch === '"') {
            // skip a nested string or template (templates may nest further ${…} — skip by depth)
            let m = k + 1;
            let d = 0;
            while (m < src.length && !(src[m] === ch && d === 0)) {
              if (src[m] === '\\') m++;
              else if (ch === '`' && src[m] === '$' && src[m + 1] === '{') d++;
              else if (ch === '`' && src[m] === '}' && d > 0) d--;
              m++;
            }
            k = m;
          } else if (ch === '/' && '(,=:[!&|?{};+-*%<>~^'.includes(sig || '(')) {
            let m = k + 1;
            let inClass = false;
            while (m < src.length && (src[m] !== '/' || inClass)) {
              if (src[m] === '\\') m++;
              else if (src[m] === '[') inClass = true;
              else if (src[m] === ']') inClass = false;
              m++;
            }
            k = m;
          }
          if (!/\s/.test(ch)) sig = /[\w$)\]]/.test(ch) ? 'x' : ch;
          k++;
        }
        const inner = scan(src.slice(start, k - 1));
        literals.push(...inner.literals);
        templateText.push(...inner.templateText);
        j = k;
        continue;
      }
      text += src[j++];
    }
    i = j + 1;
    templateText.push(text);
  };
  let guard = 0;
  while (i < src.length) {
    if (++guard > src.length * 4) throw new Error(`scanner stuck at ${i}: ${src.slice(i, i + 40)}`);
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i) + 2;
      continue;
    }
    if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig))) {
      // regex literal
      let j = i + 1;
      let inClass = false;
      while (j < src.length && (src[j] !== '/' || inClass)) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      i = j + 1;
      lastSig = 'x';
      continue;
    }
    if (c === "'" || c === '"') {
      literals.push(readQuoted(c));
      lastSig = 'x';
      continue;
    }
    if (c === '`') {
      readTemplate();
      lastSig = 'x';
      continue;
    }
    if (!/\s/.test(c)) lastSig = /[\w$)\]]/.test(c) ? 'x' : c;
    i++;
  }
  return { literals, templateText };
}

function htmlKeys(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/data-i18n(?:-html|-title)?="([^"]*)"/g)) out.push(m[1].replace(/&quot;/g, '"'));
  return out;
}

export function collectKeys(): { keys: Set<string>; untranslatable: string[] } {
  const keys = new Set<string>();
  const untranslatable: string[] = [];
  for (const f of files(join(ROOT, 'src'))) {
    const { literals, templateText } = scan(readFileSync(f, 'utf8'));
    for (const l of literals) if (HANGUL.test(l)) keys.add(l);
    for (const tt of templateText) if (HANGUL.test(tt)) untranslatable.push(`${f.replace(ROOT, '')}: ${tt.slice(0, 60)}`);
  }
  for (const k of htmlKeys(readFileSync(join(ROOT, 'index.html'), 'utf8'))) keys.add(k);
  return { keys, untranslatable };
}

describe('translations', () => {
  const { keys, untranslatable } = collectKeys();
  it('no Korean text is baked into template literals', () => {
    expect(untranslatable).toEqual([]);
  });
  it('every Korean string has an English translation', () => {
    const missing = [...keys].filter((k) => !(k in EN));
    expect(missing).toEqual([]);
  });
  it('translations keep their placeholders', () => {
    const bad = Object.entries(EN).filter(([ko, en]) => {
      const a = (ko.match(/\{\d+\}/g) ?? []).sort().join();
      const b = (en.match(/\{\d+\}/g) ?? []).sort().join();
      return a !== b;
    });
    expect(bad).toEqual([]);
  });
  it('the dictionary has no stale entries', () => {
    const stale = Object.keys(EN).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });
});
