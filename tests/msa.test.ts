import { describe, expect, it } from 'vitest';
import { runAlignment, DEFAULT_ALIGN_SETTINGS } from '../src/core/align';
import { mergeOnReference, progressiveAlign, upgma } from '../src/core/msa';
import { alignPairRaw } from '../src/core/pairwise';
import { dnaScoring, proteinScoring } from '../src/core/matrices';
import { reverseComplement, type SeqRecord } from '../src/core/seq';

const rec = (name: string, seq: string): SeqRecord => ({ id: name, name, seq });
const strip = (s: string) => s.replace(/-/g, '');

describe('reference-anchored merge', () => {
  it('keeps every sequence intact and all rows equal length', () => {
    const ref = 'ATGGCGTACGATCGATCGTAGCTAGCTAGGCTAGCATCGA';
    const qs = ['GCGTACGATTTCGATCGTAG', 'CTAGCTAGGCTAGCATCGAGGG', 'CCCATGGCGTAC'];
    const sc = { scoring: dnaScoring('NUC.4.4'), gapOpen: 10, gapExtend: 0.5, mode: 'semiglobal' as const };
    const placements = qs.map((q) => ({ seq: q, dp: alignPairRaw(ref, q, sc) }));
    const m = mergeOnReference(ref, placements);
    expect(strip(m.ref)).toBe(ref);
    m.queries.forEach((q, k) => {
      expect(q.length).toBe(m.ref.length);
      expect(strip(q)).toBe(qs[k]);
    });
    // leading overhang of the 3rd query is right-aligned against the reference start
    expect(m.queries[2].indexOf('ATGGCG')).toBe(m.ref.indexOf('ATGGCG'));
  });

  it('detects reverse-complement queries', () => {
    const ref = 'ATGACCATGATTACGCCAAGCTTGCATGCCTGCAGGTCGACTCTAGAGGATCC';
    const frag = ref.slice(10, 40);
    const out = runAlignment([rec('ref', ref), rec('rc', reverseComplement(frag))], { ...DEFAULT_ALIGN_SETTINGS, mode: 'fit' });
    expect(out.rows[1].strand).toBe(-1);
    expect(out.rows[1].aligned).toBe('-'.repeat(10) + frag + '-'.repeat(ref.length - 40));
    expect(out.rows[1].start).toBe(frag.length);
  });

  it('local mode numbers the query from its matched start', () => {
    const out = runAlignment(
      [rec('ref', 'GGGGGGGGGGACGTACGTACGTGGGGGGGG'), rec('q', 'TTTTTACGTACGTACGTTTTTT')],
      { ...DEFAULT_ALIGN_SETTINGS, mode: 'local', dnaMatrix: 'simple', dnaMatch: 1, dnaMismatch: -2, gapOpen: 3, gapExtend: 1, bothStrands: false },
    );
    expect(out.rows[1].start).toBe(6);
    expect(strip(out.rows[1].aligned)).toBe('ACGTACGTACGT');
  });
});

describe('progressive MSA', () => {
  it('UPGMA joins the closest pair first', () => {
    const t = upgma([
      [0, 0.1, 0.8],
      [0.1, 0, 0.8],
      [0.8, 0.8, 0],
    ]);
    const leaves = (n: typeof t): number[] => (n.leaf !== undefined ? [n.leaf] : [...leaves(n.left!), ...leaves(n.right!)]);
    const sub = t.left!.leaf !== undefined ? t.right! : t.left!;
    expect(leaves(sub).sort()).toEqual([0, 1]);
  });

  it('aligns related proteins, preserving sequences and input order', () => {
    const seqs = [
      'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDWUAAHQ'.replace(/U/g, ''),
      'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGKLSDGHRHDVRAPDYDDW',
      'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVKVKALPDAQFEVVHSLAKWKRQTLGQHDFSAGEGLYTHMKALRPDEDRLSPLHSVYVDQWDWERVMGDGERQFSTLKSTVEAIWAGIKATEAAVSEEFGLAPFLPDQIHFVHSQELLSRYPDLDAKGRERAIAKDLGAVFLVGIGGK',
      'MSTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVVHSLAKWKRQ',
    ];
    const res = progressiveAlign(seqs, { scoring: proteinScoring('BLOSUM62'), gapOpen: 10, gapExtend: 0.5, mode: 'semiglobal' });
    const L = res.rows[0].length;
    res.rows.forEach((r, i) => {
      expect(r.length).toBe(L);
      expect(strip(r)).toBe(seqs[i]);
    });
    // the 4-residue deletion (QVKV -> KV) in seq 3 is placed as one gap block
    expect(res.rows[2]).toMatch(/AV--KVKALP|AVK--VKALP|A--VKVKALP|AV-{2}KV/);
  });

  it('full pipeline: MSA strategy with DNA', () => {
    const base = 'ATGGCTAGCTAGGATCGATCGGATCGATTAGCTAGCTAGCTAGGATCCGATCG';
    const out = runAlignment(
      [rec('a', base), rec('b', base.replace('GGATCG', 'GGTTCG')), rec('c', base.slice(5, 45)), rec('d', base.slice(0, 20) + 'AAA' + base.slice(20))],
      { ...DEFAULT_ALIGN_SETTINGS, strategy: 'msa' },
    );
    expect(out.rows).toHaveLength(4);
    const L = out.rows[0].aligned.length;
    out.rows.forEach((r) => expect(r.aligned.length).toBe(L));
    expect(strip(out.rows[3].aligned)).toBe(base.slice(0, 20) + 'AAA' + base.slice(20));
  });
});
