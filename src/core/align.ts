// Orchestrates an alignment run from the user's sequences and settings.
import { dnaScoring, proteinScoring, type Scoring } from './matrices';
import { kmerDistance, mergeOnReference, progressiveAlign, type QueryPlacement } from './msa';
import { alignPairRaw, type DPResult } from './pairwise';
import { detectSetType, reverseComplement, type SeqRecord, type SeqType } from './seq';
import type { Alignment, AlignSettings, AlignedRow, ProgressFn } from './types';

export const DEFAULT_ALIGN_SETTINGS: AlignSettings = {
  seqType: 'auto',
  strategy: 'reference',
  mode: 'semiglobal',
  referenceIndex: 0,
  proteinMatrix: 'BLOSUM62',
  dnaMatrix: 'NUC.4.4',
  dnaMatch: 5,
  dnaMismatch: -4,
  gapOpen: 10,
  gapExtend: 0.5,
  bothStrands: true,
};

export function scoringFor(seqType: SeqType, s: AlignSettings): Scoring {
  return seqType === 'protein' ? proteinScoring(s.proteinMatrix) : dnaScoring(s.dnaMatrix, s.dnaMatch, s.dnaMismatch);
}

export function resolveSeqType(records: SeqRecord[], s: AlignSettings): SeqType {
  return s.seqType === 'auto' ? detectSetType(records.map((r) => r.seq)) : s.seqType;
}

export function runAlignment(records: SeqRecord[], s: AlignSettings, onProgress?: ProgressFn): Alignment {
  const t0 = performance.now();
  const recs = records.filter((r) => r.seq.length > 0);
  if (recs.length < 2) throw new Error('정렬하려면 서열이 2개 이상 필요합니다.');
  const seqType = resolveSeqType(recs, s);
  const nucleotide = seqType !== 'protein';
  const scoring = scoringFor(seqType, s);
  const warnings: string[] = [];
  const pair = { scoring, gapOpen: s.gapOpen, gapExtend: s.gapExtend };
  const tryStrands = nucleotide && s.bothStrands;

  let rows: AlignedRow[];
  let scores: (number | null)[] = recs.map(() => null);
  let referenceIndex = 0;

  if (s.strategy === 'reference') {
    referenceIndex = Math.min(Math.max(0, s.referenceIndex), recs.length - 1);
    const ref = recs[referenceIndex];
    const others = recs.map((_, i) => i).filter((i) => i !== referenceIndex);
    const placements: (QueryPlacement & { strand: 1 | -1 })[] = [];
    others.forEach((qi, k) => {
      const q = recs[qi].seq;
      let best: { seq: string; dp: DPResult; strand: 1 | -1 } = {
        seq: q,
        dp: alignPairRaw(ref.seq, q, { ...pair, mode: s.mode }),
        strand: 1,
      };
      if (tryStrands) {
        const rc = reverseComplement(q, seqType === 'rna');
        const dp = alignPairRaw(ref.seq, rc, { ...pair, mode: s.mode });
        if (dp.score > best.dp.score) {
          best = { seq: rc, dp, strand: -1 };
          warnings.push(`"${recs[qi].name}" 은(는) 역상보(reverse complement) 가닥이 더 잘 맞아 뒤집어서 정렬했습니다.`);
        }
      }
      placements.push(best);
      onProgress?.('레퍼런스에 정렬 중', (k + 1) / others.length);
    });
    const merged = mergeOnReference(ref.seq, placements);
    rows = [];
    scores = [];
    let q = 0;
    recs.forEach((r, i) => {
      if (i === referenceIndex) {
        rows.push({ id: r.id, name: r.name, aligned: merged.ref, start: 1, strand: 1, length: r.seq.length });
        scores.push(null);
      } else {
        const p = placements[q];
        const start = p.strand === 1 ? p.dp.bStart + 1 : r.seq.length - p.dp.bStart;
        rows.push({ id: r.id, name: r.name, aligned: merged.queries[q], start, strand: p.strand, length: r.seq.length });
        scores.push(p.dp.score);
        if (s.mode === 'local' && p.dp.ops.length === 0) warnings.push(`"${r.name}" 은(는) 레퍼런스와 유의미한 local 매칭이 없습니다.`);
        q++;
      }
    });
  } else {
    if (s.mode === 'local' || s.mode === 'fit') {
      warnings.push('다중 서열 정렬(progressive MSA)은 global/semiglobal 만 지원하므로 semiglobal 로 실행했습니다.');
    }
    const oriented = recs.map((r, i) => {
      if (!tryStrands || i === 0) return { seq: r.seq, strand: 1 as const };
      const rc = reverseComplement(r.seq, seqType === 'rna');
      const small = recs[0].seq.length * r.seq.length <= 20_000_000;
      let useRc: boolean;
      if (small) {
        const f = alignPairRaw(recs[0].seq, r.seq, { ...pair, mode: 'semiglobal' }).score;
        const b = alignPairRaw(recs[0].seq, rc, { ...pair, mode: 'semiglobal' }).score;
        useRc = b > f;
      } else {
        useRc = kmerDistance(recs[0].seq, rc, 8) < kmerDistance(recs[0].seq, r.seq, 8);
      }
      if (useRc) warnings.push(`"${r.name}" 은(는) 역상보(reverse complement) 방향으로 뒤집어서 정렬했습니다.`);
      return useRc ? { seq: rc, strand: -1 as const } : { seq: r.seq, strand: 1 as const };
    });
    const res = progressiveAlign(
      oriented.map((o) => o.seq),
      { ...pair, mode: s.mode, onProgress },
    );
    if (res.distanceMethod === 'kmer') warnings.push('서열이 길어 guide tree 거리를 k-mer 기반으로 근사했습니다.');
    rows = recs.map((r, i) => ({
      id: r.id,
      name: r.name,
      aligned: res.rows[i],
      start: oriented[i].strand === 1 ? 1 : r.seq.length,
      strand: oriented[i].strand,
      length: r.seq.length,
    }));
  }

  return {
    rows,
    seqType,
    strategy: s.strategy,
    mode: s.strategy === 'msa' && (s.mode === 'local' || s.mode === 'fit') ? 'semiglobal' : s.mode,
    scoringName: scoring.name,
    gapOpen: s.gapOpen,
    gapExtend: s.gapExtend,
    referenceIndex,
    scores,
    warnings,
    elapsedMs: performance.now() - t0,
  };
}
