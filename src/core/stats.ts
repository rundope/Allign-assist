// Alignment statistics: pairwise identity/similarity, property-level agreement,
// per-column consensus/conservation and the identity matrix.
import { pairScore, type Scoring } from './matrices';
import {
  AA_CLASS,
  CLUSTAL_STRONG,
  CLUSTAL_WEAK,
  KYTE_DOOLITTLE,
  aaCharge,
  allInOneGroup,
  aminoKeto,
  hydropathySign,
  inSameGroup,
  isTransition,
  isTransversion,
  normNuc,
  purPyr,
  strongWeak,
} from './properties';
import { iupacCompatible } from './matrices';
import type { SeqType } from './seq';

export const GAP = '-';

export function sameResidue(a: string, b: string, nucleotide: boolean): boolean {
  return nucleotide ? normNuc(a) === normNuc(b) : a === b;
}

/** "Similar" = related but not necessarily identical. Protein: substitution score > 0. DNA: same purine/pyrimidine class. */
export function similarResidue(a: string, b: string, nucleotide: boolean, scoring: Scoring): boolean {
  if (sameResidue(a, b, nucleotide)) return true;
  if (nucleotide) {
    const r = purPyr(a);
    return r !== null && r === purPyr(b);
  }
  return pairScore(scoring, a, b) > 0;
}

export interface PropertyAgreement {
  key: string;
  label: string;
  hint: string;
  agree: number;
  total: number;
}

export interface PairStats {
  /** Columns where at least one of the two rows has a residue. */
  columns: number;
  /** First/last alignment column (0-based) where both rows have a residue; -1 if none. */
  overlapStart: number;
  overlapEnd: number;
  /** Columns inside the overlap where at least one row has a residue. */
  overlapColumns: number;
  pairs: number;
  identical: number;
  similar: number;
  /** Gap positions (one row gapped) inside the overlap, and how many separate gaps. */
  gapPositions: number;
  gapOpens: number;
  /** Residues of B opposite gaps in A (insertions in B), and how many separate runs. */
  insPositions: number;
  insEvents: number;
  /** Residues of A opposite gaps in B (deletions in B), and how many separate runs. */
  delPositions: number;
  delEvents: number;
  /** Residue ranges (input numbering) covered by the overlap. */
  rangeA: [number, number] | null;
  rangeB: [number, number] | null;
  residuesA: number;
  residuesB: number;
  properties: PropertyAgreement[];
  dna?: { transitions: number; transversions: number; gcA: number; gcB: number };
  protein?: { meanAbsDeltaHydropathy: number | null; substitutions: number };
}

export interface RowNumbering {
  start: number;
  strand: 1 | -1;
}

export function pct(n: number, d: number): number {
  return d > 0 ? (100 * n) / d : 0;
}

