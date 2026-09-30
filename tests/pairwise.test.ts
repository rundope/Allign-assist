import { describe, expect, it } from 'vitest';
import { alignPair } from '../src/core/pairwise';
import { dnaScoring, proteinScoring } from '../src/core/matrices';

const dna = dnaScoring('simple', 1, -1);
const opt = (mode: 'global' | 'semiglobal' | 'fit' | 'local', gapOpen = 2, gapExtend = 1) => ({ scoring: dna, gapOpen, gapExtend, mode });
const strip = (s: string) => s.replace(/-/g, '');

describe('matrices', () => {
  it('BLOSUM62 values match NCBI', () => {
    const b = proteinScoring('BLOSUM62');
    const s = (x: string, y: string) => b.matrix[b.lookup[x.charCodeAt(0)] * b.size + b.lookup[y.charCodeAt(0)]];
    expect(s('W', 'W')).toBe(11);
    expect(s('A', 'A')).toBe(4);
    expect(s('C', 'C')).toBe(9);
    expect(s('I', 'V')).toBe(3);
    expect(s('D', 'W')).toBe(-4);
    expect(s('u', 'X')).toBe(-1); // unknown maps to X
  });
  it('NUC.4.4 maps U to T', () => {
    const d = dnaScoring('NUC.4.4');
    const s = (x: string, y: string) => d.matrix[d.lookup[x.charCodeAt(0)] * d.size + d.lookup[y.charCodeAt(0)]];
    expect(s('U', 'T')).toBe(5);
    expect(s('A', 'G')).toBe(-4);
    expect(s('A', 'R')).toBe(1);
  });
});

describe('pairwise', () => {
  it('global alignment of identical sequences has no gaps', () => {
    const r = alignPair('ACGTACGT', 'ACGTACGT', opt('global'));
    expect(r.a).toBe('ACGTACGT');
    expect(r.b).toBe('ACGTACGT');
    expect(r.score).toBe(8);
  });

  it('global alignment places a single deletion', () => {
    const r = alignPair('ACGTTACGT', 'ACGTACGT', opt('global'));
    expect(strip(r.a)).toBe('ACGTTACGT');
    expect(strip(r.b)).toBe('ACGTACGT');
    expect(r.a.length).toBe(9);
    expect(r.score).toBe(8 - 2);
  });

  it('affine gaps prefer one long gap over two short ones', () => {
    const r = alignPair('AAAGGGTTTCCC', 'AAATTTCCC', opt('global', 5, 0.5));
    expect(r.b).toMatch(/^AAA---TTTCCC$/);
    expect(r.score).toBeCloseTo(9 - 5 - 1);
  });

  it('fit mode finds the query inside the reference', () => {
    const ref = 'TTTTTTTTTTGATTACAGATTACATTTTTTTTTT';
    const r = alignPair(ref, 'GATTACAGATTACA', opt('fit'));
    expect(strip(r.a)).toBe(ref);
    expect(r.b.indexOf('G')).toBe(10);
    expect(r.b).toBe('----------GATTACAGATTACA----------');
    expect(r.score).toBe(14);
  });

  it('fit mode penalises query overhang but not reference overhang', () => {
    const r = alignPair('CCCCACGTCCCC', 'ACGT', opt('fit'));
    expect(r.score).toBe(4);
    expect(r.b).toBe('----ACGT----');
  });

  it('semiglobal allows free overhang on both sides', () => {
    const r = alignPair('AAAAACGTACGT', 'ACGTACGTTTTT', opt('semiglobal'));
    expect(r.a).toBe('AAAAACGTACGT----');
    expect(r.b).toBe('----ACGTACGTTTTT');
    expect(r.score).toBe(8);
  });

  it('local alignment returns only the matching region with offsets', () => {
    const r = alignPair('GGGGGGACGTACGTGGGGG', 'TTTACGTACGTTT', opt('local'));
    expect(r.a).toBe('ACGTACGT');
    expect(r.b).toBe('ACGTACGT');
    expect(r.aStart).toBe(6);
    expect(r.bStart).toBe(3);
    expect(r.score).toBe(8);
  });

  it('local alignment with nothing in common is empty', () => {
    const r = alignPair('AAAA', 'CCCC', opt('local'));
    expect(r.a).toBe('');
    expect(r.score).toBe(0);
  });

  it('protein global alignment matches EMBOSS-like scoring', () => {
    const b62 = proteinScoring('BLOSUM62');
    const r = alignPair('HEAGAWGHEE', 'PAWHEAE', { scoring: b62, gapOpen: 10, gapExtend: 0.5, mode: 'global' });
    expect(strip(r.a)).toBe('HEAGAWGHEE');
    expect(strip(r.b)).toBe('PAWHEAE');
    expect(r.a.length).toBe(r.b.length);
  });

  it('handles empty inputs', () => {
    const r = alignPair('', 'ACGT', opt('global'));
    expect(r.a).toBe('----');
    expect(r.b).toBe('ACGT');
    expect(r.score).toBe(-(2 + 3));
  });
});
