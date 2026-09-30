// "한눈에 보기" panel: summary chips, the glance canvas with hover/click, and the variant list.
import { computePairStats, pct, sameResidue } from '../core/stats';
import { callVariants, type RowVariants, type Variant, type VariantKind } from '../core/variants';
import { colToX, drawGlance, readGlanceColors, snippet, xToCol, yToRow, type GlanceLayout, type GlanceRowSummary } from '../render/glance';
import type { RenderModel } from '../render/model';
import { download, h } from './dom';

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
  private layout: GlanceLayout | null = null;
  private variants: RowVariants[] = [];
  private refRow = 0;
  private filter: VariantKind | 'all' = 'all';
  private canvas: HTMLCanvasElement;
  private cross: HTMLDivElement;
  private canvasWrap: HTMLDivElement;
  private summaryEl: HTMLDivElement;
  private listEl: HTMLDivElement;

  constructor(
    private host: HTMLElement,
    private tooltip: HTMLElement,
    private cb: GlanceCallbacks,
  ) {
    this.summaryEl = h('div', { class: 'glance-summary' });
    this.canvas = h('canvas', { class: 'glance-canvas', role: 'img', 'aria-label': '정렬 전체 요약 지도' });
    this.cross = h('div', { class: 'glance-cross', hidden: true });
    this.canvasWrap = h('div', { class: 'glance-canvas-wrap' }, this.canvas, this.cross);
    this.listEl = h('div', { class: 'variant-list' });
    host.replaceChildren(this.summaryEl, this.canvasWrap, legend(), this.listEl);
    host.classList.add('glance');
    this.canvas.addEventListener('mousemove', (e) => this.onMove(e));
    this.canvas.addEventListener('mouseleave', () => this.hideTip());
    this.canvas.addEventListener('click', (e) => this.onClick(e));
  }

  setModel(m: RenderModel | null): void {
    this.model = m;
    if (!m) return;
    this.refRow = m.refRow >= 0 ? m.refRow : m.aln.referenceIndex;
    this.variants = callVariants(m.aln.rows, this.refRow, m.nucleotide, m.scoring);
    this.render();
  }

  /** Redraw at the current width (after resize or theme change). */
  render(): void {
    const m = this.model;
    if (!m || this.host.hidden) return;
    const width = this.canvasWrap.clientWidth;
    if (width <= 0) return;
    const ref = m.aln.rows[this.refRow];
    const summaries: GlanceRowSummary[] = m.aln.rows.map((r, i) => {
      if (i === this.refRow) return { row: i, identity: null, text: '' };
      const st = computePairStats(ref.aligned, r.aligned, ref, r, m.aln.seqType, m.scoring);
      const c = this.variants.find((x) => x.row === i)?.counts;
      const parts = c ? [c.sub && `치환 ${c.sub}`, c.ins && `삽입 ${c.ins}`, c.del && `결실 ${c.del}`, c.amb && `모호 ${c.amb}`].filter(Boolean) : [];
      return { row: i, identity: st.overlapColumns ? pct(st.identical, st.overlapColumns) : null, text: parts.length ? parts.join(' · ') : st.overlapColumns ? '차이 없음' : '겹침 없음' };
    });
    this.layout = drawGlance(this.canvas, m, this.refRow, this.variants, summaries, width, readGlanceColors(this.canvas));
    this.renderSummary(summaries);
    this.renderList(summaries);
  }

  private renderSummary(summaries: GlanceRowSummary[]): void {
    const m = this.model!;
    const tot: Record<VariantKind, number> = { sub: 0, ins: 0, del: 0, amb: 0 };
    for (const rv of this.variants) for (const k of Object.keys(tot) as VariantKind[]) tot[k] += rv.counts[k];
    const ids = summaries.filter((s) => s.identity !== null).map((s) => s.identity!);
    const minId = ids.length ? Math.min(...ids) : null;
    const lowest = minId === null ? null : summaries.find((s) => s.identity === minId);
    const chip = (label: string, value: string, cls = '') => h('span', { class: `g-chip ${cls}` }, h('b', null, value), label);
    const saveBtn = h('button', { type: 'button', class: 'btn small', title: '이 지도를 PNG 이미지로 저장', onclick: () => this.savePNG() }, '지도 PNG');
    const nodes = [
      h('span', { class: 'g-ref' }, '기준 ', h('b', null, m.aln.rows[this.refRow].name)),
      chip('서열', String(m.aln.rows.length)),
      chip('정렬 열', m.rows[0].length.toLocaleString()),
      chip('치환', String(tot.sub), 'k-sub'),
      chip('삽입', String(tot.ins), 'k-indel'),
      chip('결실', String(tot.del), 'k-indel'),
      tot.amb ? chip('모호', String(tot.amb), 'k-amb') : null,
      lowest && m.aln.rows.length > 2 ? h('span', { class: 'g-note' }, `가장 다른 서열: ${m.aln.rows[lowest.row].name} (${minId!.toFixed(1)}%)`) : null,
      h('span', { class: 'spacer' }),
      saveBtn,
    ];
    this.summaryEl.replaceChildren(...nodes.filter((n): n is HTMLElement => n !== null));
  }

  private savePNG(): void {
    const src = this.canvas;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = readGlanceColors(src).surface;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    out.toBlob((blob) => {
      if (blob) download(`alignment_glance_${new Date().toISOString().slice(0, 10)}.png`, blob, 'image/png');
    }, 'image/png');
  }

  private renderList(summaries: GlanceRowSummary[]): void {
    const m = this.model!;
    const kinds: (VariantKind | 'all')[] = ['all', 'sub', 'ins', 'del', 'amb'];
    const count = (k: VariantKind | 'all') => this.variants.reduce((n, rv) => n + (k === 'all' ? rv.variants.length : rv.counts[k]), 0);
    const filters = h(
      'div',
      { class: 'variant-filters', role: 'group', 'aria-label': '변이 종류 필터' },
      ...kinds
        .filter((k) => k === 'all' || count(k) > 0)
        .map((k) =>
          h(
            'button',
            {
              type: 'button',
              class: `vf${this.filter === k ? ' on' : ''}`,
              'aria-pressed': this.filter === k ? 'true' : 'false',
              onclick: () => {
                this.filter = k;
                this.renderList(summaries);
              },
            },
            `${k === 'all' ? '전체' : KIND_LABEL[k]} ${count(k)}`,
          ),
        ),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn small', onclick: () => this.exportCSV(), title: '변이 목록을 CSV 로 저장' }, '변이 목록 CSV'),
    );
    const groups = this.variants.map((rv) => {
      const row = m.aln.rows[rv.row];
      const list = rv.variants.filter((v) => this.filter === 'all' || v.kind === this.filter);
      const s = summaries.find((x) => x.row === rv.row);
      const LIMIT = 300;
      const items = list.slice(0, LIMIT).map((v) =>
        h(
          'button',
          { type: 'button', class: `v-item k-${v.kind}${v.subClass ? ` s-${v.subClass}` : ''}`, onclick: () => this.cb.jumpTo(v.col0), title: '상세 보기에서 이 위치로 이동' },
          h('span', { class: 'v-badge' }, v.kind === 'sub' ? SUB_LABEL[v.subClass!] : KIND_LABEL[v.kind]),
          h('code', { class: 'v-label' }, v.label),
          v.kind === 'ins' || v.kind === 'del' ? h('span', { class: 'v-len' }, `${(v.kind === 'ins' ? v.alt : v.ref).length}${m.nucleotide ? ' nt' : ' aa'}`) : null,
        ),
      );
      return h(
        'details',
        { class: 'v-group', open: list.length > 0 && list.length <= 60 },
        h(
          'summary',
          null,
          h('b', null, row.name),
          row.strand === -1 ? h('span', { class: 'v-rc' }, 'rc') : null,
          h('span', { class: 'muted' }, ` ${s?.identity !== null && s?.identity !== undefined ? `${s.identity.toFixed(1)}% · ` : ''}${list.length ? `${list.length}건` : '해당 변이 없음'}`),
        ),
        list.length ? h('div', { class: 'v-items' }, ...items, list.length > LIMIT ? h('span', { class: 'muted' }, `외 ${list.length - LIMIT}건 (CSV 로 전체 확인)`) : null) : null,
      );
    });
    this.listEl.replaceChildren(
      h('div', { class: 'variant-head' }, h('b', null, `변이 목록 (기준: ${m.aln.rows[this.refRow].name} 좌표)`), h('span', { class: 'muted' }, ' — 항목을 누르면 상세 보기의 해당 위치로 이동합니다')),
      filters,
      ...groups,
    );
  }

  private exportCSV(): void {
    const m = this.model;
    if (!m) return;
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ['sequence,strand,type,class,label,ref_start,ref_end,ref,alt,alignment_col_start,alignment_col_end'];
    for (const rv of this.variants) {
      const row = m.aln.rows[rv.row];
      for (const v of rv.variants)
        lines.push([q(row.name), row.strand === 1 ? '+' : '-', v.kind, v.subClass ?? '', q(v.label), v.refStart, v.refEnd, v.ref, v.alt, v.col0 + 1, v.col1 + 1].join(','));
    }
    download(`variants_vs_${m.aln.rows[this.refRow].name.replace(/[^\w.-]+/g, '_')}.csv`, '﻿' + lines.join('\n'), 'text/csv');
  }

  private hideTip(): void {
    this.tooltip.hidden = true;
    this.cross.hidden = true;
  }

  private nearestVariant(r: number, c: number): Variant | null {
    const g = this.layout!;
    const tol = Math.max(1, Math.ceil((4 / g.plotW) * g.L));
    let best: Variant | null = null;
    let bd = Infinity;
    for (const v of this.variants.find((x) => x.row === r)?.variants ?? []) {
      const d = c < v.col0 ? v.col0 - c : c > v.col1 ? c - v.col1 : 0;
      if (d <= tol && d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  private locate(e: MouseEvent): { c: number; r: number | null } | null {
    const g = this.layout;
    const m = this.model;
    if (!g || !m) return null;
    const rect = this.canvas.getBoundingClientRect();
    const c = xToCol(g, e.clientX - rect.left);
    if (c === null) return null;
    return { c, r: yToRow(g, e.clientY - rect.top, m.rows.length) };
  }

  private onClick(e: MouseEvent): void {
    const loc = this.locate(e);
    if (!loc) return;
    const v = loc.r !== null && loc.r >= 0 ? this.nearestVariant(loc.r, loc.c) : null;
    this.cb.jumpTo(v ? v.col0 : loc.c);
  }

  private onMove(e: MouseEvent): void {
    const loc = this.locate(e);
    const m = this.model;
    const g = this.layout;
    if (!loc || !m || !g) return this.hideTip();
    const { c, r } = loc;
    this.cross.hidden = false;
    this.cross.style.left = `${colToX(g, c)}px`;
    this.cross.style.top = `${g.profileTop}px`;
    this.cross.style.height = `${g.height - g.profileTop}px`;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const refNum = m.rows[this.refRow][c] === '-' ? null : residueNum(m, this.refRow, c);
    const parts: string[] = [`<div class="tt-head">${refNum !== null ? `${esc(m.aln.rows[this.refRow].name)} #${refNum}` : '기준 서열에 없는 위치 (삽입 또는 overhang)'} · 열 ${c + 1}</div>`];
    if (r === -1 || r === null) {
      const v = g.profile[c];
      parts.push(`<div>구간 일치도 <b>${Number.isNaN(v) ? '–' : `${v.toFixed(1)}%`}</b> <span class="tt-sub">(주변 ${g.window}열 평균)</span></div>`);
    } else {
      const row = m.aln.rows[r];
      const sn = snippet(m, this.refRow, r, c);
      const line = (chars: string[], isRef: boolean) =>
        chars
          .map((ch, k) => {
            const col = sn.cols[k];
            const other = isRef ? sn.row[k] : sn.ref[k];
            const diff = ch !== '-' && other !== '-' && !sameResidue(ch, other, m.nucleotide);
            const gap = (ch === '-') !== (other === '-');
            const cls = [col === c ? 'cur' : '', diff ? 'diff' : gap ? 'gap' : ''].filter(Boolean).join(' ');
            return `<span${cls ? ` class="${cls}"` : ''}>${esc(ch)}</span>`;
          })
          .join('');
      if (r !== this.refRow) {
        parts.push(
          `<div class="tt-snip"><div><i>기준</i>${line(sn.ref, true)}</div><div><i>${esc(row.name.slice(0, 10))}</i>${line(sn.row, false)}</div></div>`,
        );
        const v = this.nearestVariant(r, c);
        if (v) parts.push(`<div class="tt-var"><b>${esc(v.label)}</b> · ${v.kind === 'sub' ? SUB_LABEL[v.subClass!] : KIND_LABEL[v.kind]}</div>`);
        parts.push('<div class="tt-sub">클릭하면 상세 보기의 이 위치로 이동</div>');
      } else {
        parts.push(`<div><b>${esc(row.name)}</b> (비교 기준)</div>`);
      }
    }
    this.tooltip.innerHTML = parts.join('');
    this.tooltip.hidden = false;
    const tw = this.tooltip.offsetWidth;
    const th = this.tooltip.offsetHeight;
    let left = e.clientX + 14;
    let top = e.clientY + 16;
    if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 14;
    if (top + th > window.innerHeight - 8) top = e.clientY - th - 12;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }
}

function residueNum(m: RenderModel, r: number, c: number): number {
  const row = m.aln.rows[r];
  const k = m.prefixes[r][c] + 1;
  return row.strand === 1 ? row.start + k - 1 : row.start - (k - 1);
}

/** Legend drawn with the same shapes the map uses, so meaning never rests on colour alone. */
function legend(): HTMLElement {
  const svg = (inner: string) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '22');
    s.setAttribute('height', '16');
    s.setAttribute('viewBox', '0 0 22 16');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = inner;
    return s;
  };
  const bar = '<rect x="0" y="5" width="22" height="6" fill="var(--g-match)" fill-opacity="0.38"/>';
  const item = (icon: SVGElement, label: string) => h('span', { class: 'g-lg-item' }, icon, label);
  return h(
    'div',
    { class: 'glance-legend' },
    item(svg(bar), '정렬된 구간'),
    item(svg(`${bar}<rect x="9" y="1" width="4" height="14" fill="var(--g-mismatch)"/>`), '치환 (transversion · 비보존적)'),
    item(svg(`${bar}<rect x="9" y="4" width="4" height="8" fill="var(--g-similar)"/>`), '유사 치환 (transition · 보존적)'),
    item(svg(`${bar}<path d="M6 0 H16 L11 5 Z" fill="var(--g-indel)"/>`), '삽입 ▼'),
    item(svg('<rect x="0" y="5" width="6" height="6" fill="var(--g-match)" fill-opacity="0.38"/><rect x="16" y="5" width="6" height="6" fill="var(--g-match)" fill-opacity="0.38"/><rect x="6" y="13" width="10" height="2" fill="var(--g-indel)"/><rect x="6" y="5" width="1.5" height="10" fill="var(--g-indel)"/><rect x="14.5" y="5" width="1.5" height="10" fill="var(--g-indel)"/>'), '결실 (끊긴 구간)'),
    item(svg(`${bar}<rect x="9" y="4" width="4" height="8" fill="var(--g-amb)"/>`), '모호 염기 (N 등)'),
  );
}