export function computePairStats(
  a: string,
  b: string,
  numA: RowNumbering,
  numB: RowNumbering,
  seqType: SeqType,
  scoring: Scoring,
): PairStats {
  const nucleotide = seqType !== 'protein';
  const L = a.length;
  let columns = 0;
  let overlapStart = -1;
  let overlapEnd = -1;
  for (let i = 0; i < L; i++) {
    const ga = a[i] === GAP;
    const gb = b[i] === GAP;
    if (!ga || !gb) columns++;
    if (!ga && !gb) {
      if (overlapStart < 0) overlapStart = i;
      overlapEnd = i;
    }
  }
  let overlapColumns = 0;
  let pairs = 0;
  let identical = 0;
  let similar = 0;
  let gapPositions = 0;
  let gapOpens = 0;
  let insPositions = 0;
  let insEvents = 0;
  let delPositions = 0;
  let delEvents = 0;
  let prevGap = '';
  // property counters
  const agree: Record<string, number> = {};
  const total: Record<string, number> = {};
  const bump = (key: string, ok: boolean) => {
    total[key] = (total[key] ?? 0) + 1;
    if (ok) agree[key] = (agree[key] ?? 0) + 1;
  };
  let transitions = 0;
  let transversions = 0;
  let dH = 0;
  let dHn = 0;
  let resA = 0;
  let resB = 0;
  let firstA = -1;
  let lastA = -1;
  let firstB = -1;
  let lastB = -1;
  for (let i = 0; i < L; i++) {
    const ca = a[i];
    const cb = b[i];
    const ga = ca === GAP;
    const gb = cb === GAP;
    if (!ga) resA++;
    if (!gb) resB++;
    if (overlapStart < 0 || i < overlapStart || i > overlapEnd) continue;
    if (ga && gb) continue;
    overlapColumns++;
    if (!ga && firstA < 0) firstA = resA;
    if (!ga) lastA = resA;
    if (!gb && firstB < 0) firstB = resB;
    if (!gb) lastB = resB;
    if (ga || gb) {
      gapPositions++;
      const side = ga ? 'a' : 'b';
      if (ga) insPositions++;
      else delPositions++;
      if (prevGap !== side) {
        gapOpens++;
        if (ga) insEvents++;
        else delEvents++;
      }
      prevGap = side;
      continue;
    }
    prevGap = '';
    pairs++;
    const same = sameResidue(ca, cb, nucleotide);
    if (same) identical++;
    if (similarResidue(ca, cb, nucleotide, scoring)) similar++;
    if (nucleotide) {
      const pa = purPyr(ca);
      const pb = purPyr(cb);
      if (pa && pb) {
        bump('purpyr', pa === pb);
        bump('sw', strongWeak(ca) === strongWeak(cb));
        bump('mk', aminoKeto(ca) === aminoKeto(cb));
        if (isTransition(ca, cb)) transitions++;
        else if (isTransversion(ca, cb)) transversions++;
      }
      bump('iupac', iupacCompatible(normNuc(ca), normNuc(cb)));
    } else if (AA_CLASS[ca] && AA_CLASS[cb]) {
      bump('strong', same || inSameGroup(ca, cb, CLUSTAL_STRONG));
      bump('class', AA_CLASS[ca] === AA_CLASS[cb]);
      bump('charge', aaCharge(ca) === aaCharge(cb));
      bump('hydro', hydropathySign(ca) === hydropathySign(cb));
      if (!same) {
        dH += Math.abs(KYTE_DOOLITTLE[ca] - KYTE_DOOLITTLE[cb]);
        dHn++;
      }
    }
  }
  const num = (n: RowNumbering, k: number) => (n.strand === 1 ? n.start + k - 1 : n.start - (k - 1));
  const properties: PropertyAgreement[] = [];
  const prop = (key: string, label: string, hint: string) =>
    properties.push({ key, label, hint, agree: agree[key] ?? 0, total: total[key] ?? 0 });
  if (nucleotide) {
    prop('purpyr', 'Purine / Pyrimidine 일치', '같은 염기 종류(A,G = purine / C,T = pyrimidine)끼리 짝지어진 비율. 불일치 중 transition 은 여기서 일치로 셈.');
    prop('sw', 'Strong / Weak (GC vs AT) 일치', 'G·C(수소결합 3개)와 A·T(2개) 구분이 유지된 비율.');
    prop('mk', 'Amino / Keto 일치', 'A·C(amino)와 G·T(keto) 구분이 유지된 비율.');
    prop('iupac', 'IUPAC 호환 일치', 'N, R, Y 같은 모호 코드를 "같은 염기일 수 있음"으로 인정했을 때의 일치 비율.');
  } else {
    prop('strong', 'Clustal strong group 보존', '동일하거나 Clustal 강한 보존 그룹(STA, NEQK, MILV, FYW …) 안에서의 치환 비율.');
    prop('class', '물리화학적 계열 일치', `Lehninger 5계열(지방족 / 방향족 / 극성 / 양전하 / 음전하)이 같은 비율.`);
    prop('charge', '전하 일치', '양전하(K,R,H) / 음전하(D,E) / 중성이 유지된 비율.');
    prop('hydro', '소수성 일치 (Kyte-Doolittle)', 'Kyte-Doolittle hydropathy 부호(소수성 > 0 / 친수성 ≤ 0)가 유지된 비율.');
  }
  const gc = (s: string) => {
    let g = 0;
    let n = 0;
    for (const c of s) {
      if (c === GAP) continue;
      n++;
      if (c === 'G' || c === 'C') g++;
    }
    return pct(g, n);
  };
  return {
    columns,
    overlapStart,
    overlapEnd,
    overlapColumns,
    pairs,
    identical,
    similar,
    gapPositions,
    gapOpens,
    insPositions,
    insEvents,
    delPositions,
    delEvents,
    rangeA: firstA > 0 ? [num(numA, firstA), num(numA, lastA)] : null,
    rangeB: firstB > 0 ? [num(numB, firstB), num(numB, lastB)] : null,
    residuesA: resA,
    residuesB: resB,
    properties,
    dna: nucleotide ? { transitions, transversions, gcA: gc(a), gcB: gc(b) } : undefined,
    protein: nucleotide ? undefined : { meanAbsDeltaHydropathy: dHn ? dH / dHn : null, substitutions: dHn },
  };
}

