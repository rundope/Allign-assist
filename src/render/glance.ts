// "At a glance" map: the whole alignment on one screen.
//   top    — windowed % identity profile against the reference (where do sequences diverge?)
//   rows   — one track per sequence: aligned extent, and every difference as a marker
//            (full tick = substitution, short tick = similar substitution, ▼ = insertion,
//             broken bar with bracket = deletion, grey tick = ambiguity code)
import { sameResidue } from '../core/stats';
import type { RowVariants, Variant } from '../core/variants';
import type { RenderModel } from './model';

export interface GlanceColors {
  match: string;
  similar: string;
  mismatch: string;
  indel: string;
  amb: string;
  ref: string;
  text: string;
  muted: string;
  grid: string;
  accent: string;
  surface: string;
}

export function readGlanceColors(el: HTMLElement): GlanceColors {
  const cs = getComputedStyle(el);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    match: v('--g-match', '#2f9e6b'),
    similar: v('--g-similar', '#d99a00'),
    mismatch: v('--g-mismatch', '#e5484d'),
    indel: v('--g-indel', '#8e4ec6'),
    amb: v('--g-amb', '#98a2b3'),
    ref: v('--g-ref', '#98a2b3'),
    text: v('--text', '#1f2328'),
    muted: v('--muted', '#667085'),
    grid: v('--divider', '#c3ccd8'),
    accent: v('--accent', '#2f6fdb'),
    surface: v('--surface', '#ffffff'),
  };
}

export interface GlanceRowSummary {
  row: number;
  identity: number | null; // percent
  text: string;
}

export interface GlanceLayout {
  width: number;
  height: number;
  labelW: number;
  plotX: number;
  plotW: number;
  axisH: number;
  profileTop: number;
  profileH: number;
  tracksTop: number;
  trackH: number;
  L: number;
  refRow: number;
  window: number;
  /** windowed identity per column (NaN where no sequence overlaps the reference). */
  profile: Float32Array;
}

export function colToX(g: GlanceLayout, c: number): number {
  return g.plotX + ((c + 0.5) / g.L) * g.plotW;
}

export function xToCol(g: GlanceLayout, x: number): number | null {
  if (x < g.plotX - 2 || x > g.plotX + g.plotW + 2) return null;
  return Math.max(0, Math.min(g.L - 1, Math.floor(((x - g.plotX) / g.plotW) * g.L)));
}

/** Row index under y, -1 for the identity profile, null elsewhere. */
export function yToRow(g: GlanceLayout, y: number, nRows: number): number | null {
  if (y >= g.profileTop && y <= g.profileTop + g.profileH) return -1;
  const r = Math.floor((y - g.tracksTop) / g.trackH);
  return y >= g.tracksTop && r < nRows ? r : null;
}

function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

/** Windowed identity of all non-reference rows against the reference, per column. */
function identityProfile(m: RenderModel, refRow: number, window: number): Float32Array {
  const L = m.rows[0].length;
  const pairs = new Float64Array(L + 1);
  const same = new Float64Array(L + 1);
  const ref = m.rows[refRow];
  for (let c = 0; c < L; c++) {
    let p = 0;
    let s = 0;
    const a = ref[c];
    for (let r = 0; r < m.rows.length; r++) {
      if (r === refRow || c < m.first[r] || c > m.last[r]) continue;
      if (c < m.first[refRow] || c > m.last[refRow]) continue;
      const b = m.rows[r][c];
      // gaps inside the overlap count as differences
      p++;
      if (a !== '-' && b !== '-' && sameResidue(a, b, m.nucleotide)) s++;
    }
    pairs[c + 1] = pairs[c] + p;
    same[c + 1] = same[c] + s;
  }
  const out = new Float32Array(L);
  const h = Math.floor(window / 2);
  for (let c = 0; c < L; c++) {
    const a = Math.max(0, c - h);
    const b = Math.min(L, c + h + 1);
    const p = pairs[b] - pairs[a];
    out[c] = p > 0 ? (100 * (same[b] - same[a])) / p : NaN;
  }
  return out;
}

