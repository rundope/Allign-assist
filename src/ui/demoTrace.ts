// SYNTHETIC chromatograms for the demo data (not real sequencing runs). Each base gets a
// Gaussian peak in its channel; quality falls off at both read ends like a real Sanger
// read, and chosen positions get a weak, overlapping second peak (a doubtful call).
import type { Chromatogram } from '../core/abif';

const SPACING = 12; // trace samples per base
const SIGMA = 2.6;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoTraceOptions {
  seed: number;
  /** Positions (0-based) that get a mixed, low-quality peak. */
  doubtful?: number[];
  /** Bases at each read end whose quality ramps up from poor. */
  rampLength?: number;
}

export function synthChromatogram(calls: string, o: DemoTraceOptions): Chromatogram {
  const rand = rng(o.seed);
  const n = calls.length;
  const ramp = o.rampLength ?? 28;
  const doubtful = new Set(o.doubtful ?? []);
  const traceLength = (n + 2) * SPACING;
  const acc = { A: new Float32Array(traceLength), C: new Float32Array(traceLength), G: new Float32Array(traceLength), T: new Float32Array(traceLength) };
  const peaks: number[] = [];
  const quality: number[] = [];
  const others: Record<string, ('A' | 'C' | 'G' | 'T')[]> = { A: ['C', 'G', 'T'], C: ['A', 'G', 'T'], G: ['A', 'C', 'T'], T: ['A', 'C', 'G'] };
  const addPeak = (ch: Float32Array, center: number, height: number) => {
    const lo = Math.max(0, Math.floor(center - 4 * SIGMA));
    const hi = Math.min(traceLength - 1, Math.ceil(center + 4 * SIGMA));
    for (let t = lo; t <= hi; t++) ch[t] += height * Math.exp(-((t - center) ** 2) / (2 * SIGMA * SIGMA));
  };
  for (let i = 0; i < n; i++) {
    const center = SPACING + i * SPACING + (rand() - 0.5) * 2;
    peaks.push(Math.round(center));
    // quality: poor at both ends, high in the middle, with a little jitter
    const edge = Math.min(1, i / ramp, (n - 1 - i) / ramp);
    let q = Math.round(8 + 46 * edge + (rand() - 0.5) * 8);
    const call = calls[i] as 'A' | 'C' | 'G' | 'T';
    const main = 250 + 900 * Math.max(0.15, edge) * (0.75 + rand() * 0.5);
    const called = call in acc ? call : null;
    if (doubtful.has(i)) q = 9 + Math.round(rand() * 4);
    q = Math.max(3, Math.min(60, q));
    quality.push(q);
    if (called) addPeak(acc[called], center, doubtful.has(i) ? main * 0.62 : main);
    // background: small bumps in the other channels, larger where quality is poor
    const pool = called ? others[called] : (['A', 'C', 'G', 'T'] as const);
    for (const b of pool) addPeak(acc[b], center + (rand() - 0.5) * 3, main * (0.03 + (1 - q / 60) * 0.25) * rand());
    if (doubtful.has(i) || !called) {
      // a second, similar-sized peak under the call: the base is uncertain
      const alt = pool[Math.floor(rand() * pool.length)];
      addPeak(acc[alt], center + (rand() - 0.5) * 1.5, main * 0.55);
    }
  }
  const toInt = (a: Float32Array) => Int16Array.from(a, (v) => Math.min(32767, Math.round(v + 8)));
  return {
    bases: calls,
    peaks,
    quality,
    channels: { A: toInt(acc.A), C: toInt(acc.C), G: toInt(acc.G), T: toInt(acc.T) },
    traceLength,
    sampleName: '',
  };
}
