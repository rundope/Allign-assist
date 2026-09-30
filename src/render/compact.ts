// Compact whole-alignment view: the real residues, wrapped and shrunk until the entire
// alignment fits in the given box, so nothing needs scrolling. Letters are drawn while
// they are legible; below that each residue is a coloured cell (read them in the loupe).
import { contrastRatio } from './colors';
import { cellStyle, residueNumber, type RenderModel } from './model';

export interface CompactLayout {
  width: number;
  height: number;
  fontPx: number;
  cellW: number;
  rowH: number;
  blockGap: number;
  perLine: number;
  nBlocks: number;
  labelW: number;
  showLetters: boolean;
  showNames: boolean;
  /** true when even the smallest size overflows the box (then the view scrolls). */
  overflow: boolean;
}

const LETTER_MIN = 7; // px — below this, letters are unreadable; draw cells only
const NUM_W = 42; // gutter for each block's starting residue number

export function computeCompactLayout(m: RenderModel, width: number, maxHeight: number): CompactLayout {
  const N = m.rows.length;
  const L = m.c1 - m.c0;
  const mk = (showLetters: boolean, fontPx: number, cellW: number, rowH: number): CompactLayout => {
    const showNames = rowH >= 9;
    // [name][block start position]; the position column is always there
    const labelW = (showNames ? Math.min(140, Math.max(64, Math.round(width * 0.11))) : 0) + NUM_W;
    const blockGap = showLetters ? Math.max(4, Math.round(rowH * 0.8)) : 5;
    let perLine = Math.max(1, Math.floor((width - labelW - 6) / cellW));
    if (showLetters && perLine > 10) perLine -= perLine % 10;
    const nBlocks = Math.max(1, Math.ceil(L / perLine));
    const height = nBlocks * N * rowH + (nBlocks - 1) * blockGap + 2;
    return { width, height, fontPx, cellW, rowH, blockGap, perLine, nBlocks, labelW, showLetters, showNames, overflow: false };
  };
  // 1) the largest font whose letters still fit on one screen
  for (let f = 16; f >= LETTER_MIN; f--) {
    const l = mk(true, f, f * 0.68, Math.round(f * 1.3));
    if (l.height <= maxHeight) return l;
  }
  // 2) too long for letters: colour cells. Narrow cells give fewer wrapped lines, which
  //    leaves room for taller rows; take the first width whose rows are tall enough
  //    (10 px) to carry sequence names, otherwise the tallest rows possible.
  let best: CompactLayout | null = null;
  for (const cellW of [6, 5, 4, 3, 2.5, 2, 1.5, 1.2, 1, 0.8, 0.6, 0.5]) {
    const probe = mk(false, 0, cellW, 1);
    const rowH = Math.min(14, Math.floor((maxHeight - (probe.nBlocks - 1) * probe.blockGap - 2) / (probe.nBlocks * N)));
    if (rowH < 1) continue;
    let l = mk(false, 0, cellW, rowH);
    // taller rows may bring the name column back, which narrows the lines; re-fit
    while (l.height > maxHeight && l.rowH > 1) l = mk(false, 0, cellW, l.rowH - 1);
    if (l.height > maxHeight) continue;
    if (!best || l.rowH > best.rowH) best = l;
    if (l.rowH >= 10) return l;
  }
  if (best) return best;
  const l = mk(false, 0, 0.5, 1);
  l.overflow = true;
  return l;
}

export function blockTop(l: CompactLayout, m: RenderModel, b: number): number {
  return b * (m.rows.length * l.rowH + l.blockGap);
}

/** Alignment row/column under a point, or null. */
export function compactHit(l: CompactLayout, m: RenderModel, x: number, y: number): { r: number; c: number } | null {
  if (x < l.labelW) return null;
  const N = m.rows.length;
  const step = N * l.rowH + l.blockGap;
  const b = Math.floor(y / step);
  const within = y - b * step;
  if (b < 0 || b >= l.nBlocks || within >= N * l.rowH) return null;
  const k = Math.floor((x - l.labelW) / l.cellW);
  if (k < 0 || k >= l.perLine) return null;
  const c = m.c0 + b * l.perLine + k;
  if (c >= m.c1) return null;
  return { r: Math.floor(within / l.rowH), c };
}

/** Pixel position of alignment column c (left edge x, block top y). */
export function compactPos(l: CompactLayout, m: RenderModel, c: number): { x: number; y: number } {
  const rel = c - m.c0;
  const b = Math.floor(rel / l.perLine);
  return { x: l.labelW + (rel - b * l.perLine) * l.cellW, y: blockTop(l, m, b) };
}

export interface CompactColors {
  residue: string; // fill for residues that have no highlight colour
  text: string;
  muted: string;
  divider: string;
  paper: string;
}

