// Chromatograms attached to sequence cards. Kept in memory and, per sequence, in
// localStorage (traces are too large to ride along with the main state on every save).
import { parseAbif, type Chromatogram } from '../core/abif';
import { linkTrace, type TraceLink } from '../core/trace';

export interface AttachedTrace {
  fileName: string;
  chrom: Chromatogram;
}

const PREFIX = 'align-assist:trace:';
const traces = new Map<string, AttachedTrace>();
const links = new Map<string, { seq: string; link: TraceLink }>();

function toB64(a: Int16Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Int16Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Returns false when the browser refused to store it (it still works until reload). */
function save(id: string, t: AttachedTrace): boolean {
  try {
    const c = t.chrom;
    localStorage.setItem(
      PREFIX + id,
      JSON.stringify({
        fileName: t.fileName,
        bases: c.bases,
        peaks: c.peaks,
        quality: c.quality,
        traceLength: c.traceLength,
        sampleName: c.sampleName,
        channels: { A: toB64(c.channels.A), C: toB64(c.channels.C), G: toB64(c.channels.G), T: toB64(c.channels.T) },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Load stored traces for these sequence ids and drop stored traces of sequences that are gone. */
export function restoreTraces(ids: string[]): void {
  const keep = new Set(ids);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const id = key.slice(PREFIX.length);
      if (!keep.has(id)) {
        localStorage.removeItem(key);
        continue;
      }
      const o = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (!o) continue;
      traces.set(id, {
        fileName: o.fileName,
        chrom: {
          bases: o.bases,
          peaks: o.peaks,
          quality: o.quality,
          traceLength: o.traceLength,
          sampleName: o.sampleName ?? '',
          channels: { A: fromB64(o.channels.A), C: fromB64(o.channels.C), G: fromB64(o.channels.G), T: fromB64(o.channels.T) },
        },
      });
    }
  } catch {
    /* storage unavailable — traces simply are not restored */
  }
}

export async function readAb1(file: File): Promise<AttachedTrace> {
  return { fileName: file.name, chrom: parseAbif(await file.arrayBuffer()) };
}

export function attachTrace(id: string, t: AttachedTrace): boolean {
  traces.set(id, t);
  links.delete(id);
  return save(id, t);
}

export function detachTrace(id: string): void {
  traces.delete(id);
  links.delete(id);
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    /* ignore */
  }
}

export function getTrace(id: string): AttachedTrace | undefined {
  return traces.get(id);
}

export function hasAnyTrace(): boolean {
  return traces.size > 0;
}

/** Trace + residue→peak mapping for a sequence (cached until the sequence changes). */
export function traceFor(id: string, seq: string): (AttachedTrace & { link: TraceLink }) | null {
  const t = traces.get(id);
  if (!t || !seq) return null;
  let l = links.get(id);
  if (!l || l.seq !== seq) {
    l = { seq, link: linkTrace(seq, t.chrom) };
    links.set(id, l);
  }
  return { ...t, link: l.link };
}
