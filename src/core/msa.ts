// Multiple alignment: reference-anchored (star) merge and progressive profile alignment.
import { alignPairRaw, dynamicProgram, OP_A, OP_B, OP_PAIR, type AlignMode, type DPResult } from './pairwise';
import { encode, type Scoring } from './matrices';

// ---------------------------------------------------------------------------
// Reference-anchored alignment
// ---------------------------------------------------------------------------

export interface QueryPlacement {
  /** Query sequence as aligned (reverse-complemented already if strand is -1). */
  seq: string;
  dp: DPResult; // A = reference, B = query
}

/**
 * Merge independent reference–query pairwise alignments into one multiple alignment
 * in reference coordinates. Residues a query inserts relative to the reference create
 * extra columns; other rows get gaps there. Leading overhangs are right-aligned (so they
 * touch the reference start), all other insertions are left-aligned.
 */
export function mergeOnReference(ref: string, placements: QueryPlacement[]): { ref: string; queries: string[] } {
  const L = ref.length;
  const aligned: string[][] = [];
  const inserts: string[][][] = [];
  for (const p of placements) {
    const al = new Array<string>(L).fill('-');
    const ins: string[][] = Array.from({ length: L + 1 }, () => []);
    let ia = p.dp.aStart;
    let ib = p.dp.bStart;
    for (const op of p.dp.ops) {
      if (op === OP_PAIR) al[ia++] = p.seq[ib++];
      else if (op === OP_A) ia++;
      else ins[ia].push(p.seq[ib++]);
    }
    aligned.push(al);
    inserts.push(ins);
  }
  const refOut: string[] = [];
  const qOut: string[][] = placements.map(() => []);
  for (let pos = 0; pos <= L; pos++) {
    let width = 0;
    for (const ins of inserts) width = Math.max(width, ins[pos].length);
    if (width) {
      refOut.push('-'.repeat(width));
      inserts.forEach((ins, k) => {
        const res = ins[pos].join('');
        const pad = '-'.repeat(width - res.length);
        qOut[k].push(pos === 0 ? pad + res : res + pad);
      });
    }
    if (pos < L) {
      refOut.push(ref[pos]);
      aligned.forEach((al, k) => qOut[k].push(al[pos]));
    }
  }
  return { ref: refOut.join(''), queries: qOut.map((q) => q.join('')) };
}

// ---------------------------------------------------------------------------
// Progressive multiple alignment
// ---------------------------------------------------------------------------

export interface TreeNode {
  leaf?: number;
  left?: TreeNode;
  right?: TreeNode;
  height: number;
}

/** UPGMA clustering of a symmetric distance matrix. */
export function upgma(dist: number[][]): TreeNode {
  const n = dist.length;
  if (n === 0) throw new Error('empty distance matrix');
  let clusters: { node: TreeNode; size: number; id: number }[] = dist.map((_, i) => ({
    node: { leaf: i, height: 0 },
    size: 1,
    id: i,
  }));
  // distances between cluster ids
  const D = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D.set(key(i, j), dist[i][j]);
  let nextId = n;
  while (clusters.length > 1) {
    let bi = 0;
    let bj = 1;
    let bd = Infinity;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const d = D.get(key(clusters[i].id, clusters[j].id))!;
        if (d < bd) {
          bd = d;
          bi = i;
          bj = j;
        }
      }
    const a = clusters[bi];
    const b = clusters[bj];
    const merged = { node: { left: a.node, right: b.node, height: bd / 2 }, size: a.size + b.size, id: nextId++ };
    for (const c of clusters) {
      if (c === a || c === b) continue;
      const da = D.get(key(a.id, c.id))!;
      const db = D.get(key(b.id, c.id))!;
      D.set(key(merged.id, c.id), (da * a.size + db * b.size) / (a.size + b.size));
    }
    clusters = clusters.filter((c) => c !== a && c !== b);
    clusters.push(merged);
  }
  return clusters[0].node;
}

interface Profile {
  members: number[];
  rows: string[];
  len: number;
  /** len × K residue frequencies (gaps contribute nothing). */
  freq: Float64Array;
}

function makeProfile(members: number[], rows: string[], scoring: Scoring): Profile {
  const K = scoring.size;
  const len = rows[0]?.length ?? 0;
  const freq = new Float64Array(len * K);
  const w = 1 / rows.length;
  for (const r of rows) {
    const enc = encode(r, scoring);
    for (let c = 0; c < len; c++) if (r[c] !== '-') freq[c * K + enc[c]] += w;
  }
  return { members, rows, len, freq };
}

