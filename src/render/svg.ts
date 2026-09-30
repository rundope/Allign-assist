// Geometry and SVG generation for wrapped alignment blocks.
// Each glyph is positioned explicitly (x list + text-anchor="middle"), so any font —
// monospace or proportional — lines up exactly on the column grid.
import { categorize, cellStyle, residueNumber, traceAt, type RenderModel } from './model';

/** Underline colour for low-quality chromatogram calls (orange: distinct from the category colours). */
export const LOW_QV_COLOR = '#f08c00';

export interface Geometry {
  font: string;
  fontSize: number;
  smallSize: number;
  tileW: number;
  cellW: number;
  cellH: number;
  rowStep: number;
  nameW: number;
  numW: number;
  x0: number; // x of the first cell
  perLine: number;
  rulerH: number;
  traceH: number;
  extrasH: number;
  /** Per-block layout. Blocks differ in height: a chromatogram strip is only drawn in
   *  blocks where its read has base calls. */
  blocks: BlockGeo[];
  /** Height of all blocks stacked, block gaps included. */
  totalH: number;
  width: number;
  nBlocks: number;
  labels: string[];
}

export interface BlockGeo {
  /** Offset from the top of the first block. */
  top: number;
  h: number;
  /** Top of each sequence row, relative to the block top. */
  rowY: number[];
  /** Rows with a chromatogram strip right above them in this block. */
  traced: boolean[];
  /** Top of the consensus / symbol / % identity rows. */
  consensusY: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, font: string, fallbackPx: number): number {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureCtx) return text.length * fallbackPx * 0.62;
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  } catch {
    return text.length * fallbackPx * 0.62;
  }
}

export function truncateName(name: string, max: number): string {
  return name.length > max ? `${name.slice(0, Math.max(1, max - 1))}…` : name;
}

export function computeGeometry(m: RenderModel, availableWidth: number): Geometry {
  const v = m.view;
  const fs = v.fontSize;
  const font = `${v.fontWeight} ${fs}px ${v.fontFamily}`;
  const smallSize = Math.max(8, Math.round(fs * 0.72));
  let charW = 0;
  for (const ch of 'ACDEFGHIKLMNPQRSTVWY*-.') charW = Math.max(charW, measure(ch, font, fs));
  const tileW = Math.ceil(charW + Math.max(2, fs * 0.18));
  const cellW = tileW + Math.max(0, v.columnGap);
  const cellH = Math.round(fs * 1.45);
  const rowStep = cellH + Math.max(0, v.rowGap);
  const labels = m.aln.rows.map((r) => truncateName(r.strand === -1 ? `${r.name} (rc)` : r.name, v.nameMaxChars));
  const extraLabels = [v.showConsensus ? 'Consensus' : ''];
  const nameW = v.showNames ? Math.ceil(Math.max(...[...labels, ...extraLabels].map((l) => measure(l, font, fs)))) + 14 : 0;
  const maxNum = Math.max(...m.aln.rows.map((r) => Math.max(r.start, r.length)), m.rows[0]?.length ?? 0);
  const numW = v.showNumbers ? Math.ceil(measure(String(maxNum), `${smallSize}px ${v.fontFamily}`, smallSize)) + 12 : 6;
  const x0 = nameW + numW;
  const visible = m.c1 - m.c0;
  const g = v.groupSize > 0 ? v.groupSize : 0;
  const groupGap = g ? Math.max(0, v.groupGap) : 0;
  let perLine = v.residuesPerLine;
  if (!perLine || perLine <= 0) {
    const avail = Math.max(100, availableWidth - x0 - numW - 8);
    if (g) {
      const groups = Math.max(1, Math.floor((avail + groupGap) / (g * cellW + groupGap)));
      perLine = groups * g;
    } else {
      perLine = Math.max(10, Math.floor(avail / cellW));
    }
  }
  perLine = Math.max(1, Math.min(perLine, Math.max(1, visible)));
  const rulerH = v.showRuler ? Math.round(smallSize + 8) : 0;
  const N = m.rows.length;
  const rowGap = Math.max(0, v.rowGap);
  let extrasH = 0;
  if (v.showConsensus) extrasH += rowStep;
  if (v.showSymbols) extrasH += Math.round(cellH * 0.8) + rowGap;
  if (v.showConservation) extrasH += Math.round(cellH * 1.2) + rowGap;
  // columns between the first and last residue backed by a base call, per row with a trace
  const traceH = Math.max(16, Math.round(v.traceHeight));
  const callSpan = m.rows.map((_, r): [number, number] | null => {
    if (!v.showTraces || !m.nucleotide || !m.traces?.[r]) return null;
    let lo = -1;
    let hi = -1;
    for (let c = m.c0; c < m.c1; c++)
      if (traceAt(m, r, c)) {
        if (lo < 0) lo = c;
        hi = c;
      }
    return lo < 0 ? null : [lo, hi];
  });
  const nBlocks = Math.max(1, Math.ceil(visible / perLine));
  const blocks: BlockGeo[] = [];
  let top = 0;
  for (let b = 0; b < nBlocks; b++) {
    const s = m.c0 + b * perLine;
    const e = Math.min(m.c1, s + perLine);
    const traced = callSpan.map((span) => span !== null && span[0] < e && span[1] >= s);
    const rowY: number[] = [];
    let y = rulerH;
    for (let r = 0; r < N; r++) {
      if (traced[r]) y += traceH;
      rowY.push(y);
      y += cellH + (r < N - 1 ? rowGap : 0);
    }
    const h = y + (extrasH ? rowGap + extrasH : 0);
    blocks.push({ top, h, rowY, traced, consensusY: y + rowGap });
    top += h + Math.max(0, v.blockGap);
  }
  const lineW = cellsWidth(perLine, cellW, g, groupGap);
  return {
    font,
    fontSize: fs,
    smallSize,
    tileW,
    cellW,
    cellH,
    rowStep,
    nameW,
    numW,
    x0,
    perLine,
    rulerH,
    traceH,
    extrasH,
    blocks,
    totalH: top - Math.max(0, v.blockGap),
    width: Math.ceil(x0 + lineW + numW + 4),
    nBlocks,
    labels,
  };
}

