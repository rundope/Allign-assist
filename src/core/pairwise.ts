// Pairwise alignment with affine gaps (Gotoh 1982).
//
// Gap of length L costs  gapOpen + (L - 1) * gapExtend  (EMBOSS needle/water convention).
//
// Modes
//   global      Needleman–Wunsch: every end gap is penalised.
//   semiglobal  "overlap": end gaps on both sequences are free. Best for comparing two
//               similar sequences of different lengths.
//   fit         A (the reference) may overhang for free at both ends, B (the query) must be
//               aligned end-to-end. Answers "where in my reference does this query sit?".
//   local       Smith–Waterman: best-scoring sub-region of both sequences.
import { encode, type Scoring } from './matrices';

export type AlignMode = 'global' | 'semiglobal' | 'fit' | 'local';

/** Path operations: pair (consume A and B), A only (gap in B), B only (gap in A). */
export const OP_PAIR = 0;
export const OP_A = 1;
export const OP_B = 2;

export interface DPResult {
  score: number;
  ops: Uint8Array; // path from start to end
  aStart: number; // 0-based, inclusive
  aEnd: number; // exclusive
  bStart: number;
  bEnd: number;
}

export interface DPOptions {
  n: number;
  m: number;
  /** Fill out[j] (j = 0..m-1) with the substitution score of A[i] vs B[j]. */
  scoreRow: (i: number, out: Float64Array) => void;
  gapOpen: number;
  gapExtend: number;
  mode: AlignMode;
}

/** Upper bound on DP cells; the traceback costs one byte per cell. */
export const MAX_CELLS = 150_000_000;

const NEG = -Infinity;

export class AlignmentTooLargeError extends Error {}

export function dynamicProgram(o: DPOptions): DPResult {
  const { n, m, scoreRow, gapOpen: open, gapExtend: ext, mode } = o;
  const cells = (n + 1) * (m + 1);
  if (cells > MAX_CELLS) {
    throw new AlignmentTooLargeError(
      `정렬 행렬이 너무 큽니다 (${n} × ${m} = ${(cells / 1e6).toFixed(0)}M cells, 최대 ${MAX_CELLS / 1e6}M). 서열을 잘라서 정렬하세요.`,
    );
  }
  const local = mode === 'local';
  const freeLeadA = mode === 'semiglobal' || mode === 'fit';
  const freeTrailA = freeLeadA;
  const freeLeadB = mode === 'semiglobal';
  const freeTrailB = mode === 'semiglobal';

  // tb bits: 0-1 predecessor of M (0=M 1=X 2=Y 3=start), 2-3 predecessor of X, 4-5 predecessor of Y
  const tb = new Uint8Array(cells);
  let Mp = new Float64Array(m + 1);
  let Xp = new Float64Array(m + 1);
  let Yp = new Float64Array(m + 1);
  let Mc = new Float64Array(m + 1);
  let Xc = new Float64Array(m + 1);
  let Yc = new Float64Array(m + 1);
  const s = new Float64Array(m);

  // Row 0
  Mp[0] = local ? NEG : 0;
  Xp[0] = NEG;
  Yp[0] = NEG;
  for (let j = 1; j <= m; j++) {
    Mp[j] = NEG;
    Xp[j] = NEG;
    Yp[j] = local ? NEG : freeLeadB ? 0 : -(open + (j - 1) * ext);
  }

  const lastColBest = new Float64Array(n + 1).fill(NEG);
  const lastColState = new Uint8Array(n + 1);
  let bestLocal = 0;
  let bestLocalI = 0;
  let bestLocalJ = 0;

  for (let i = 1; i <= n; i++) {
    scoreRow(i - 1, s);
    Mc[0] = NEG;
    Yc[0] = NEG;
    Xc[0] = local ? NEG : freeLeadA ? 0 : -(open + (i - 1) * ext);
    const rowOff = i * (m + 1);
    for (let j = 1; j <= m; j++) {
      // M: A[i] aligned with B[j]
      let dm = Mp[j - 1];
      let dp = 0;
      const dx = Xp[j - 1];
      if (dx > dm) {
        dm = dx;
        dp = 1;
      }
      const dy = Yp[j - 1];
      if (dy > dm) {
        dm = dy;
        dp = 2;
      }
      if (local && dm <= 0) {
        dm = 0;
        dp = 3;
      }
      const mv = dm + s[j - 1];

      // X: A[i] against a gap (vertical move)
      let xv = Mp[j] - open;
      let xp = 0;
      const xx = Xp[j] - ext;
      if (xx > xv) {
        xv = xx;
        xp = 1;
      }
      const xy = Yp[j] - open;
      if (xy > xv) {
        xv = xy;
        xp = 2;
      }

      // Y: B[j] against a gap (horizontal move)
      let yv = Mc[j - 1] - open;
      let yp = 0;
      const yy = Yc[j - 1] - ext;
      if (yy > yv) {
        yv = yy;
        yp = 2;
      }
      const yx = Xc[j - 1] - open;
      if (yx > yv) {
        yv = yx;
        yp = 1;
      }

      Mc[j] = mv;
      Xc[j] = xv;
      Yc[j] = yv;
      tb[rowOff + j] = dp | (xp << 2) | (yp << 4);

      if (local && mv > bestLocal) {
        bestLocal = mv;
        bestLocalI = i;
        bestLocalJ = j;
      }
    }
    // remember last column for free trailing A
    const [bv, bs] = best3(Mc[m], Xc[m], Yc[m]);
    lastColBest[i] = bv;
    lastColState[i] = bs;

    let t = Mp;
    Mp = Mc;
    Mc = t;
    t = Xp;
    Xp = Xc;
    Xc = t;
    t = Yp;
    Yp = Yc;
    Yc = t;
  }
  // after the loop, the *p arrays hold row n

  // Choose the end cell.
  let endI = n;
  let endJ = m;
  let endState = 0;
  let score: number;
  if (local) {
    score = bestLocal;
    endI = bestLocalI;
    endJ = bestLocalJ;
    endState = 0;
    if (bestLocal <= 0) {
      return { score: 0, ops: new Uint8Array(0), aStart: 0, aEnd: 0, bStart: 0, bEnd: 0 };
    }
  } else {
    const [v, st] = best3(Mp[m], Xp[m], Yp[m]);
    score = n === 0 && m === 0 ? 0 : v;
    endState = st;
    if (freeTrailA) {
      for (let i = 0; i < n; i++) {
        const val = i === 0 ? (freeLeadB ? 0 : m === 0 ? 0 : -(open + (m - 1) * ext)) : lastColBest[i];
        if (val > score) {
          score = val;
          endI = i;
          endJ = m;
          endState = i === 0 ? 2 : lastColState[i];
        }
      }
    }
    if (freeTrailB) {
      for (let j = 0; j < m; j++) {
        const val = best3(Mp[j], Xp[j], Yp[j])[0];
        if (val > score) {
          score = val;
          endI = n;
          endJ = j;
          endState = best3(Mp[j], Xp[j], Yp[j])[1];
        }
      }
    }
  }

  // Traceback.
  const rev: number[] = [];
  if (!local) {
    // trailing overhangs (free end gaps)
    for (let k = n; k > endI; k--) rev.push(OP_A);
    for (let k = m; k > endJ; k--) rev.push(OP_B);
  }
  let i = endI;
  let j = endJ;
  let state = endState;
  let startI = 0;
  let startJ = 0;
  while (i > 0 || j > 0) {
    if (i === 0) {
      if (local) break;
      rev.push(OP_B);
      j--;
      continue;
    }
    if (j === 0) {
      if (local) break;
      rev.push(OP_A);
      i--;
      continue;
    }
    const t = tb[i * (m + 1) + j];
    if (state === 0) {
      rev.push(OP_PAIR);
      const p = t & 3;
      i--;
      j--;
      if (p === 3) {
        startI = i;
        startJ = j;
        break;
      }
      state = p;
    } else if (state === 1) {
      rev.push(OP_A);
      state = (t >> 2) & 3;
      i--;
    } else {
      rev.push(OP_B);
      state = (t >> 4) & 3;
      j--;
    }
  }
  if (!local) {
    startI = 0;
    startJ = 0;
  }
  const ops = Uint8Array.from(rev.reverse());
  return {
    score,
    ops,
    aStart: startI,
    aEnd: local ? endI : n,
    bStart: startJ,
    bEnd: local ? endJ : m,
  };
}