/** Align two profiles (average sum-of-pairs column score) and merge them. */
export function alignProfiles(
  A: { members: number[]; rows: string[] },
  B: { members: number[]; rows: string[] },
  scoring: Scoring,
  gapOpen: number,
  gapExtend: number,
  mode: AlignMode,
): { members: number[]; rows: string[] } {
  const pa = makeProfile(A.members, A.rows, scoring);
  const pb = makeProfile(B.members, B.rows, scoring);
  const K = scoring.size;
  const S = scoring.matrix;
  // SB[j*K + x] = Σ_y fB[j][y] · S[x][y]
  const SB = new Float64Array(pb.len * K);
  for (let j = 0; j < pb.len; j++)
    for (let y = 0; y < K; y++) {
      const f = pb.freq[j * K + y];
      if (!f) continue;
      for (let x = 0; x < K; x++) SB[j * K + x] += f * S[x * K + y];
    }
  const nzIdx = new Int32Array(K);
  const nzVal = new Float64Array(K);
  const dp = dynamicProgram({
    n: pa.len,
    m: pb.len,
    gapOpen,
    gapExtend,
    mode,
    scoreRow: (i, out) => {
      let nz = 0;
      for (let x = 0; x < K; x++) {
        const f = pa.freq[i * K + x];
        if (f) {
          nzIdx[nz] = x;
          nzVal[nz++] = f;
        }
      }
      for (let j = 0; j < pb.len; j++) {
        let sum = 0;
        const off = j * K;
        for (let t = 0; t < nz; t++) sum += nzVal[t] * SB[off + nzIdx[t]];
        out[j] = sum;
      }
    },
  });
  const outA: string[][] = A.rows.map(() => []);
  const outB: string[][] = B.rows.map(() => []);
  let ia = 0;
  let ib = 0;
  for (const op of dp.ops) {
    if (op === OP_PAIR || op === OP_A) {
      A.rows.forEach((r, k) => outA[k].push(r[ia]));
      ia++;
    } else A.rows.forEach((_, k) => outA[k].push('-'));
    if (op === OP_PAIR || op === OP_B) {
      B.rows.forEach((r, k) => outB[k].push(r[ib]));
      ib++;
    } else B.rows.forEach((_, k) => outB[k].push('-'));
  }
  return {
    members: [...A.members, ...B.members],
    rows: [...outA.map((r) => r.join('')), ...outB.map((r) => r.join(''))],
  };
}

/** Fraction of identical residues among aligned pairs (both non-gap). */
export function pairIdentity(a: string, b: string): { identity: number; pairs: number } {
  let pairs = 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '-' || b[i] === '-') continue;
    pairs++;
    if (a[i] === b[i]) same++;
  }
  return { identity: pairs ? same / pairs : 0, pairs };
}

function kmerSet(seq: string, k: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + k <= seq.length; i++) {
    const w = seq.slice(i, i + k);
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return m;
}

/** Alignment-free distance: 1 − shared k-mers / k-mers of the shorter sequence. */
export function kmerDistance(a: string, b: string, k: number): number {
  const ka = kmerSet(a, k);
  const kb = kmerSet(b, k);
  let shared = 0;
  for (const [w, c] of ka) shared += Math.min(c, kb.get(w) ?? 0);
  const denom = Math.max(1, Math.min(a.length, b.length) - k + 1);
  return 1 - shared / denom;
}

export interface ProgressiveOptions {
  scoring: Scoring;
  gapOpen: number;
  gapExtend: number;
  mode: AlignMode; // 'global' or 'semiglobal' for end-gap handling
  onProgress?: (stage: string, fraction: number) => void;
}

/** Budget (DP cells) above which guide-tree distances use k-mers instead of full alignments. */
const DISTANCE_DP_BUDGET = 300_000_000;

export function progressiveAlign(seqs: string[], o: ProgressiveOptions): { rows: string[]; tree: TreeNode; distanceMethod: 'alignment' | 'kmer' } {
  const n = seqs.length;
  if (n === 1) return { rows: [seqs[0]], tree: { leaf: 0, height: 0 }, distanceMethod: 'alignment' };
  const mode: AlignMode = o.mode === 'global' ? 'global' : 'semiglobal';
  let cells = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) cells += seqs[i].length * seqs[j].length;
  const useKmer = cells > DISTANCE_DP_BUDGET;
  const dist: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const totalPairs = (n * (n - 1)) / 2;
  let done = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      let d: number;
      if (useKmer) {
        d = kmerDistance(seqs[i], seqs[j], o.scoring.nucleotide ? 6 : 3);
      } else {
        const dp = alignPairRaw(seqs[i], seqs[j], { scoring: o.scoring, gapOpen: o.gapOpen, gapExtend: o.gapExtend, mode });
        let ia = dp.aStart;
        let ib = dp.bStart;
        let pairs = 0;
        let same = 0;
        for (const op of dp.ops) {
          if (op === OP_PAIR) {
            pairs++;
            if (seqs[i][ia] === seqs[j][ib]) same++;
            ia++;
            ib++;
          } else if (op === OP_A) ia++;
          else ib++;
        }
        d = pairs ? 1 - same / pairs : 1;
      }
      dist[i][j] = dist[j][i] = d;
      done++;
      o.onProgress?.('거리 행렬 계산 (guide tree)', (done / totalPairs) * 0.5);
    }
  const tree = upgma(dist);
  const internal = n - 1;
  let merged = 0;
  const walk = (node: TreeNode): { members: number[]; rows: string[] } => {
    if (node.leaf !== undefined) return { members: [node.leaf], rows: [seqs[node.leaf]] };
    const l = walk(node.left!);
    const r = walk(node.right!);
    const res = alignProfiles(l, r, o.scoring, o.gapOpen, o.gapExtend, mode);
    merged++;
    o.onProgress?.('프로파일 정렬 (progressive)', 0.5 + (merged / internal) * 0.5);
    return res;
  };
  const root = walk(tree);
  const rows = new Array<string>(n);
  root.members.forEach((m, k) => (rows[m] = root.rows[k]));
  return { rows: removeAllGapColumns(rows), tree, distanceMethod: useKmer ? 'kmer' : 'alignment' };
}

export function removeAllGapColumns(rows: string[]): string[] {
  if (!rows.length) return rows;
  const L = rows[0].length;
  const keep: number[] = [];
  for (let c = 0; c < L; c++) if (rows.some((r) => r[c] !== '-')) keep.push(c);
  if (keep.length === L) return rows;
  return rows.map((r) => keep.map((c) => r[c]).join(''));
}
