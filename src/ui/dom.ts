// Tiny DOM helpers and bound form controls.
import { t } from '../i18n';

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
  return el;
}

let uid = 0;
const nextId = () => `f${++uid}`;

export function field(label: string, control: HTMLElement, hint?: string, id?: string): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id ?? control.id }, label),
    control,
    hint ? h('div', { class: 'hint' }, hint) : null,
  );
}

export function numberInput(
  label: string,
  get: () => number,
  set: (v: number) => void,
  o: { min?: number; max?: number; step?: number; hint?: string; slider?: boolean; suffix?: string } = {},
): HTMLElement {
  const id = nextId();
  const num = h('input', { id, type: 'number', value: get(), min: o.min, max: o.max, step: o.step ?? 1 }) as HTMLInputElement;
  const clamp = (v: number) => Math.min(o.max ?? Infinity, Math.max(o.min ?? -Infinity, v));
  if (o.slider) {
    const range = h('input', {
      type: 'range',
      value: get(),
      min: o.min ?? 0,
      max: o.max ?? 100,
      step: o.step ?? 1,
      'aria-label': label,
    }) as HTMLInputElement;
    range.addEventListener('input', () => {
      num.value = range.value;
      set(clamp(Number(range.value)));
    });
    num.addEventListener('change', () => {
      const v = clamp(Number(num.value));
      num.value = String(v);
      range.value = String(v);
      set(v);
    });
    return field(label, h('div', { class: 'slider-row' }, range, num, o.suffix ? h('span', { class: 'suffix' }, o.suffix) : null), o.hint, id);
  }
  num.addEventListener('change', () => {
    const v = clamp(Number(num.value));
    num.value = String(v);
    set(v);
  });
  return field(label, o.suffix ? h('div', { class: 'slider-row' }, num, h('span', { class: 'suffix' }, o.suffix)) : num, o.hint, id);
}

export function select<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  get: () => T,
  set: (v: T) => void,
  hint?: string,
): HTMLElement {
  const id = nextId();
  const sel = h('select', { id }, ...options.map((o) => h('option', { value: o.value, selected: o.value === get() }, o.label))) as HTMLSelectElement;
  sel.addEventListener('change', () => set(sel.value as T));
  return field(label, sel, hint, id);
}

export function checkbox(label: string, get: () => boolean, set: (v: boolean) => void, hint?: string): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: get() }) as HTMLInputElement;
  input.addEventListener('change', () => set(input.checked));
  return h('div', { class: 'field check' }, h('label', null, input, h('span', null, label)), hint ? h('div', { class: 'hint' }, hint) : null);
}

/** Colour picker with an optional "none" toggle (value '' = none). */
export function colorInput(get: () => string, set: (v: string) => void, o: { allowNone?: boolean; title?: string; fallback?: string } = {}): HTMLElement {
  const input = h('input', { type: 'color', value: get() || o.fallback || '#ffffff', title: o.title }) as HTMLInputElement;
  const wrap = h('span', { class: 'color-in' }, input);
  let none: HTMLInputElement | null = null;
  if (o.allowNone) {
    none = h('input', { type: 'checkbox', checked: !get(), title: t('색 없음') }) as HTMLInputElement;
    wrap.append(h('label', { class: 'none-toggle', title: t('색 없음 (투명)') }, none, t('없음')));
    none.addEventListener('change', () => {
      input.disabled = none!.checked;
      set(none!.checked ? '' : input.value);
    });
    input.disabled = !get();
  }
  input.addEventListener('input', () => {
    if (none) none.checked = false;
    set(input.value);
  });
  return wrap;
}

export function section(title: string, open: boolean, ...children: Child[]): HTMLDetailsElement {
  return h('details', { class: 'panel', open }, h('summary', null, title), h('div', { class: 'panel-body' }, ...children));
}

export function download(filename: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function toast(msg: string, kind: 'info' | 'error' = 'info'): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h('div', { class: `toast ${kind}` }, msg);
  host.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}


/**
 * Translate a sentence and drop nodes into its {0}, {1}… slots, so a whole sentence is one
 * translation (word order differs between languages) while names can still be bold etc.
 */
export function tpl(key: string, ...args: (Node | string | number)[]): (Node | string)[] {
  const out: (Node | string)[] = [];
  const parts = t(key).split(/\{(\d+)\}/);
  parts.forEach((p, i) => {
    if (i % 2 === 0) {
      if (p) out.push(p);
    } else {
      const a = args[Number(p)];
      if (a !== undefined && a !== '') out.push(typeof a === 'number' ? String(a) : a);
    }
  });
  return out;
}
