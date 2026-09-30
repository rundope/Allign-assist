// Render model: per-cell classification and styling, independent of the output medium.
import { scoringFor } from '../core/align';
import type { Chromatogram } from '../core/abif';
import type { Scoring } from '../core/matrices';
import type { TraceLink } from '../core/trace';
import { computeColumnStats, residuePrefix, sameResidue, similarResidue, type ColumnStats } from '../core/stats';
import type { Alignment, AlignSettings } from '../core/types';
import type { Category, ViewSettings } from '../ui/state';
import { mix, readableOn, residueColor } from './colors';

export interface CellStyle {
  ch: string;
  bg: string; // '' = none
  fg: string;
  cat: Category | 'plain' | 'terminal';
}

export interface RenderModel {
  aln: Alignment;
  view: ViewSettings;
  nucleotide: boolean;
  scoring: Scoring;
  rows: string[];
  cols: ColumnStats;
  prefixes: Int32Array[];
  /** First / last column holding a residue, per row. */
  first: number[];
  last: number[];
  /** Comparison row index, or -1 when comparing to the consensus. */
  refRow: number;
  /** Visible column range [c0, c1). */
  c0: number;
  c1: number;
  /** Chromatograms attached to rows (by row index), when the user added AB1 files. */
  traces?: (RowTrace | null)[];
}

export interface RowTrace {
  fileName: string;
  chrom: Chromatogram;
  link: TraceLink;
}

/** The chromatogram peak behind the residue at (r, c), if the row has a trace. */
export function traceAt(m: RenderModel, r: number, c: number): { t: RowTrace; idx: number; reverse: boolean } | null {
  const t = m.traces?.[r];
  if (!t) return null;
  const pos = residueAt(m, r, c);
  if (pos === null) return null;
  const idx = t.link.map[pos - 1];
  if (idx === undefined || idx < 0) return null;
  // the row shows the reverse complement when the alignment flipped it, or when the typed
  // sequence itself is the reverse complement of the calls (not both)
  return { t, idx, reverse: (m.aln.rows[r].strand === -1) !== t.link.rc };
}

export function buildModel(aln: Alignment, view: ViewSettings, align: AlignSettings): RenderModel {
  const rows = aln.rows.map((r) => r.aligned);
  const nucleotide = aln.seqType !== 'protein';
  const scoring = scoringFor(aln.seqType, align);
  const cols = computeColumnStats(rows, aln.seqType);
  const first = rows.map((r) => r.search(/[^-]/));
  const last = rows.map((r) => {
    for (let i = r.length - 1; i >= 0; i--) if (r[i] !== '-') return i;
    return -1;
  });
  const refRow = view.compareTo === 'consensus' ? -1 : Math.min(Math.max(0, view.compareRow), rows.length - 1);
  const L = rows[0]?.length ?? 0;
  let c0 = 0;
  let c1 = L;
  if (view.viewRange === 'aligned') {
    // columns where at least two rows carry residues
    let lo = -1;
    let hi = -1;
    for (let c = 0; c < L; c++) {
      let n = 0;
      for (const r of rows) if (r[c] !== '-' && ++n >= 2) break;
      if (n >= 2) {
        if (lo < 0) lo = c;
        hi = c;
      }
    }
    if (lo >= 0) {
      c0 = lo;
      c1 = hi + 1;
    }
  }
  return {
    aln,
    view,
    nucleotide,
    scoring,
    rows,
    cols,
    prefixes: rows.map(residuePrefix),
    first,
    last,
    refRow,
    c0,
    c1,
  };
}

export function isTerminal(m: RenderModel, r: number, c: number): boolean {
  return c < m.first[r] || c > m.last[r];
}