function best3(mv: number, xv: number, yv: number): [number, number] {
  let v = mv;
  let s = 0;
  if (xv > v) {
    v = xv;
    s = 1;
  }
  if (yv > v) {
    v = yv;
    s = 2;
  }
  return [v, s];
}

export interface PairAlignment {
  a: string; // gapped
  b: string; // gapped
  aStart: number; // 0-based offset of first shown residue of A
  bStart: number;
  score: number;
}

/** Turn a DP path into gapped strings. */
export function opsToStrings(a: string, b: string, r: DPResult): PairAlignment {
  let ia = r.aStart;
  let ib = r.bStart;
  const outA: string[] = [];
  const outB: string[] = [];
  for (const op of r.ops) {
    if (op === OP_PAIR) {
      outA.push(a[ia++]);
      outB.push(b[ib++]);
    } else if (op === OP_A) {
      outA.push(a[ia++]);
      outB.push('-');
    } else {
      outA.push('-');
      outB.push(b[ib++]);
    }
  }
  return { a: outA.join(''), b: outB.join(''), aStart: r.aStart, bStart: r.bStart, score: r.score };
}

export interface PairOptions {
  scoring: Scoring;
  gapOpen: number;
  gapExtend: number;
  mode: AlignMode;
}

/** Align two plain sequences. In 'fit' mode `a` is the reference. */
export function alignPair(a: string, b: string, o: PairOptions): PairAlignment {
  const r = alignPairRaw(a, b, o);
  return opsToStrings(a, b, r);
}

export function alignPairRaw(a: string, b: string, o: PairOptions): DPResult {
  const ea = encode(a, o.scoring);
  const eb = encode(b, o.scoring);
  const K = o.scoring.size;
  const mat = o.scoring.matrix;
  return dynamicProgram({
    n: a.length,
    m: b.length,
    gapOpen: o.gapOpen,
    gapExtend: o.gapExtend,
    mode: o.mode,
    scoreRow: (i, out) => {
      const off = ea[i] * K;
      for (let j = 0; j < eb.length; j++) out[j] = mat[off + eb[j]];
    },
  });
}
