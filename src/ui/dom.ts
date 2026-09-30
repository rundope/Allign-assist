// Tiny DOM helpers and bound form controls.

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
    none = h('input', { type: 'checkbox', checked: !get(), title: '색 없음' }) as HTMLInputElement;
    wrap.append(h('label', { class: 'none-toggle', title: '색 없음 (투명)' }, none, '없음'));
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

/**
 * Sandboxed hosts (the claude.ai Artifact build, VITE_TARGET=artifact) block page-initiated
 * downloads, so there the export is shown in a dialog to copy or save by hand.
 */
const SANDBOXED = import.meta.env.VITE_TARGET === 'artifact';

export function download(filename: string, data: BlobPart, type: string): void {
  if (SANDBOXED) {
    exportDialog(filename, data, type);
    return;
  }
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

function exportDialog(filename: string, data: BlobPart, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const body = h('div', { class: 'export-body' });
  const actions = h('div', { class: 'dialog-actions' });
  const dlg = h('dialog', { class: 'paste-dialog export-dialog' }, h('h3', null, filename), body, actions) as HTMLDialogElement;
  const copyBtn = (label: string, getText: () => Promise<string>) => {
    const b = h('button', { class: 'btn' }, label) as HTMLButtonElement;
    b.addEventListener('click', async () => {
      const text = await getText();
      try {
        await navigator.clipboard.writeText(text);
        toast('클립보드에 복사했습니다.');
      } catch {
        const ta = body.querySelector('textarea');
        ta?.focus();
        ta?.select();
        toast('자동 복사가 막혀 있어 텍스트를 선택해 두었습니다. Ctrl+C 로 복사하세요.');
      }
    });
    return b;
  };
  if (type.startsWith('image/')) {
    body.append(
      h('div', { class: 'hint' }, '이 환경에서는 파일을 바로 내려받을 수 없습니다. 이미지를 우클릭(모바일은 길게 누르기)해서 저장하세요.'),
      h('div', { class: 'export-preview' }, h('img', { src: url, alt: filename })),
    );
    if (type === 'image/svg+xml') actions.append(copyBtn('SVG 코드 복사', () => blob.text()));
  } else {
    const ta = h('textarea', { rows: 14, readonly: true, spellcheck: 'false' }) as HTMLTextAreaElement;
    void blob.text().then((t) => (ta.value = t));
    body.append(h('div', { class: 'hint' }, `이 환경에서는 파일을 바로 내려받을 수 없습니다. 내용을 복사해 ${filename} 로 저장하세요.`), ta);
    actions.append(copyBtn('복사', () => blob.text()));
  }
  actions.append(h('button', { class: 'btn primary', onclick: () => dlg.close() }, '닫기'));
  dlg.addEventListener('close', () => {
    dlg.remove();
    URL.revokeObjectURL(url);
  });
  document.body.appendChild(dlg);
  dlg.showModal();
}
