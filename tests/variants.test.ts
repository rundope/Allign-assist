import { describe, expect, it } from 'vitest';
import { callVariants } from '../src/core/variants';
import { dnaScoring, proteinScoring } from '../src/core/matrices';
import type { AlignedRow } from '../src/core/types';

const row = (aligned: string, start = 1, strand: 1 | -1 = 1): AlignedRow => ({ id: aligned, name: aligned, aligned, start, strand, length: aligned.replace(/-/g, '').length });

describe('variant calling', () => {
  it('substitutions, deletions and insertions in reference coordinates', () => {
    //              1234567 8901234
    const ref = row('ACGTACG---TACGTAC');
    const q = row('--GTGCGAAATA--TA-');
    const [res] = callVariants([ref, q], 0, true, dnaScoring());
    expect(res.variants.map((v) => v.label)).toEqual(['5A>G', '7_8insAAA', '10_11del']);
    expect(res.variants[0].subClass).toBe('transition');
    expect(res.counts).toEqual({ sub: 1, ins: 1, del: 1, amb: 0 });
  });

  it('ignores overhangs beyond either sequence', () => {
    const [res] = callVariants([row('--ACGT--'), row('TTACGTAA')], 0, true, dnaScoring());
    expect(res.variants).toHaveLength(0);
  });

  it('flags ambiguity codes separately', () => {
    const [res] = callVariants([row('ACGT'), row('ANGT')], 0, true, dnaScoring());
    expect(res.variants[0].kind).toBe('amb');
  });

  it('protein labels and conservative vs radical', () => {
    const [res] = callVariants([row('MKVLW'), row('MRV-G')], 0, false, proteinScoring());
    expect(res.variants.map((v) => v.label)).toEqual(['K2R', 'L4del', 'W5G']);
    expect(res.variants.map((v) => v.subClass)).toEqual(['conservative', undefined, 'radical']);
  });

  it('uses the reference numbering (offset and reverse strand)', () => {
    const [a] = callVariants([row('ACGT', 101), row('ACCT')], 0, true, dnaScoring());
    expect(a.variants[0].label).toBe('103G>C');
    const [b] = callVariants([row('ACGT', 50, -1), row('ACCT')], 0, true, dnaScoring());
    expect(b.variants[0].refStart).toBe(48);
  });
});
