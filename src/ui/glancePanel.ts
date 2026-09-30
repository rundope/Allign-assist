// "한눈에 보기": the whole alignment — the actual residues — shrunk to fit one screen,
// with a docked loupe that shows readable residues around the pointer.
import { callVariants, type RowVariants, type VariantKind } from '../core/variants';
import { compactHit, compactPos, computeCompactLayout, drawCompact, type CompactLayout } from '../render/compact';
import { cellStyle, residueAt, type RenderModel } from '../render/model';
import { h } from './dom';

const KIND_LABEL: Record<VariantKind, string> = { sub: '치환', ins: '삽입', del: '결실', amb: '모호 염기' };
const SUB_LABEL: Record<string, string> = {
  transition: 'transition',
  transversion: 'transversion',
  conservative: '보존적 치환',
  radical: '비보존적 치환',
};

export interface GlanceCallbacks {
  /** Switch to the detailed view and bring alignment column c into view. */
  jumpTo: (col: number) => void;
}

export class GlancePanel {
  private model: RenderModel | null = null;
  private layout: CompactLayout | null = null;
  private variants: RowVariants[] = [];
  private refRow = 0;
  /** Column the loupe is centred on, and whether a click pinned it. */
  private focus = 0;
  private pinned = false;
  private raf = 0;
  private info: HTMLDivElement;
  private loupeHead: HTMLDivElement;
  private loupeBody: HTMLDivElement;
  private loupe: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private windowBox: HTMLDivElement;
  private canvasWrap: HTMLDivElement;
  private variantsEl: HTMLDetailsElement;

