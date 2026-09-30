// DOM viewer: lazily renders wrapped blocks as they scroll into view, and shows a
// hover tooltip + column highlight.
import { AA_CLASS_LABEL, AA_CLASS, KYTE_DOOLITTLE, NUC_NAMES, RESIDUE_NAMES } from '../core/properties';
import { CATEGORY_LABEL } from '../ui/state';
import { categorize, residueAt, type RenderModel } from './model';
import { blockRange, blockSVG, cellAt, cellX, computeGeometry, type Geometry } from './svg';

export class AlignmentViewer {
  private model: RenderModel | null = null;
  geo: Geometry | null = null;
  private blocks: HTMLDivElement[] = [];
  private rendered = new Set<number>();
  private observer: IntersectionObserver | null = null;
  private hl: HTMLDivElement;
  onViewportChange: ((range: [number, number]) => void) | null = null;

  constructor(
    private scroller: HTMLElement,
    private inner: HTMLElement,
    private tooltip: HTMLElement,
  ) {
    this.hl = document.createElement('div');
    this.hl.className = 'col-hl';
    this.inner.addEventListener('mousemove', (e) => this.onMove(e));
    this.inner.addEventListener('mouseleave', () => this.hideTip());
    this.scroller.addEventListener('scroll', () => this.emitViewport(), { passive: true });
  }

  setModel(m: RenderModel | null): void {
    this.model = m;
    this.rebuild();
  }

  get availableWidth(): number {
    return this.scroller.clientWidth - 24;
  }

