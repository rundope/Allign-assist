import { describe, expect, it } from 'vitest';
import { detectType, parseSequences, reverseComplement } from '../src/core/seq';
import { computeColumnStats, computePairStats, identityMatrix } from '../src/core/stats';
import { dnaScoring, proteinScoring } from '../src/core/matrices';

describe('parsing', () => {
  it('parses multi-FASTA', () => {
    const r = parseSequences('>one desc\nACGT\nacgt\n>two\nMKV LLA\n');
    expect(r.map((x) => [x.name, x.seq])).toEqual([
      ['one desc', 'ACGTACGT'],
      ['two', 'MKVLLA'],
    ]);
  });
  it('parses GenBank ORIGIN', () => {
    const gb = 'LOCUS       pUC19   2686 bp DNA\nDEFINITION  test.\nORIGIN\n        1 tcgcgcgttt cggtgatgac\n       21 ggtg\n//\n';
    const r = parseSequences(gb);
    expect(r[0].name).toBe('pUC19');
    expect(r[0].seq).toBe('TCGCGCGTTTCGGTGATGACGGTG');
  });
  it('plain text strips numbers and spaces', () => {
    expect(parseSequences('1 acg t\n 5 NNa', 'x')[0].seq).toBe('ACGTNNA');
  });
  it('detects types', () => {
    expect(detectType('ACGTACGTNNACGT')).toBe('dna');
    expect(detectType('ACGUACGUAC')).toBe('rna');
    expect(detectType('MKVLAAGIVGLLLA')).toBe('protein');
    expect(detectType('ACDEFGHIKLMNPQRSTVWY')).toBe('protein');
  });
  it('reverse complement handles IUPAC', () => {
    expect(reverseComplement('ACGTRYN')).toBe('NRYACGT');
    expect(reverseComplement('ACGU', true)).toBe('ACGU');
  });
});

describe('pair statistics', () => {
  it('DNA identity, transitions and property agreement', () => {
    //            ref: ACGTACGTAC   (A>G transition at col 1, C>A transversion at col 5)
    const a = '--ACGTACGTAC--';
    const b = 'TTGCGTAAGTACGG';
    const s = computePairStats(a, b, { start: 1, strand: 1 }, { start: 1, strand: 1 }, 'dna', dnaScoring());
    expect(s.pairs).toBe(10);
    expect(s.identical).toBe(8);
    expect(s.dna!.transitions).toBe(1);
    expect(s.dna!.transversions).toBe(1);
    const pp = s.properties.find((p) => p.key === 'purpyr')!;
    expect(pp.agree).toBe(9);
    expect(s.rangeA).toEqual([1, 10]);
    expect(s.rangeB).toEqual([3, 12]);
  });
  it('protein similarity uses BLOSUM62 > 0', () => {
    const s = computePairStats('KLVIDE', 'RIVLEE', { start: 1, strand: 1 }, { start: 1, strand: 1 }, 'protein', proteinScoring());
    expect(s.identical).toBe(2); // V, E
    expect(s.similar).toBe(6); // K/R 2, L/I 2, I/L 2, D/E 2
    expect(s.properties.find((p) => p.key === 'charge')!.agree).toBe(6);
  });
  it('reverse strand numbering counts down', () => {
    const s = computePairStats('ACGT', 'ACGT', { start: 1, strand: 1 }, { start: 50, strand: -1 }, 'dna', dnaScoring());
    expect(s.rangeB).toEqual([50, 47]);
  });
  it('gap opens counted inside the overlap only', () => {
    const s = computePairStats('--ACGTACGT', 'GGAC--ACGT', { start: 1, strand: 1 }, { start: 1, strand: 1 }, 'dna', dnaScoring());
    expect(s.gapPositions).toBe(2);
    expect(s.gapOpens).toBe(1);
    expect(s.overlapColumns).toBe(8);
  });
});

describe('column statistics', () => {
  it('consensus and clustal symbols', () => {
    const c = computeColumnStats(['MKLV-', 'MRIV-', 'MKLA-'], 'protein');
    expect(c.consensus.join('')).toBe('MKLV-');
    expect(c.symbols.join('')).toBe('*::. ');
    expect(c.consensusFrac[0]).toBeCloseTo(1);
    expect(c.consensusFrac[1]).toBeCloseTo(2 / 3);
  });
  it('identity matrix', () => {
    const m = identityMatrix(['ACGT', 'ACGA', 'AC--'], true);
    expect(m[0][1].identity).toBe(75);
    expect(m[0][2].identity).toBe(100);
    expect(m[0][2].pairs).toBe(2);
  });
});
