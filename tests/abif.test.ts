// ABIF parser checked against Biopython 1.88 on its own test chromatograms.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAbif } from '../src/core/abif';
import expected from './fixtures/abi/expected.json';

const load = (f: string) => {
  const b = readFileSync(new URL(`./fixtures/abi/${f}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe('ABIF (.ab1) parser', () => {
  for (const [file, exp] of Object.entries(expected as Record<string, { seq: string; quality: number[]; ploc: number[]; order: string; dataLen: number; dataSums: number[]; data9head: number[] }>)) {
    it(`${file} matches Biopython`, () => {
      const c = parseAbif(load(file));
      expect(c.bases).toBe(exp.seq);
      expect(c.quality).toEqual(exp.quality);
      expect(c.peaks).toEqual(exp.ploc);
      expect(c.traceLength).toBe(exp.dataLen);
      // DATA9..12 follow the FWO_1 base order
      const byOrder = [...exp.order].map((b) => c.channels[b as 'A' | 'C' | 'G' | 'T']);
      byOrder.forEach((ch, k) => expect(ch.reduce((s, v) => s + v, 0)).toBe(exp.dataSums[k]));
      expect(Array.from(byOrder[0].slice(0, 20))).toEqual(exp.data9head);
    });
  }
  it('rejects files that are not ABIF', () => {
    expect(() => parseAbif(load('fake.ab1'))).toThrow();
    expect(() => parseAbif(new TextEncoder().encode('>seq\nACGT').buffer)).toThrow(/AB1/);
  });
});

import { linkTrace } from '../src/core/trace';
import { reverseComplement } from '../src/core/seq';

describe('linking a sequence to its chromatogram', () => {
  const c = parseAbif(load('3100.ab1'));
  it('identical sequence maps one-to-one', () => {
    const l = linkTrace(c.bases, c);
    expect(l.rc).toBe(false);
    expect(l.map[10]).toBe(10);
    expect(l.identity).toBe(1);
  });
  it('a trimmed and edited copy maps to the right calls', () => {
    const trimmed = c.bases.slice(40, 600);
    const edited = trimmed.slice(0, 100) + (trimmed[100] === 'A' ? 'C' : 'A') + trimmed.slice(101);
    const l = linkTrace(edited, c);
    expect(l.rc).toBe(false);
    expect(l.map[0]).toBe(40);
    expect(l.map[100]).toBe(140);
    expect(l.map[559]).toBe(599);
    expect(l.identity).toBeGreaterThan(0.99);
  });
  it('a reverse-complemented copy maps back onto the original calls', () => {
    const rc = reverseComplement(c.bases.slice(100, 500));
    const l = linkTrace(rc, c);
    expect(l.rc).toBe(true);
    expect(l.map[0]).toBe(499); // first residue of the rc copy is the last call used
    expect(l.map[399]).toBe(100);
  });
});

import { synthChromatogram } from '../src/ui/demoTrace';

describe('synthetic demo chromatogram', () => {
  const calls = 'ACGTACGGTACCATGACGTTAGCATGACGATCGATCGTAGCTAGCTAGCATCGACTAGCATCGACTAGCTAGCATCGATCGACTACGATCGACTAGCA';
  const c = synthChromatogram(calls, { seed: 1, doubtful: [50] });
  it('has one peak and one quality value per call, and links 1:1 to its calls', () => {
    expect(c.peaks).toHaveLength(calls.length);
    expect(c.quality).toHaveLength(calls.length);
    expect(linkTrace(calls, c).identity).toBe(1);
  });
  it('is poor at the ends, good in the middle and poor at doubtful positions', () => {
    expect(c.quality[0]).toBeLessThan(20);
    expect(c.quality[40]).toBeGreaterThanOrEqual(30);
    expect(c.quality[50]).toBeLessThan(20);
  });
  it('puts the tallest signal of a clean call in the called channel', () => {
    const p = c.peaks[40];
    const b = calls[40] as 'A' | 'C' | 'G' | 'T';
    for (const o of ['A', 'C', 'G', 'T'] as const) if (o !== b) expect(c.channels[b][p]).toBeGreaterThan(c.channels[o][p]);
  });
});