export function drawGlance(
  canvas: HTMLCanvasElement,
  m: RenderModel,
  refRow: number,
  variants: RowVariants[],
  summaries: GlanceRowSummary[],
  cssWidth: number,
  col: GlanceColors,
): GlanceLayout {
  const N = m.rows.length;
  const L = m.rows[0].length;
  const narrow = cssWidth < 720;
  const labelW = Math.round(Math.min(210, Math.max(96, cssWidth * (narrow ? 0.24 : 0.15))));
  const summaryW = narrow ? 0 : 190;
  const plotX = labelW;
  const plotW = Math.max(60, cssWidth - labelW - summaryW - 12);
  const axisH = 24;
  const profileTop = axisH + 4;
  const profileH = 64;
  const tracksTop = profileTop + profileH + 18;
  const trackH = N <= 8 ? 32 : N <= 20 ? 24 : 16;
  const height = tracksTop + N * trackH + 6;
  const winCols = Math.max(1, Math.round(L / 60) | 1);
  const profile = identityProfile(m, refRow, winCols);
  const g: GlanceLayout = { width: cssWidth, height, labelW, plotX, plotW, axisH, profileTop, profileH, tracksTop, trackH, L, refRow, window: winCols, profile };

  const dpr = devicePixelRatioSafe();
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return g;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, height);
  const font = (px: number, weight = 400) => `${weight} ${px}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textBaseline = 'middle';

  // ---- reference coordinate axis ----
  const refRowData = m.aln.rows[refRow];
  const refResidues = refRowData.length;
  const step = niceStep(refResidues / Math.max(2, Math.floor(plotW / 90)));
  ctx.font = font(11);
  ctx.fillStyle = col.muted;
  ctx.textAlign = 'center';
  const pref = m.prefixes[refRow];
  let k = 1; // residue counter walks columns once
  for (let c = 0; c < L; c++) {
    if (m.rows[refRow][c] === '-') continue;
    const num = refRowData.strand === 1 ? refRowData.start + pref[c] : refRowData.start - pref[c];
    if (num % step === 0 || k === 1) {
      const x = colToX(g, c);
      ctx.fillRect(Math.round(x), axisH - 5, 1, 4);
      if (num % step === 0) ctx.fillText(String(num), Math.min(Math.max(x, plotX + 12), plotX + plotW - 12), axisH - 13);
    }
    k++;
  }
  ctx.textAlign = 'left';
  const roomy = labelW >= 150;
  if (roomy) ctx.fillText(`${refRowData.name.slice(0, Math.floor((labelW - 40) / 6.5))} 좌표`, 2, axisH - 13);

  // ---- identity profile ----
  const py = (v: number) => profileTop + profileH - (v / 100) * profileH;
  ctx.strokeStyle = col.grid;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (const v of [50, 100]) {
    ctx.beginPath();
    ctx.moveTo(plotX, Math.round(py(v)) + 0.5);
    ctx.lineTo(plotX + plotW, Math.round(py(v)) + 0.5);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(plotX, profileTop + profileH + 0.5);
  ctx.lineTo(plotX + plotW, profileTop + profileH + 0.5);
  ctx.stroke();
  ctx.fillStyle = col.muted;
  ctx.font = font(10);
  ctx.textAlign = 'right';
  ctx.fillText('100%', plotX - 6, py(100));
  ctx.fillText('50%', plotX - 6, py(50));
  ctx.fillText('0%', plotX - 6, py(0) - 4);
  ctx.textAlign = 'left';
  ctx.font = font(12, 600);
  ctx.fillStyle = col.text;
  ctx.fillText(roomy ? '구간 일치도' : '일치도', 2, profileTop + (roomy ? 12 : profileH / 2));
  if (roomy) {
    ctx.font = font(10.5);
    ctx.fillStyle = col.muted;
    ctx.fillText(`창 ${winCols}열 이동평균`, 2, profileTop + 28);
  }

  // area + line, drawn per pixel column, broken where there is no overlap
  const px = Math.max(1, Math.floor(plotW));
  const vals = new Float32Array(px);
  for (let p = 0; p < px; p++) {
    const ca = Math.floor((p / px) * L);
    const cb = Math.max(ca + 1, Math.floor(((p + 1) / px) * L));
    let sum = 0;
    let n = 0;
    for (let c = ca; c < cb && c < L; c++) {
      const v = profile[c];
      if (!Number.isNaN(v)) {
        sum += v;
        n++;
      }
    }
    vals[p] = n ? sum / n : NaN;
  }
  const runs: [number, number][] = [];
  let s0 = -1;
  for (let p = 0; p <= px; p++) {
    const ok = p < px && !Number.isNaN(vals[p]);
    if (ok && s0 < 0) s0 = p;
    if (!ok && s0 >= 0) {
      runs.push([s0, p - 1]);
      s0 = -1;
    }
  }
  for (const [a, b] of runs) {
    ctx.beginPath();
    ctx.moveTo(plotX + a, py(0));
    for (let p = a; p <= b; p++) ctx.lineTo(plotX + p + 0.5, py(vals[p]));
    ctx.lineTo(plotX + b + 1, py(0));
    ctx.closePath();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = col.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let p = a; p <= b; p++) {
      const x = plotX + p + 0.5;
      const y = py(vals[p]);
      if (p === a) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col.accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // ---- tracks ----
  const byRow = new Map<number, Variant[]>();
  for (const rv of variants) byRow.set(rv.row, rv.variants);
  const sumByRow = new Map<number, GlanceRowSummary>();
  for (const s of summaries) sumByRow.set(s.row, s);
  const colW = plotW / L;
  const markW = Math.max(2, Math.min(colW, 6));
  for (let r = 0; r < N; r++) {
    const y0 = tracksTop + r * trackH;
    const mid = y0 + trackH / 2;
    const bodyH = Math.max(6, Math.round(trackH * 0.38));
    const isRef = r === refRow;
    // zebra band for readability
    if (r % 2 === 1) {
      ctx.globalAlpha = 0.045;
      ctx.fillStyle = col.text;
      ctx.fillRect(0, y0, cssWidth, trackH);
      ctx.globalAlpha = 1;
    }
    // label
    const row = m.aln.rows[r];
    ctx.font = font(trackH >= 24 ? 12 : 11, isRef ? 700 : 500);
    ctx.fillStyle = col.text;
    ctx.textAlign = 'left';
    const tag = isRef ? '기준' : row.strand === -1 ? 'rc' : '';
    const maxName = Math.floor((labelW - (tag ? 36 : 10)) / 7);
    const name = row.name.length > maxName ? `${row.name.slice(0, Math.max(3, maxName - 1))}…` : row.name;
    ctx.fillText(name, 2, mid);
    if (tag) {
      const tw = ctx.measureText(name).width;
      ctx.font = font(10, 600);
      ctx.fillStyle = isRef ? col.accent : col.indel;
      ctx.fillText(tag, 8 + tw, mid);
    }
    // baseline across the plot
    ctx.fillStyle = col.grid;
    ctx.fillRect(plotX, Math.round(mid), plotW, 1);
    // aligned body: pixels where the row has residues
    ctx.fillStyle = isRef ? col.ref : col.match;
    ctx.globalAlpha = isRef ? 0.45 : 0.38;
    let runStart = -1;
    for (let p = 0; p <= px; p++) {
      let has = false;
      if (p < px) {
        const ca = Math.floor((p / px) * L);
        const cb = Math.max(ca + 1, Math.floor(((p + 1) / px) * L));
        for (let c = ca; c < cb && c < L; c++)
          if (m.rows[r][c] !== '-') {
            has = true;
            break;
          }
      }
      if (has && runStart < 0) runStart = p;
      if (!has && runStart >= 0) {
        ctx.fillRect(plotX + runStart, mid - bodyH / 2, p - runStart, bodyH);
        runStart = -1;
      }
    }
    ctx.globalAlpha = 1;
    if (!isRef) {
      for (const v of byRow.get(r) ?? []) {
        const x0 = plotX + (v.col0 / L) * plotW;
        const x1 = plotX + ((v.col1 + 1) / L) * plotW;
        const xc = (x0 + x1) / 2;
        if (v.kind === 'sub') {
          const strong = v.subClass === 'transversion' || v.subClass === 'radical';
          const h = strong ? trackH * 0.78 : trackH * 0.5;
          ctx.fillStyle = strong ? col.mismatch : col.similar;
          ctx.fillRect(xc - markW / 2, mid - h / 2, markW, h);
        } else if (v.kind === 'amb') {
          ctx.fillStyle = col.amb;
          ctx.fillRect(xc - markW / 2, mid - trackH * 0.22, markW, trackH * 0.44);
        } else if (v.kind === 'del') {
          // bracket under the broken bar
          const yb = mid + bodyH / 2 + 3;
          ctx.fillStyle = col.indel;
          ctx.fillRect(x0, yb, Math.max(2, x1 - x0), 2);
          ctx.fillRect(x0, mid - bodyH / 2, 1.5, bodyH + 5);
          ctx.fillRect(Math.max(x0, x1 - 1.5), mid - bodyH / 2, 1.5, bodyH + 5);
        } else {
          // insertion: downward triangle above the bar at the insertion point
          const size = Math.min(7, Math.max(4, trackH * 0.2));
          const yt = mid - bodyH / 2 - 2;
          ctx.fillStyle = col.indel;
          ctx.beginPath();
          ctx.moveTo(x0 - size, yt - size * 1.3);
          ctx.lineTo(x0 + size, yt - size * 1.3);
          ctx.lineTo(x0, yt);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // summary on the right
    if (summaryW) {
      const s = sumByRow.get(r);
      ctx.textAlign = 'left';
      const sx = plotX + plotW + 12;
      if (isRef) {
        ctx.font = font(11);
        ctx.fillStyle = col.muted;
        ctx.fillText(`${row.length.toLocaleString()} ${m.nucleotide ? 'nt' : 'aa'} · 비교 기준`, sx, mid);
      } else if (s) {
        ctx.font = font(12, 700);
        ctx.fillStyle = col.text;
        const idTxt = s.identity === null ? '–' : `${s.identity.toFixed(1)}%`;
        ctx.fillText(idTxt, sx, mid);
        const w = ctx.measureText(idTxt).width;
        ctx.font = font(11);
        ctx.fillStyle = col.muted;
        ctx.fillText(s.text, sx + w + 8, mid);
      }
    }
  }
  return g;
}

function devicePixelRatioSafe(): number {
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
}

/** A few residues of reference and query around column c, for the tooltip. */
export function snippet(m: RenderModel, refRow: number, r: number, c: number, span = 8): { cols: number[]; ref: string[]; row: string[] } {
  const L = m.rows[0].length;
  const cols: number[] = [];
  for (let k = Math.max(0, c - span); k <= Math.min(L - 1, c + span); k++) cols.push(k);
  return { cols, ref: cols.map((k) => m.rows[refRow][k]), row: cols.map((k) => m.rows[r][k]) };
}