function cellsWidth(n: number, cellW: number, g: number, groupGap: number): number {
  if (n <= 0) return 0;
  const groups = g ? Math.floor((n - 1) / g) : 0;
  return n * cellW + groups * groupGap;
}

/** x of the left edge of the k-th cell (0-based within the block). */
export function cellX(geo: Geometry, m: RenderModel, k: number): number {
  const g = m.view.groupSize > 0 ? m.view.groupSize : 0;
  return geo.x0 + k * geo.cellW + (g ? Math.floor(k / g) * Math.max(0, m.view.groupGap) : 0);
}

/** Inverse of cellX: cell index at local x, or -1 when on a group gap / outside. */
export function cellAt(geo: Geometry, m: RenderModel, x: number, count: number): number {
  const g = m.view.groupSize > 0 ? m.view.groupSize : 0;
  const rel = x - geo.x0;
  if (rel < 0) return -1;
  let k: number;
  if (g) {
    const span = g * geo.cellW + Math.max(0, m.view.groupGap);
    const gi = Math.floor(rel / span);
    const within = rel - gi * span;
    if (within >= g * geo.cellW) return -1;
    k = gi * g + Math.floor(within / geo.cellW);
  } else {
    k = Math.floor(rel / geo.cellW);
  }
  return k < count ? k : -1;
}

