// Differences of each sequence against a reference row, as a list of events
// (substitutions, insertions, deletions) in reference coordinates.
import type { Scoring } from './matrices';
import { iupacCompatible } from './matrices';
import { isTransition, normNuc } from './properties';
import { pairScore } from './matrices';
import type { AlignedRow } from './types';

export type VariantKind = 'sub' | 'ins' | 'del' | 'amb';
export type SubClass = 'transition' | 'transversion' | 'conservative' | 'radical';

export interface Variant {
  row: number;
  kind: VariantKind;
  /** Alignment columns covered, [col0, col1] inclusive. */
  col0: number;
  col1: number;
  /** Reference residue numbers. For an insertion: the residues it sits between. */
  refStart: number;
  refEnd: number;
  ref: string;
  alt: string;
  subClass?: SubClass;
  /** HGVS-style label, e.g. 181A>G, 211_213del, 420_421insGATTACA, K45R. */
  label: string;
}

export interface RowVariants {
  row: number;
  variants: Variant[];
  counts: Record<VariantKind, number>;
}

const NUC = new Set(['A', 'C', 'G', 'T', 'U']);

function refNumber(row: AlignedRow, k: number): number {
  return row.strand === 1 ? row.start + k - 1 : row.start - (k - 1);
}

/**
 * Call variants of every row against `refRow`. Only columns inside both rows' spans
 * count (overhangs are not variants). Consecutive gap columns merge into one event.
 */
export function callVariants(rows: AlignedRow[], refRow: number, nucleotide: boolean, scoring: Scoring): RowVariants[] {
  const ref = rows[refRow];
  const r = ref.aligned;
  const L = r.length;
  const span = (s: string) => {
    let a = 0;
    while (a < s.length && s[a] === '-') a++;
    let b = s.length - 1;
    while (b >= 0 && s[b] === '-') b--;
    return [a, b] as const;
  };
  const [rf, rl] = span(r);
  // refCount[c] = reference residues up to and including column c
  const refCount = new Int32Array(L);
  let n = 0;
  for (let c = 0; c < L; c++) {
    if (r[c] !== '-') n++;
    refCount[c] = n;
  }
  const out: RowVariants[] = [];
  rows.forEach((row, i) => {
    if (i === refRow) return;
    const q = row.aligned;
    const [qf, ql] = span(q);
    const lo = Math.max(qf, rf);
    const hi = Math.min(ql, rl);
    const vs: Variant[] = [];
    let c = lo;
    while (c <= hi) {
      const a = r[c];
      const b = q[c];
      if (a === '-' && b === '-') {
        c++;
        continue;
      }
      if (a !== '-' && b !== '-') {
        const same = nucleotide ? normNuc(a) === normNuc(b) : a === b;
        if (!same) {
          const pos = refNumber(ref, refCount[c]);
          const ambiguous = nucleotide ? !NUC.has(a) || !NUC.has(b) : a === 'X' || b === 'X';
          if (ambiguous && (!nucleotide || iupacCompatible(normNuc(a), normNuc(b)))) {
            vs.push({ row: i, kind: 'amb', col0: c, col1: c, refStart: pos, refEnd: pos, ref: a, alt: b, label: nucleotide ? `${pos}${a}>${b}` : `${a}${pos}${b}` });
          } else {
            const subClass: SubClass = nucleotide
              ? isTransition(a, b)
                ? 'transition'
                : 'transversion'
              : pairScore(scoring, a, b) > 0
                ? 'conservative'
                : 'radical';
            vs.push({ row: i, kind: 'sub', col0: c, col1: c, refStart: pos, refEnd: pos, ref: a, alt: b, subClass, label: nucleotide ? `${pos}${a}>${b}` : `${a}${pos}${b}` });
          }
        }
        c++;
        continue;
      }
      // a run of gap columns of the same kind
      const kind: VariantKind = b === '-' ? 'del' : 'ins';
      let e = c;
      let refRes = '';
      let alt = '';
      while (e <= hi) {
        const ae = r[e];
        const be = q[e];
        if (ae === '-' && be === '-') {
          e++;
          continue;
        }
        if (kind === 'del' ? be !== '-' || ae === '-' : ae !== '-' || be === '-') break;
        if (kind === 'del') refRes += ae;
        else alt += be;
        e++;
      }
      const end = e - 1;
      if (kind === 'del') {
        const p0 = refNumber(ref, refCount[c]);
        const p1 = refNumber(ref, refCount[end]);
        const label = nucleotide
          ? `${p0 === p1 ? p0 : `${p0}_${p1}`}del`
          : `${refRes[0]}${p0}${refRes.length > 1 ? `_${refRes[refRes.length - 1]}${p1}` : ''}del`;
        vs.push({ row: i, kind, col0: c, col1: end, refStart: p0, refEnd: p1, ref: refRes, alt: '', label });
      } else {
        // between the reference residue before the run and the one after it
        const before = refCount[c];
        const p0 = refNumber(ref, before);
        const p1 = refNumber(ref, before + 1);
        const leftRes = r.slice(0, c).replace(/-/g, '').slice(-1);
        const rightRes = r.slice(end + 1).replace(/-/g, '')[0] ?? '';
        const label = nucleotide ? `${p0}_${p1}ins${alt}` : `${leftRes}${p0}_${rightRes}${p1}ins${alt}`;
        vs.push({ row: i, kind, col0: c, col1: end, refStart: p0, refEnd: p1, ref: '', alt, label });
      }
      c = e;
    }
    const counts: Record<VariantKind, number> = { sub: 0, ins: 0, del: 0, amb: 0 };
    for (const v of vs) counts[v.kind]++;
    out.push({ row: i, variants: vs, counts });
  });
  return out;
}
