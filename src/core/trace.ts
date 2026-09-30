// Link a sequence to the base calls of its chromatogram, so every residue of the
// sequence knows which trace peak (and quality value) it came from. The sequence may be
// a trimmed or edited copy of the calls, or their reverse complement.
import type { Chromatogram } from './abif';
import { dnaScoring } from './matrices';
import { OP_A, OP_B, OP_PAIR, alignPairRaw } from './pairwise';
import { reverseComplement } from './seq';

export interface TraceLink {
  /** seq index -> base-call index (-1 when the residue has no call, e.g. typed in by hand). */
  map: Int32Array;
  /** True when the sequence matches the reverse complement of the calls. */
  rc: boolean;
  /** Share of sequence residues that sit on an identical base call. */
  identity: number;
}

export function linkTrace(seq: string, chrom: Chromatogram): TraceLink {
  const calls = chrom.bases;
  const n = seq.length;
  if (seq === calls) return { map: Int32Array.from({ length: n }, (_, i) => i), rc: false, identity: 1 };
  const opts = { scoring: dnaScoring('NUC.4.4'), gapOpen: 10, gapExtend: 0.5, mode: 'semiglobal' as const };
  const fwd = alignPairRaw(calls, seq, opts);
  const rcCalls = reverseComplement(calls);
  const rev = alignPairRaw(rcCalls, seq, opts);
  const useRc = rev.score > fwd.score;
  const dp = useRc ? rev : fwd;
  const ref = useRc ? rcCalls : calls;
  const map = new Int32Array(n).fill(-1);
  let ia = dp.aStart;
  let ib = dp.bStart;
  let same = 0;
  for (const op of dp.ops) {
    if (op === OP_PAIR) {
      map[ib] = useRc ? calls.length - 1 - ia : ia;
      if (ref[ia] === seq[ib]) same++;
      ia++;
      ib++;
    } else if (op === OP_A) ia++;
    else if (op === OP_B) ib++;
  }
  return { map, rc: useRc, identity: n ? same / n : 0 };
}

export function qualitySummary(chrom: Chromatogram, threshold: number): { mean: number | null; low: number } {
  const q = chrom.quality;
  if (!q.length) return { mean: null, low: 0 };
  let sum = 0;
  let low = 0;
  for (const v of q) {
    sum += v;
    if (v < threshold) low++;
  }
  return { mean: sum / q.length, low };
}
