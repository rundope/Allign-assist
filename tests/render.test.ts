import { describe, expect, it } from 'vitest';
import { DEFAULT_ALIGN_SETTINGS } from '../src/core/align';
import type { Alignment } from '../src/core/types';
import { buildModel, categorize, cellStyle, residueAt } from '../src/render/model';
import { DEFAULT_VIEW } from '../src/ui/state';

const aln = (rows: string[], seqType: 'dna' | 'protein' = 'dna'): Alignment => ({
  rows: rows.map((r, i) => ({ id: String(i), name: `s${i}`, aligned: r, start: 1, strand: 1, length: r.replace(/-/g, '').length })),
  seqType,
  strategy: 'reference',
  mode: 'fit',
  scoringName: 'x',
  gapOpen: 10,
  gapExtend: 0.5,
  referenceIndex: 0,
  scores: rows.map(() => null),
  warnings: [],
  elapsedMs: 0,
});

describe('render model', () => {
  const view = structuredClone(DEFAULT_VIEW);
  it('classifies cells against the reference row', () => {
    const m = buildModel(aln(['ACGTACGTAC', '--GTGC-TA-']), view, DEFAULT_ALIGN_SETTINGS);
    const cats = [...'0123456789'].map((_, c) => categorize(m, 1, c));
    expect(cats).toEqual(['terminal', 'terminal', 'match', 'match', 'similar', 'match', 'gap', 'match', 'match', 'terminal']);
    // reference row: aggregated result of the other rows
    expect(categorize(m, 0, 4)).toBe('similar');
    expect(categorize(m, 0, 6)).toBe('indel');
    expect(categorize(m, 0, 0)).toBe('plain');
  });
  it('terminal gaps render blank and dots replace identical residues', () => {
    const m = buildModel(aln(['ACGT', '-CGA']), { ...view, dotIdentical: true }, DEFAULT_ALIGN_SETTINGS);
    expect(cellStyle(m, 1, 0).ch).toBe(' ');
    expect(cellStyle(m, 1, 1).ch).toBe('.');
    expect(cellStyle(m, 1, 3).ch).toBe('A');
  });
  it('crop to aligned region and residue numbering', () => {
    const m = buildModel(aln(['AAAACGTAAAA', '----CGT----']), { ...view, viewRange: 'aligned' }, DEFAULT_ALIGN_SETTINGS);
    expect([m.c0, m.c1]).toEqual([4, 7]);
    expect(residueAt(m, 0, 5)).toBe(6);
    expect(residueAt(m, 1, 5)).toBe(2);
  });
});