/** Identity-mode category of a cell against the comparison target. */
export function categorize(m: RenderModel, r: number, c: number): CellStyle['cat'] {
  const v = m.view;
  const ch = m.rows[r][c];
  if (ch === '-') return isTerminal(m, r, c) ? 'terminal' : 'gap';
  if (m.refRow === r) {
    if (!v.colorReference) return 'plain';
    let others = 0;
    let mismatch = false;
    let similar = false;
    let indel = false;
    for (let k = 0; k < m.rows.length; k++) {
      if (k === r || isTerminal(m, k, c)) continue;
      others++;
      const o = m.rows[k][c];
      if (o === '-') indel = true;
      else if (!sameResidue(ch, o, m.nucleotide)) {
        if (v.showSimilar && similarResidue(ch, o, m.nucleotide, m.scoring)) similar = true;
        else mismatch = true;
      }
    }
    if (!others) return 'plain';
    if (mismatch) return 'mismatch';
    if (indel) return 'indel';
    if (similar) return 'similar';
    return 'match';
  }
  let t: string;
  if (m.refRow < 0) {
    t = m.cols.consensus[c];
  } else {
    t = m.rows[m.refRow][c];
    if (t === '-' && isTerminal(m, m.refRow, c)) return 'plain'; // overhang beyond the reference
  }
  if (t === '-') return 'indel';
  if (sameResidue(ch, t, m.nucleotide)) return 'match';
  if (v.showSimilar && similarResidue(ch, t, m.nucleotide, m.scoring)) return 'similar';
  return 'mismatch';
}

export function cellStyle(m: RenderModel, r: number, c: number): CellStyle {
  const v = m.view;
  const raw = m.rows[r][c];
  let ch = raw;
  const terminal = raw === '-' && isTerminal(m, r, c);
  if (terminal && v.hideTerminalGaps) ch = ' ';
  const text = v.textColor;

  if (v.highlight === 'identity') {
    const cat = categorize(m, r, c);
    if (cat === 'terminal') return { ch, bg: '', fg: v.mutedColor, cat };
    if (cat === 'plain') return { ch, bg: '', fg: text, cat };
    if (cat === 'match' && v.dotIdentical && r !== m.refRow) ch = '.';
    const col = v.colors[cat];
    const fg = col.fg || (col.bg && v.autoContrast ? readableOn(col.bg) : cat === 'gap' ? v.mutedColor : text);
    return { ch, bg: col.bg, fg, cat };
  }

  if (raw === '-') return { ch, bg: '', fg: v.mutedColor, cat: terminal ? 'terminal' : 'gap' };

  if (v.dotIdentical && m.refRow >= 0 && r !== m.refRow && sameResidue(raw, m.rows[m.refRow][c], m.nucleotide)) ch = '.';

  if (v.highlight === 'conservation') {
    const cons = m.cols.consensus[c];
    const f = m.cols.consensusFrac[c];
    const same = cons !== '-' && sameResidue(raw, cons, m.nucleotide);
    if (!same || m.rows.length < 2 || f <= 0.4) return { ch, bg: '', fg: text, cat: 'plain' };
    const level = f > 0.8 ? 1 : f > 0.6 ? 0.62 : 0.3;
    const bg = mix(v.conservationColor, v.paperColor, level);
    return { ch, bg, fg: readableOn(bg), cat: 'plain' };
  }

  if (v.highlight === 'residue') {
    const f = m.cols.consensusFrac[c] * 100;
    const color = f + 1e-9 >= v.residueThreshold ? residueColor(raw, v.residueScheme, v, m.nucleotide) : null;
    if (!color) return { ch, bg: '', fg: text, cat: 'plain' };
    if (v.residueTarget === 'fg') return { ch, bg: '', fg: color, cat: 'plain' };
    return { ch, bg: color, fg: v.autoContrast ? readableOn(color) : text, cat: 'plain' };
  }

  return { ch, bg: '', fg: text, cat: 'plain' };
}

/** Residue number (input numbering) of the k-th residue (1-based) of a row. */
export function residueNumber(m: RenderModel, r: number, k: number): number {
  const row = m.aln.rows[r];
  return row.strand === 1 ? row.start + k - 1 : row.start - (k - 1);
}

/** Residue number at column c, or null if the row has a gap there. */
export function residueAt(m: RenderModel, r: number, c: number): number | null {
  if (m.rows[r][c] === '-') return null;
  return residueNumber(m, r, m.prefixes[r][c] + 1);
}