export interface ColumnStats {
  length: number;
  consensus: string[];
  /** Fraction of all rows carrying the consensus residue. */
  consensusFrac: Float32Array;
  gapFrac: Float32Array;
  /** Clustal-style symbols: '*' identical, ':' strong group, '.' weak group, ' ' none. */
  symbols: string[];
}

export function computeColumnStats(rows: string[], seqType: SeqType): ColumnStats {
  const nucleotide = seqType !== 'protein';
  const L = rows[0]?.length ?? 0;
  const N = rows.length;
  const consensus: string[] = new Array(L);
  const consensusFrac = new Float32Array(L);
  const gapFrac = new Float32Array(L);
  const symbols: string[] = new Array(L);
  const counts = new Map<string, number>();
  for (let c = 0; c < L; c++) {
    counts.clear();
    let gaps = 0;
    const chars: string[] = [];
    for (let r = 0; r < N; r++) {
      let ch = rows[r][c];
      if (ch === GAP) {
        gaps++;
        continue;
      }
      if (nucleotide) ch = normNuc(ch);
      chars.push(ch);
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    let best = GAP;
    let bestN = 0;
    for (const [ch, n] of counts)
      if (n > bestN) {
        best = ch;
        bestN = n;
      }
    const cons = gaps > bestN ? GAP : best;
    consensus[c] = cons;
    consensusFrac[c] = cons === GAP ? 0 : bestN / N;
    gapFrac[c] = gaps / N;
    let sym = ' ';
    if (gaps === 0 && N > 1) {
      if (counts.size === 1) sym = '*';
      else if (!nucleotide && allInOneGroup(chars, CLUSTAL_STRONG)) sym = ':';
      else if (!nucleotide && allInOneGroup(chars, CLUSTAL_WEAK)) sym = '.';
    }
    symbols[c] = sym;
  }
  return { length: L, consensus, consensusFrac, gapFrac, symbols };
}

export interface IdentityCell {
  identity: number; // percent over aligned pairs
  pairs: number;
}

export function identityMatrix(rows: string[], nucleotide: boolean): IdentityCell[][] {
  const N = rows.length;
  const out: IdentityCell[][] = Array.from({ length: N }, () => new Array<IdentityCell>(N));
  for (let i = 0; i < N; i++) {
    out[i][i] = { identity: 100, pairs: rows[i].replace(/-/g, '').length };
    for (let j = i + 1; j < N; j++) {
      let pairs = 0;
      let same = 0;
      const a = rows[i];
      const b = rows[j];
      for (let c = 0; c < a.length; c++) {
        if (a[c] === GAP || b[c] === GAP) continue;
        pairs++;
        if (sameResidue(a[c], b[c], nucleotide)) same++;
      }
      out[i][j] = out[j][i] = { identity: pct(same, pairs), pairs };
    }
  }
  return out;
}

/** prefix[c] = number of residues in row before column c (length L + 1). */
export function residuePrefix(row: string): Int32Array {
  const p = new Int32Array(row.length + 1);
  for (let c = 0; c < row.length; c++) p[c + 1] = p[c] + (row[c] === GAP ? 0 : 1);
  return p;
}
