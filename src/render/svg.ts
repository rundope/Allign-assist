// Geometry and SVG generation for wrapped alignment blocks.
// Each glyph is positioned explicitly (x list + text-anchor="middle"), so any font —
// monospace or proportional — lines up exactly on the column grid.
import { cellStyle, residueNumber, type RenderModel } from './model';

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
  consensusY: number; // relative to rows end
  extrasH: number;
  blockH: number;
  blockStep: number;
  width: number;
  nBlocks: number;
  labels: string[];
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
  const rowsH = N * cellH + (N - 1) * Math.max(0, v.rowGap);
  let extrasH = 0;
  if (v.showConsensus) extrasH += rowStep;
  if (v.showSymbols) extrasH += Math.round(cellH * 0.8) + Math.max(0, v.rowGap);
  if (v.showConservation) extrasH += Math.round(cellH * 1.2) + Math.max(0, v.rowGap);
  const blockH = rulerH + rowsH + (extrasH ? Math.max(0, v.rowGap) + extrasH : 0);
  const blockStep = blockH + Math.max(0, v.blockGap);
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
    consensusY: rulerH + rowsH + Math.max(0, v.rowGap),
    extrasH,
    blockH,
    blockStep,
    width: Math.ceil(x0 + lineW + numW + 4),
    nBlocks: Math.max(1, Math.ceil(visible / perLine)),
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
    const y = geo.rulerH + r * geo.rowStep;
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
  let y = geo.consensusY;
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

export function blockSVG(geo: Geometry, m: RenderModel, b: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${geo.width}" height="${geo.blockH}" viewBox="0 0 ${geo.width} ${geo.blockH}">${blockContent(geo, m, b)}</svg>`;
}

/** One standalone SVG document with every block stacked (for export). */
export function fullSVG(geo: Geometry, m: RenderModel, title?: string): string {
  const pad = 16;
  const titleH = title ? geo.fontSize + 16 : 0;
  const height = pad * 2 + titleH + geo.nBlocks * geo.blockStep - m.view.blockGap;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${geo.width + pad * 2}" height="${height}" viewBox="0 0 ${geo.width + pad * 2} ${height}">`);
  parts.push(`<rect width="100%" height="100%" fill="${m.view.paperColor}"/>`);
  if (title)
    parts.push(`<text x="${pad}" y="${pad + geo.fontSize}" font-family="${esc(m.view.fontFamily)}" font-size="${geo.fontSize}" font-weight="bold" fill="${m.view.textColor}">${esc(title)}</text>`);
  for (let b = 0; b < geo.nBlocks; b++) {
    const top = pad + titleH + b * geo.blockStep;
    if (b > 0 && m.view.blockSeparator) {
      const y = f1(top - Math.max(0, m.view.blockGap) / 2);
      parts.push(`<line x1="${pad}" x2="${pad + geo.width}" y1="${y}" y2="${y}" stroke="${m.view.mutedColor}" stroke-opacity="0.6" stroke-dasharray="4 3"/>`);
    }
    parts.push(`<g transform="translate(${pad} ${top})">${blockContent(geo, m, b)}</g>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
