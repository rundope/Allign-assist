import { describe, expect, it } from 'vitest';
import { DEFAULT_ALIGN_SETTINGS } from '../src/core/align';
import type { Alignment } from '../src/core/types';
import { linkTrace } from '../src/core/trace';
import { buildModel, categorize, cellStyle, residueAt } from '../src/render/model';
import { blockContent, cellX, computeGeometry, TRACE_COLOR } from '../src/render/svg';
import { synthChromatogram } from '../src/ui/demoTrace';
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

describe('chromatogram track above a row', () => {
  // read = base calls; the alignment gives it one internal gap (column 6)
  const calls = 'ACGTACGTAC';
  const chrom = synthChromatogram(calls, { seed: 3, rampLength: 1 });
  const setup = (over: Partial<typeof DEFAULT_VIEW> = {}) => {
    const view = { ...structuredClone(DEFAULT_VIEW), groupSize: 0, residuesPerLine: 20, ...over };
    const m = buildModel(aln(['TTACGTAACGTACTT', '--ACGT-ACGTAC--']), view, DEFAULT_ALIGN_SETTINGS);
    m.traces = [null, { fileName: 'x.ab1', chrom, link: linkTrace(calls, chrom) }];
    const geo = computeGeometry(m, 1000);
    return { m, geo };
  };
  /** Points of the path drawn in the given colour. */
  const points = (svg: string, color: string) =>
    [...svg.matchAll(new RegExp(`<path d="([^"]+)" fill="none" stroke="${color}"`, 'g'))].flatMap((mm) =>
      [...mm[1].matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((p) => ({ x: Number(p[1]), y: Number(p[2]) })),
    );

  it('makes room for the trace above the row only', () => {
    const { geo } = setup();
    const [b0] = geo.blocks;
    expect(b0.traced).toEqual([false, true]);
    expect(b0.rowY[1] - b0.rowY[0]).toBe(geo.cellH + DEFAULT_VIEW.rowGap + geo.traceH);
    const off = setup({ showTraces: false }).geo.blocks[0];
    expect(off.traced).toEqual([false, false]);
    expect(off.rowY[1] - off.rowY[0]).toBe(geo.cellH + DEFAULT_VIEW.rowGap);
    expect(b0.h - off.h).toBe(geo.traceH);
  });

  it('adds the strip only to blocks where the read has base calls', () => {
    // 5 columns per line: block 0 = columns 0-4 (read starts at 2), block 2 = columns 10-14 (read ends at 12)
    const { geo } = setup({ residuesPerLine: 5 });
    expect(geo.blocks.map((b) => b.traced[1])).toEqual([true, true, true]);
    const view = { ...structuredClone(DEFAULT_VIEW), groupSize: 0, residuesPerLine: 5 };
    const m = buildModel(aln(['TTACGTAACGTACTTGGGGG', '--ACGT-ACGTAC-------']), view, DEFAULT_ALIGN_SETTINGS);
    m.traces = [null, { fileName: 'x.ab1', chrom, link: linkTrace(calls, chrom) }];
    const g = computeGeometry(m, 1000);
    expect(g.blocks.map((b) => b.traced[1])).toEqual([true, true, true, false]);
    expect(g.blocks[3].h).toBe(g.blocks[0].h - g.traceH);
    expect(g.blocks[3].top).toBe(g.blocks[2].top + g.blocks[2].h + view.blockGap);
    expect(g.totalH).toBe(g.blocks[3].top + g.blocks[3].h);
  });

  it('puts each peak in the column of its base and leaves the gap column empty', () => {
    const { m, geo } = setup();
    const svg = blockContent(geo, m, 0);
    const rowTop = geo.blocks[0].rowY[1];
    const centre = (c: number) => cellX(geo, m, c) + geo.tileW / 2;
    const half = geo.cellW / 2;
    // read residues sit in columns 2-5 and 7-12
    const cols = [2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
    cols.forEach((c, i) => {
      const b = calls[i] as 'A' | 'C' | 'G' | 'T';
      const pts = points(svg, b === 'G' ? DEFAULT_VIEW.textColor : TRACE_COLOR[b]).filter((p) => Math.abs(p.x - centre(c)) < half);
      const top = pts.reduce((a, p) => (p.y < a.y ? p : a));
      expect(Math.abs(top.x - centre(c))).toBeLessThan(geo.cellW * 0.3);
      // the peak rises inside the strip above the row (end peaks of a read are lower)
      expect(top.y).toBeLessThan(rowTop - 6);
      expect(top.y).toBeGreaterThan(rowTop - geo.traceH);
    });
    const all = ['#1a9850', '#2166ac', '#d7301f', DEFAULT_VIEW.textColor].flatMap((c) => points(svg, c));
    expect(all.filter((p) => Math.abs(p.x - centre(6)) < half - 0.5)).toEqual([]);
  });

  it('flips the trace and complements the channels for a reverse-complemented row', () => {
    const { m, geo } = setup();
    m.aln.rows[1].strand = -1;
    const svg = blockContent(geo, m, 0);
    // the first residue of the row is now shown as the complement of the last call (C -> G drawn in text colour)
    const c = 2;
    const centre = cellX(geo, m, c) + geo.tileW / 2;
    const pts = points(svg, DEFAULT_VIEW.textColor).filter((p) => Math.abs(p.x - centre) < geo.cellW / 2);
    const top = pts.reduce((a, p) => (p.y < a.y ? p : a));
    expect(Math.abs(top.x - centre)).toBeLessThan(geo.cellW * 0.3);
  });
});