  constructor(
    private host: HTMLElement,
    private cb: GlanceCallbacks,
  ) {
    this.info = h('div', { class: 'glance-info' });
    this.loupeHead = h('div', { class: 'loupe-head' });
    this.loupeBody = h('div', { class: 'loupe-body' });
    this.loupe = h('div', { class: 'loupe', 'aria-live': 'polite' }, this.loupeHead, this.loupeBody);
    this.canvas = h('canvas', { class: 'compact-canvas', role: 'img', 'aria-label': '정렬 전체를 축소한 화면' });
    this.windowBox = h('div', { class: 'loupe-window', hidden: true });
    this.canvasWrap = h('div', { class: 'compact-wrap' }, this.canvas, this.windowBox);
    this.variantsEl = h('details', { class: 'glance-variants' });
    host.classList.add('glance');
    host.replaceChildren(this.info, this.loupe, this.canvasWrap, this.variantsEl);
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.pinned) return;
      const hit = this.hit(e);
      if (hit) this.setFocus(hit.c);
    });
    this.canvas.addEventListener('click', (e) => {
      const hit = this.hit(e);
      if (!hit) return;
      this.pinned = true;
      this.setFocus(hit.c);
    });
    this.canvas.addEventListener('dblclick', (e) => {
      const hit = this.hit(e);
      if (hit) this.cb.jumpTo(hit.c);
    });
  }

  setModel(m: RenderModel | null): void {
    this.model = m;
    if (!m) return;
    this.refRow = m.refRow >= 0 ? m.refRow : m.aln.referenceIndex;
    this.variants = callVariants(m.aln.rows, this.refRow, m.nucleotide, m.scoring);
    // open on the first difference, so the loupe shows something worth reading
    const firstDiff = this.variants.flatMap((rv) => rv.variants).sort((a, b) => a.col0 - b.col0)[0];
    this.focus = Math.min(m.c1 - 1, Math.max(m.c0, firstDiff ? firstDiff.col0 : m.c0));
    this.pinned = false;
    this.renderVariants();
    this.render();
  }

  render(): void {
    const m = this.model;
    const width = this.canvasWrap.clientWidth;
    if (!m || width <= 0) return;
    this.renderLoupe(); // loupe height is part of the budget below
    // Budget: the window height below the sticky header, minus everything in the glance
    // zone above the canvas (the zone is scrolled to the top when shown). The info line
    // depends on the layout and can change height, so fit twice if it moved.
    const zone = this.host.parentElement ?? this.host;
    let l: CompactLayout | null = null;
    for (let pass = 0; pass < 2; pass++) {
      const above = this.canvasWrap.getBoundingClientRect().top - zone.getBoundingClientRect().top;
      const maxH = Math.max(200, window.innerHeight - 56 - above - 14);
      const next = computeCompactLayout(m, width, maxH);
      const same = l && l.perLine === next.perLine && l.rowH === next.rowH && l.fontPx === next.fontPx;
      l = next;
      this.renderInfo(l);
      if (same) break;
    }
    this.layout = l;
    const cs = getComputedStyle(this.host);
    drawCompact(this.canvas, m, l!, {
      residue: cs.getPropertyValue('--compact-residue').trim() || '#d7dce3',
      text: m.view.textColor,
      muted: m.view.mutedColor,
      divider: cs.getPropertyValue('--divider').trim() || '#c3ccd8',
      paper: m.view.paperColor,
    });
    this.canvasWrap.style.background = m.view.paperColor;
    this.placeWindow();
  }

  private renderInfo(l: CompactLayout): void {
    const m = this.model!;
    const L = m.c1 - m.c0;
    this.info.replaceChildren(
      h('span', null, h('b', null, `${L.toLocaleString()}열 전체`), ` · 한 줄 ${l.perLine}잔기 × ${l.nBlocks}줄`),
      h('span', { class: 'muted' }, l.showLetters ? ` · 글자 ${l.fontPx}px` : ' · 글자가 작아 색 칸으로 표시'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted hint' }, l.overflow ? '서열이 너무 길어 일부는 스크롤해야 합니다 · ' : '', '마우스를 올리면 확대창에 표시 · 클릭하면 고정 · 더블클릭하면 상세 보기로 이동'),
      h('button', { type: 'button', class: 'btn small', title: '상세 보기로 돌아가기 (단축키 G)', onclick: () => this.cb.jumpTo(this.focus) }, '← 상세 보기'),
    );
  }

  private hit(e: MouseEvent): { r: number; c: number } | null {
    const m = this.model;
    const l = this.layout;
    if (!m || !l) return null;
    const rect = this.canvas.getBoundingClientRect();
    return compactHit(l, m, e.clientX - rect.left, e.clientY - rect.top);
  }

  private setFocus(c: number): void {
    this.focus = c;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.renderLoupe();
      this.placeWindow();
    });
  }

  /** Columns the loupe shows around the focus. */
  private loupeRange(): [number, number] {
    const m = this.model!;
    const avail = Math.max(200, this.loupe.clientWidth - 150);
    const span = Math.max(10, Math.floor(avail / 10.2));
    let a = this.focus - Math.floor(span / 2);
    a = Math.max(m.c0, Math.min(a, m.c1 - span));
    return [Math.max(m.c0, a), Math.min(m.c1, Math.max(m.c0, a) + span)];
  }

  /** Outline, on the compact view, the stretch the loupe is showing. */
  private placeWindow(): void {
    const m = this.model;
    const l = this.layout;
    if (!m || !l) return;
    const [a, b] = this.loupeRange();
    const pa = compactPos(l, m, a);
    const pb = compactPos(l, m, b - 1);
    this.windowBox.hidden = false;
    const hgt = m.rows.length * l.rowH;
    if (pa.y === pb.y) {
      Object.assign(this.windowBox.style, { left: `${pa.x - 1}px`, top: `${pa.y - 1}px`, width: `${pb.x - pa.x + l.cellW + 2}px`, height: `${hgt + 2}px` });
    } else {
      // the stretch wraps onto the next line: outline the part on the focus's line
      const pf = compactPos(l, m, this.focus);
      const onFirst = pf.y === pa.y;
      const x0 = onFirst ? pa.x : l.labelW;
      const x1 = onFirst ? l.labelW + l.perLine * l.cellW : pb.x + l.cellW;
      Object.assign(this.windowBox.style, { left: `${x0 - 1}px`, top: `${pf.y - 1}px`, width: `${x1 - x0 + 2}px`, height: `${hgt + 2}px` });
    }
  }

  private renderLoupe(): void {
    const m = this.model;
    if (!m) return;
    const [a, b] = this.loupeRange();
    const c = this.focus;
    const refName = m.aln.rows[this.refRow].name;
    const pos = residueAt(m, this.refRow, c);
    const head = [
      h('b', null, '확대창'),
      h('span', null, ` ${refName} ${pos !== null ? `#${pos}` : '(삽입 위치)'} · 열 ${c + 1}`),
      h('span', { class: `pin${this.pinned ? ' on' : ''}` }, this.pinned ? '고정됨' : '마우스를 따라감'),
      h('span', { class: 'spacer' }),
      this.pinned ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => ((this.pinned = false), this.renderLoupe()) }, '고정 해제') : null,
      h('button', { type: 'button', class: 'btn small', onclick: () => this.cb.jumpTo(c) }, '상세 보기에서 열기'),
    ];
    this.loupeHead.replaceChildren(...head.filter((x): x is HTMLElement => x !== null));
    const v = m.view;
    // position ruler: reference residue numbers every 10
    const ruler = h('div', { class: 'loupe-row ruler' }, h('span', { class: 'loupe-name' }, ''));
    const rulerCells: HTMLElement[] = [];
    for (let k = a; k < b; k++) {
      const n = residueAt(m, this.refRow, k);
      rulerCells.push(h('span', { class: 'lc' }, n !== null && n % 10 === 0 ? String(n) : ''));
    }
    ruler.append(...rulerCells);
    const rows = m.rows.map((_, r) => {
      const cells: HTMLElement[] = [];
      for (let k = a; k < b; k++) {
        const s = cellStyle(m, r, k);
        cells.push(h('span', { class: `lc${k === c ? ' cur' : ''}`, style: { background: s.bg || 'transparent', color: s.fg } }, s.ch === ' ' ? ' ' : s.ch));
      }
      const row = m.aln.rows[r];
      return h('div', { class: `loupe-row${r === this.refRow ? ' is-ref' : ''}` }, h('span', { class: 'loupe-name', title: row.name }, row.name), ...cells);
    });
    this.loupeBody.style.background = v.paperColor;
    this.loupeBody.style.setProperty('--lp-text', v.textColor);
    this.loupeBody.style.setProperty('--lp-muted', v.mutedColor);
    this.loupeBody.style.fontFamily = v.fontFamily;
    this.loupeBody.replaceChildren(ruler, ...rows);
  }

  private renderVariants(): void {
    const m = this.model!;
    const all = this.variants.flatMap((rv) => rv.variants);
    const groups = this.variants
      .filter((rv) => rv.variants.length)
      .map((rv) =>
        h(
          'div',
          { class: 'v-group-flat' },
          h('b', null, m.aln.rows[rv.row].name),
          h(
            'div',
            { class: 'v-items' },
            ...rv.variants.slice(0, 300).map((v) =>
              h(
                'button',
                {
                  type: 'button',
                  class: `v-item k-${v.kind}${v.subClass ? ` s-${v.subClass}` : ''}`,
                  title: '확대창에서 보기 (더블클릭: 상세 보기)',
                  onclick: () => {
                    this.pinned = true;
                    this.setFocus(v.col0);
                    this.loupe.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  },
                  ondblclick: () => this.cb.jumpTo(v.col0),
                },
                h('span', { class: 'v-badge' }, v.kind === 'sub' ? SUB_LABEL[v.subClass!] : KIND_LABEL[v.kind]),
                h('code', { class: 'v-label' }, v.label),
              ),
            ),
          ),
        ),
      );
    this.variantsEl.replaceChildren(
      h('summary', null, `차이 목록 (기준 ${m.aln.rows[this.refRow].name} 좌표) · ${all.length}건`),
      all.length ? h('div', { class: 'v-list-body' }, ...groups) : h('div', { class: 'muted v-list-body' }, '기준 서열과 다른 곳이 없습니다.'),
    );
  }
}