export function drawCompact(canvas: HTMLCanvasElement, m: RenderModel, l: CompactLayout, col: CompactColors): void {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.style.width = `${l.width}px`;
  canvas.style.height = `${l.height}px`;
  canvas.width = Math.round(l.width * dpr);
  canvas.height = Math.round(l.height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = col.paper;
  ctx.fillRect(0, 0, l.width, l.height);
  const N = m.rows.length;
  const v = m.view;
  const letterFont = `${v.fontWeight} ${l.fontPx}px ${v.fontFamily}`;
  const labelPx = Math.min(12, Math.max(9, l.rowH - 1));
  ctx.textBaseline = 'middle';
  // the comparison row's residue numbers label each block
  const numRow = m.refRow >= 0 ? m.refRow : m.aln.referenceIndex;
  for (let b = 0; b < l.nBlocks; b++) {
    const y0 = blockTop(l, m, b);
    const c0 = m.c0 + b * l.perLine;
    const c1 = Math.min(m.c1, c0 + l.perLine);
    if (b > 0) {
      ctx.strokeStyle = col.divider;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      const yl = Math.round(y0 - l.blockGap / 2) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, yl);
      ctx.lineTo(l.width, yl);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // left gutter: names (when rows are tall enough), then the block's start position
    if (l.showNames) {
      ctx.textAlign = 'left';
      ctx.font = `${labelPx}px system-ui, sans-serif`;
      const max = Math.floor((l.labelW - NUM_W - 6) / (labelPx * 0.58));
      for (let r = 0; r < N; r++) {
        const name = m.aln.rows[r].name;
        ctx.fillStyle = r === numRow ? col.text : col.muted;
        ctx.fillText(name.length > max ? `${name.slice(0, Math.max(2, max - 1))}…` : name, 2, y0 + r * l.rowH + l.rowH / 2);
      }
    }
    {
      // residue number of the first comparison-row residue at or after this block's start
      const p = m.prefixes[numRow];
      const k = Math.min(p[c0] + 1, p[p.length - 1]);
      if (k > 0) {
        ctx.textAlign = 'right';
        ctx.font = `${Math.min(11, Math.max(9, l.rowH))}px system-ui, sans-serif`;
        ctx.fillStyle = col.muted;
        const yNum = l.showNames ? y0 + numRow * l.rowH + l.rowH / 2 : y0 + Math.min(N * l.rowH, 12) / 2;
        ctx.fillText(String(residueNumber(m, numRow, k)), l.labelW - 5, yNum);
      }
    }
    // cells
    ctx.font = letterFont;
    ctx.textAlign = 'center';
    for (let r = 0; r < N; r++) {
      const y = y0 + r * l.rowH;
      const pad = l.rowH >= 4 ? 0.5 : 0;
      const marks: [number, string][] = [];
      for (let c = c0; c < c1; c++) {
        const s = cellStyle(m, r, c);
        const x = l.labelW + (c - c0) * l.cellW;
        const raw = m.rows[r][c];
        if (s.cat === 'terminal') continue;
        if (raw === '-') {
          // internal gap: thin line, in the gap colour when one is set
          ctx.fillStyle = v.colors.gap.bg || s.fg || col.muted;
          ctx.fillRect(x, y + l.rowH / 2 - 0.5, l.cellW, 1);
          continue;
        }
        let fill = s.bg;
        if (!l.showLetters) {
          // without letters a pale highlight vanishes; differences take whichever of
          // their background/text colour stands out more against the paper
          if (s.cat === 'mismatch' || s.cat === 'similar' || s.cat === 'indel') fill = stronger(s.bg, s.fg, col.paper);
          if (!fill) fill = col.residue;
        }
        if (fill) {
          const diff = !l.showLetters && fill !== col.residue && s.cat !== 'match';
          if (diff && l.cellW < 2) {
            // drawn after the row so neighbouring cells cannot paint over it
            marks.push([x + l.cellW / 2 - 1, fill]);
            ctx.fillStyle = col.residue;
            ctx.fillRect(x, y + pad, l.cellW + 0.02, l.rowH - pad * 2);
          } else {
            ctx.fillStyle = fill;
            ctx.fillRect(x, y + pad, l.cellW + 0.02, l.rowH - pad * 2);
          }
        }
        if (l.showLetters && s.ch !== ' ') {
          ctx.fillStyle = s.fg;
          ctx.fillText(s.ch, x + l.cellW / 2, y + l.rowH / 2 + 0.5);
        }
      }
      for (const [mx, color] of marks) {
        ctx.fillStyle = color;
        ctx.fillRect(mx, y + pad, 2, l.rowH - pad * 2);
      }
    }
  }
}

function stronger(a: string, b: string, paper: string): string {
  if (!a) return b;
  if (!b) return a;
  return contrastRatio(a, paper) >= contrastRatio(b, paper) ? a : b;
}
