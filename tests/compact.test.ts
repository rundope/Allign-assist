import { describe, expect, it } from 'vitest';
import { DEFAULT_ALIGN_SETTINGS } from '../src/core/align';
import type { Alignment } from '../src/core/types';
import { buildModel } from '../src/render/model';
import { compactHit, compactPos, computeCompactLayout } from '../src/render/compact';
import { DEFAULT_VIEW } from '../src/ui/state';

const aln = (rows: string[]): Alignment => ({
  rows: rows.map((r, i) => ({ id: String(i), name: `s${i}`, aligned: r, start: 1, strand: 1, length: r.replace(/-/g, '').length })),
  seqType: 'dna', strategy: 'reference', mode: 'fit', scoringName: 'x', gapOpen: 10, gapExtend: 0.5,
  referenceIndex: 0, scores: rows.map(() => null), warnings: [], elapsedMs: 0,
});
const model = (L: number, n = 3) => buildModel(aln(Array.from({ length: n }, () => 'ACGT'.repeat(L / 4))), structuredClone(DEFAULT_VIEW), DEFAULT_ALIGN_SETTINGS);

describe('compact layout', () => {
  it('short alignments keep readable letters and fit the box', () => {
    const l = computeCompactLayout(model(600), 1000, 600);
    expect(l.showLetters).toBe(true);
    expect(l.height).toBeLessThanOrEqual(600);
  });
  it('long alignments switch to colour cells, still fit, and keep rows tall enough for names', () => {
    const l = computeCompactLayout(model(6000, 6), 1000, 560);
    expect(l.showLetters).toBe(false);
    expect(l.height).toBeLessThanOrEqual(560);
    expect(l.rowH).toBeGreaterThanOrEqual(10);
    expect(l.showNames).toBe(true);
  });
  it('hit testing and positions are inverse of each other', () => {
    const m = model(2000);
    const l = computeCompactLayout(m, 900, 500);
    for (const c of [0, 1, l.perLine - 1, l.perLine, 1999]) {
      const p = compactPos(l, m, c);
      const hit = compactHit(l, m, p.x + l.cellW / 2, p.y + l.rowH * 1.5);
      expect(hit).toEqual({ r: 1, c });
    }
  });
});