export function blockRange(geo: Geometry, m: RenderModel, b: number): [number, number] {
  const s = m.c0 + b * geo.perLine;
  return [s, Math.min(m.c1, s + geo.perLine)];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** Inner SVG markup (no <svg> wrapper) for block b, drawn at y = 0. */
export function blockContent(geo: Geometry, m: RenderModel, b: number): string {
  const v = m.view;
  const [s, e] = blockRange(geo, m, b);
  const bg = geo.blocks[b];
  const count = e - s;
  const out: string[] = [];
  const merge = v.columnGap <= 0;
  const fam = esc(v.fontFamily);
  const textAttrs = `font-family="${fam}" font-size="${geo.fontSize}" font-weight="${v.fontWeight}" text-anchor="middle" dominant-baseline="central"`;
  const xs: number[] = [];
  for (let k = 0; k < count; k++) xs.push(cellX(geo, m, k) + geo.tileW / 2);

  // ---- ruler ----
  if (v.showRuler) {
    const ticks: string[] = [];
    const labels: string[] = [];
    const baseY = geo.rulerH - 3;
    const refRow = v.rulerMode === 'reference' && m.refRow >= 0 ? m.refRow : -1;
    for (let k = 0; k < count; k++) {
      const c = s + k;
      let n: number | null;
      if (refRow >= 0) {
        if (m.rows[refRow][c] === '-') continue;
        const pos = residueNumber(m, refRow, m.prefixes[refRow][c] + 1);
        n = pos % 10 === 0 ? pos : null;
      } else {
        n = (c + 1) % 10 === 0 ? c + 1 : null;
      }
      if (n === null) continue;
      const x = xs[k];
      ticks.push(`M${f1(x)} ${baseY - 3}V${baseY}`);
      labels.push(`<text x="${f1(x)}" y="${baseY - 5}" text-anchor="middle">${n}</text>`);
    }
    if (ticks.length) out.push(`<path d="${ticks.join('')}" stroke="${v.mutedColor}" stroke-width="1"/>`);
    if (labels.length)
      out.push(`<g font-family="${fam}" font-size="${geo.smallSize}" fill="${v.mutedColor}">${labels.join('')}</g>`);
  }

  // ---- sequence rows ----
  for (let r = 0; r < m.rows.length; r++) {
    const y = bg.rowY[r];
    if (bg.traced[r]) out.push(traceTrack(geo, m, r, y, s, count, xs));
    const cy = y + geo.cellH / 2;
    if (v.showNames)
      out.push(
        `<text x="4" y="${f1(cy)}" font-family="${fam}" font-size="${geo.fontSize}" font-weight="${r === m.refRow ? 'bold' : v.fontWeight}" dominant-baseline="central" fill="${v.textColor}">${esc(geo.labels[r])}</text>`,
      );
    const rects: string[] = [];
    const spans: string[] = [];
    let runBg = '';
    let runStart = 0;
    let runEnd = 0;
    let spanFg = '';
    let spanChars = '';
    let spanXs: string[] = [];
    const flushRect = () => {
      if (runBg) rects.push(`<rect x="${f1(runStart)}" y="${y}" width="${f1(runEnd - runStart)}" height="${geo.cellH}" fill="${runBg}"/>`);
      runBg = '';
    };
    const flushSpan = () => {
      if (spanChars.trim()) spans.push(`<tspan fill="${spanFg}" x="${spanXs.join(' ')}">${esc(spanChars)}</tspan>`);
      spanChars = '';
      spanXs = [];
    };
    for (let k = 0; k < count; k++) {
      const st = cellStyle(m, r, s + k);
      const x = cellX(geo, m, k);
      if (st.bg) {
        if (merge && runBg === st.bg && Math.abs(runEnd - x) < 0.01) runEnd = x + geo.tileW;
        else {
          flushRect();
          runBg = st.bg;
          runStart = x;
          runEnd = x + geo.tileW;
        }
      } else flushRect();
      if (st.ch !== ' ') {
        if (st.fg !== spanFg) {
          flushSpan();
          spanFg = st.fg;
        }
        spanChars += st.ch;
        spanXs.push(f1(xs[k]));
      }
    }
    flushRect();
    flushSpan();
    out.push(...rects);
    if (spans.length) out.push(`<text y="${f1(cy)}" ${textAttrs}>${spans.join('')}</text>`);
    // dotted underline under residues whose chromatogram quality is below the threshold
    const tr = m.traces?.[r];
    if (tr && v.showLowQuality && tr.chrom.quality.length) {
      const segs: string[] = [];
      for (let k = 0; k < count; k++) {
        const hit = traceAt(m, r, s + k);
        if (!hit) continue;
        const q = tr.chrom.quality[hit.idx];
        if (q !== undefined && q < v.qualityThreshold) {
          const x = cellX(geo, m, k);
          segs.push(`M${f1(x + 1)} ${f1(y + geo.cellH - 1.5)}H${f1(x + geo.tileW - 1)}`);
        }
      }
      if (segs.length) out.push(`<path d="${segs.join('')}" stroke="${LOW_QV_COLOR}" stroke-width="2.2" stroke-dasharray="2 1.6"/>`);
    }
    if (v.showNumbers) {
      const p = m.prefixes[r];
      const before = p[s];
      const through = p[e];
      if (through > before) {
        const nf = `font-family="${fam}" font-size="${geo.smallSize}" fill="${v.mutedColor}" dominant-baseline="central"`;
        out.push(`<text x="${geo.x0 - 6}" y="${f1(cy)}" text-anchor="end" ${nf}>${residueNumber(m, r, before + 1)}</text>`);
        const xr = cellX(geo, m, count - 1) + geo.tileW + 6;
        out.push(`<text x="${f1(xr)}" y="${f1(cy)}" ${nf}>${residueNumber(m, r, through)}</text>`);
      }
    }
  }

  // ---- consensus / symbols / conservation ----
  let y = bg.consensusY;
  if (v.showConsensus) {
    const cy = y + geo.cellH / 2;
    if (v.showNames)
      out.push(`<text x="4" y="${f1(cy)}" font-family="${fam}" font-size="${geo.fontSize}" font-style="italic" dominant-baseline="central" fill="${v.mutedColor}">Consensus</text>`);
    let chars = '';
    const cx: string[] = [];
    for (let k = 0; k < count; k++) {
      const c = s + k;
      const cons = m.cols.consensus[c];
      if (cons === '-') continue;
      chars += m.cols.consensusFrac[c] > 0.5 ? cons : cons.toLowerCase();
      cx.push(f1(xs[k]));
    }
    if (chars) out.push(`<text y="${f1(cy)}" ${textAttrs} fill="${v.mutedColor}"><tspan x="${cx.join(' ')}">${esc(chars)}</tspan></text>`);
    y += geo.rowStep;
  }
  if (v.showSymbols) {
    const h = Math.round(geo.cellH * 0.8);
    let chars = '';
    const cx: string[] = [];
    for (let k = 0; k < count; k++) {
      const sym = m.cols.symbols[s + k];
      if (sym === ' ') continue;
      chars += sym;
      cx.push(f1(xs[k]));
    }
    if (chars)
      out.push(`<text y="${f1(y + h / 2)}" ${textAttrs} font-weight="bold" fill="${v.textColor}"><tspan x="${cx.join(' ')}">${esc(chars)}</tspan></text>`);
    y += h + Math.max(0, v.rowGap);
  }
  if (v.showConservation) {
    const h = Math.round(geo.cellH * 1.2);
    const bars: string[] = [];
    for (let k = 0; k < count; k++) {
      const f = m.cols.consensusFrac[s + k];
      if (f <= 0) continue;
      const bh = Math.max(1, f * h);
      bars.push(`<rect x="${f1(cellX(geo, m, k))}" y="${f1(y + h - bh)}" width="${geo.tileW}" height="${f1(bh)}"/>`);
    }
    if (v.showNames)
      out.push(`<text x="4" y="${f1(y + h / 2)}" font-family="${fam}" font-size="${geo.smallSize}" font-style="italic" dominant-baseline="central" fill="${v.mutedColor}">% identity</text>`);
    out.push(`<g fill="${v.conservationColor}" fill-opacity="0.75">${bars.join('')}</g>`);
  }
  return out.join('');
}

/** Chromatogram channel colours (G is drawn in the view's text colour). */
export const TRACE_COLOR = { A: '#1a9850', C: '#2166ac', T: '#d7301f' } as const;
const COMP: Record<string, 'A' | 'C' | 'G' | 'T'> = { A: 'T', C: 'G', G: 'C', T: 'A' };
const peakMax = new WeakMap<object, number>();

/**
 * Chromatogram strip right above row r. Every residue gets the stretch of trace that
 * belongs to its base call (halfway to the neighbouring peaks), squeezed into its column,
 * so the peaks line up with the letters below. Gaps and hand-typed bases stay empty.
 */
function traceTrack(geo: Geometry, m: RenderModel, r: number, rowTop: number, s: number, count: number, xs: number[]): string {
  const v = m.view;
  const tr = m.traces![r]!;
  const c = tr.chrom;
  const n = c.bases.length;
  const top = rowTop - geo.traceH;
  const base = rowTop - 2;
  const H = geo.traceH - 5;
  const out: string[] = [];
  const wins: ({ k: number; lo: number; hi: number; reverse: boolean } | null)[] = [];
  for (let k = 0; k < count; k++) {
    const hit = traceAt(m, r, s + k);
    if (!hit) {
      wins.push(null);
      continue;
    }
    const i = hit.idx;
    const p = c.peaks[i];
    const prev = i > 0 ? c.peaks[i - 1] : null;
    const next = i + 1 < n ? c.peaks[i + 1] : null;
    const halfL = prev !== null ? Math.abs(p - prev) / 2 : next !== null ? Math.abs(next - p) / 2 : 6;
    const halfR = next !== null ? Math.abs(next - p) / 2 : halfL;
    wins.push({ k, lo: p - halfL, hi: p + halfR, reverse: hit.reverse });
  }
  if (!wins.some(Boolean)) return '';
  // differences from the comparison target get a light band, so the peaks behind them stand out
  if (v.highlight === 'identity') {
    for (const w of wins) {
      if (!w) continue;
      const cat = categorize(m, r, s + w.k);
      if (cat !== 'mismatch' && cat !== 'similar' && cat !== 'indel') continue;
      const fill = v.colors[cat].bg || (cat === 'mismatch' ? '#e5484d' : cat === 'similar' ? '#f5b642' : '#8e4ec6');
      out.push(`<rect x="${f1(cellX(geo, m, w.k))}" y="${f1(top + 1)}" width="${geo.tileW}" height="${f1(geo.traceH - 1)}" fill="${fill}" fill-opacity="0.45"/>`);
    }
  }
  // height: the tallest peak in this block, but never below a fraction of the whole read's,
  // so a noisy stretch at the read end is not blown up to full height
  let whole = peakMax.get(c);
  if (whole === undefined) {
    whole = 1;
    for (const b of ['A', 'C', 'G', 'T'] as const) for (const x of c.channels[b]) if (x > whole) whole = x;
    peakMax.set(c, whole);
  }
  let ymax = whole * 0.2;
  for (const w of wins) {
    if (!w) continue;
    for (const b of ['A', 'C', 'G', 'T'] as const) {
      const ch = c.channels[b];
      for (let t = Math.max(0, Math.ceil(w.lo)); t <= Math.floor(w.hi) && t < ch.length; t++) if (ch[t] > ymax) ymax = ch[t];
    }
  }
  const Y = (val: number) => f1(base - (Math.max(0, val) / ymax) * H);
  const half = geo.cellW / 2;
  const g = v.groupSize > 0 && v.groupGap > 0 ? v.groupSize : 0;
  for (const b of ['A', 'C', 'G', 'T'] as const) {
    const ch = c.channels[b];
    let d = '';
    let prevK = -2;
    for (const w of wins) {
      if (!w) continue;
      const span = Math.max(1e-6, w.hi - w.lo);
      const cx = xs[w.k];
      // restart the line after a gap, a hand-typed base or a group gap
      let first = w.k !== prevK + 1 || (g > 0 && w.k % g === 0);
      for (let t = Math.max(0, Math.ceil(w.lo)); t <= Math.floor(w.hi) && t < ch.length; t++) {
        const f = (t - w.lo) / span;
        const x = w.reverse ? cx + half - f * geo.cellW : cx - half + f * geo.cellW;
        d += `${first ? 'M' : 'L'}${f1(x)} ${Y(ch[t])}`;
        first = false;
      }
      prevK = w.k;
    }
    if (!d) continue;
    const shown = wins.find(Boolean)!.reverse ? COMP[b] : b;
    const color = shown === 'G' ? v.textColor : TRACE_COLOR[shown];
    out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.1" stroke-linejoin="round"/>`);
  }
  const drawn = wins.filter(Boolean) as { k: number }[];
  const x0 = cellX(geo, m, drawn[0].k);
  const x1 = cellX(geo, m, drawn[drawn.length - 1].k) + geo.tileW;
  out.push(`<path d="M${f1(x0)} ${f1(base + 0.5)}H${f1(x1)}" stroke="${v.mutedColor}" stroke-opacity="0.35"/>`);
  if (v.showNames)
    out.push(`<text x="12" y="${f1(top + geo.traceH / 2)}" font-family="${esc(v.fontFamily)}" font-size="${geo.smallSize}" font-style="italic" dominant-baseline="central" fill="${v.mutedColor}">AB1</text>`);
  return out.join('');
}

export function blockSVG(geo: Geometry, m: RenderModel, b: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${geo.width}" height="${geo.blocks[b].h}" viewBox="0 0 ${geo.width} ${geo.blocks[b].h}">${blockContent(geo, m, b)}</svg>`;
}

/** One standalone SVG document with every block stacked (for export). */
export function fullSVG(geo: Geometry, m: RenderModel, title?: string): string {
  const pad = 16;
  const titleH = title ? geo.fontSize + 16 : 0;
  const height = pad * 2 + titleH + geo.totalH;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${geo.width + pad * 2}" height="${height}" viewBox="0 0 ${geo.width + pad * 2} ${height}">`);
  parts.push(`<rect width="100%" height="100%" fill="${m.view.paperColor}"/>`);
  if (title)
    parts.push(`<text x="${pad}" y="${pad + geo.fontSize}" font-family="${esc(m.view.fontFamily)}" font-size="${geo.fontSize}" font-weight="bold" fill="${m.view.textColor}">${esc(title)}</text>`);
  for (let b = 0; b < geo.nBlocks; b++) {
    const top = pad + titleH + geo.blocks[b].top;
    if (b > 0 && m.view.blockSeparator) {
      const y = f1(top - Math.max(0, m.view.blockGap) / 2);
      parts.push(`<line x1="${pad}" x2="${pad + geo.width}" y1="${y}" y2="${y}" stroke="${m.view.mutedColor}" stroke-opacity="0.6" stroke-dasharray="4 3"/>`);
    }
    parts.push(`<g transform="translate(${pad} ${top})">${blockContent(geo, m, b)}</g>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