  rebuild(): void {
    this.observer?.disconnect();
    this.inner.replaceChildren();
    this.blocks = [];
    this.rendered.clear();
    const m = this.model;
    if (!m) {
      this.geo = null;
      return;
    }
    const geo = computeGeometry(m, this.availableWidth);
    this.geo = geo;
    this.inner.style.background = m.view.paperColor;
    this.inner.classList.toggle('block-sep', m.view.blockSeparator);
    this.inner.style.setProperty('--block-gap', `${Math.max(0, m.view.blockGap)}px`);
    this.inner.style.setProperty('--block-sep-color', m.view.mutedColor);
    this.inner.style.width = `${geo.width + 24}px`;
    const frag = document.createDocumentFragment();
    for (let b = 0; b < geo.nBlocks; b++) {
      const div = document.createElement('div');
      div.className = 'block';
      div.dataset.b = String(b);
      div.style.height = `${geo.blockH}px`;
      div.style.marginBottom = b === geo.nBlocks - 1 ? '0' : `${m.view.blockGap}px`;
      frag.appendChild(div);
      this.blocks.push(div);
    }
    this.inner.appendChild(frag);
    const renderBlock = (b: number) => {
      if (this.rendered.has(b) || !this.geo || !this.model) return;
      this.rendered.add(b);
      this.blocks[b].innerHTML = blockSVG(this.geo, this.model, b);
    };
    if (typeof IntersectionObserver === 'undefined' || geo.nBlocks <= 12) {
      for (let b = 0; b < geo.nBlocks; b++) renderBlock(b);
    } else {
      this.observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) renderBlock(Number((e.target as HTMLElement).dataset.b));
        },
        { root: this.scroller, rootMargin: '800px 0px' },
      );
      this.blocks.forEach((d) => this.observer!.observe(d));
    }
    requestAnimationFrame(() => this.emitViewport());
  }

  /** Alignment columns currently visible in the scroll pane. */
  visibleRange(): [number, number] | null {
    const m = this.model;
    const geo = this.geo;
    if (!m || !geo) return null;
    const top = this.scroller.scrollTop;
    const bottom = top + this.scroller.clientHeight;
    const pad = 12; // inner padding
    const bFirst = Math.max(0, Math.floor((top - pad) / geo.blockStep));
    const bLast = Math.min(geo.nBlocks - 1, Math.floor((bottom - pad) / geo.blockStep));
    return [blockRange(geo, m, bFirst)[0], blockRange(geo, m, Math.max(bFirst, bLast))[1]];
  }

  private emitViewport(): void {
    const r = this.visibleRange();
    if (r && this.onViewportChange) this.onViewportChange(r);
  }

  scrollToColumn(c: number): void {
    const m = this.model;
    const geo = this.geo;
    if (!m || !geo) return;
    const b = Math.max(0, Math.min(geo.nBlocks - 1, Math.floor((c - m.c0) / geo.perLine)));
    this.scroller.scrollTo({ top: b * geo.blockStep, behavior: 'smooth' });
    this.flashColumn(b, c);
  }

  private flashColumn(b: number, c: number): void {
    const m = this.model;
    const geo = this.geo;
    if (!m || !geo) return;
    const k = c - blockRange(geo, m, b)[0];
    const div = document.createElement('div');
    div.className = 'col-flash';
    div.style.left = `${cellX(geo, m, k)}px`;
    div.style.width = `${geo.tileW}px`;
    this.blocks[b]?.appendChild(div);
    setTimeout(() => div.remove(), 1600);
  }

  private hideTip(): void {
    this.tooltip.hidden = true;
    this.hl.remove();
  }

  private onMove(e: MouseEvent): void {
    const m = this.model;
    const geo = this.geo;
    const block = (e.target as HTMLElement).closest?.('.block') as HTMLDivElement | null;
    if (!m || !geo || !block) return this.hideTip();
    const b = Number(block.dataset.b);
    const rect = block.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const [s, end] = blockRange(geo, m, b);
    const k = cellAt(geo, m, x, end - s);
    const ry = y - geo.rulerH;
    const r = ry >= 0 ? Math.floor(ry / geo.rowStep) : -1;
    const inRow = r >= 0 && r < m.rows.length && ry - r * geo.rowStep <= geo.cellH;
    if (k < 0) return this.hideTip();
    const c = s + k;
    // column highlight
    this.hl.style.left = `${cellX(geo, m, k)}px`;
    this.hl.style.width = `${geo.tileW}px`;
    if (this.hl.parentElement !== block) block.appendChild(this.hl);
    this.tooltip.innerHTML = this.tipHTML(c, inRow ? r : -1);
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

  private tipHTML(c: number, r: number): string {
    const m = this.model!;
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const lines: string[] = [];
    const cons = m.cols.consensus[c];
    const frac = Math.round(m.cols.consensusFrac[c] * 100);
    lines.push(`<div class="tt-head">Column ${c + 1}${m.refRow >= 0 && residueAt(m, m.refRow, c) !== null ? ` · ${esc(m.aln.rows[m.refRow].name)} #${residueAt(m, m.refRow, c)}` : ''}</div>`);
    if (r >= 0) {
      const row = m.aln.rows[r];
      const ch = m.rows[r][c];
      if (ch === '-') {
        lines.push(`<div><b>${esc(row.name)}</b>: gap</div>`);
      } else {
        const name = m.nucleotide ? NUC_NAMES[ch] : RESIDUE_NAMES[ch];
        lines.push(`<div><b>${esc(row.name)}</b>: <span class="tt-res">${esc(ch)}</span> #${residueAt(m, r, c)}${row.strand === -1 ? ' (rc)' : ''}</div>`);
        if (name) lines.push(`<div class="tt-sub">${esc(name)}</div>`);
        if (!m.nucleotide && AA_CLASS[ch])
          lines.push(`<div class="tt-sub">${esc(AA_CLASS_LABEL[AA_CLASS[ch]])} · KD ${KYTE_DOOLITTLE[ch].toFixed(1)}</div>`);
      }
      if (m.view.highlight === 'identity') {
        const cat = categorize(m, r, c);
        if (cat !== 'plain' && cat !== 'terminal')
          lines.push(`<div class="tt-cat"><i style="background:${m.view.colors[cat].bg || 'transparent'}"></i>${CATEGORY_LABEL[cat]}</div>`);
      }
    }
    lines.push(`<div class="tt-sub">Consensus ${cons === '-' ? 'gap' : esc(cons)} · ${frac}% · gap ${Math.round(m.cols.gapFrac[c] * 100)}%${m.cols.symbols[c] !== ' ' ? ` · '${m.cols.symbols[c]}'` : ''}</div>`);
    return lines.join('');
  }
}
