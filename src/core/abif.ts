// Reader for Applied Biosystems ABIF chromatogram files (.ab1 / .abi / .fsa).
//
// Layout: "ABIF" + version, then a root directory entry pointing at N 28-byte entries
// (tag name, tag number, element type, element size, element count, data size, data
// offset, handle). Data of 4 bytes or less is stored in the offset field itself.
// Tags used: DATA9–12 analysed traces (channel order from FWO_1), PBAS2 base calls,
// PLOC2 peak positions, PCON2 Phred quality values (the *1 tags are the edited copies).

export interface Chromatogram {
  /** Called bases (PBAS). */
  bases: string;
  /** Trace index of each base's peak (PLOC). */
  peaks: number[];
  /** Phred quality per base (PCON); empty when the file has none. */
  quality: number[];
  /** Analysed signal per channel, keyed by base letter. */
  channels: Record<'A' | 'C' | 'G' | 'T', Int16Array>;
  traceLength: number;
  sampleName: string;
}

interface Entry {
  name: string;
  number: number;
  type: number;
  size: number;
  count: number;
  dataSize: number;
  offset: number; // absolute offset of the data (inline data resolved to the entry field)
}

export class AbifError extends Error {}

export function parseAbif(buffer: ArrayBuffer): Chromatogram {
  const view = new DataView(buffer);
  if (buffer.byteLength < 34) throw new AbifError('파일이 너무 작습니다. AB1 파일이 아닌 것 같습니다.');
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'ABIF') throw new AbifError('AB1(ABIF) 파일이 아닙니다.');
  const dirCount = view.getInt32(18);
  const dirOffset = view.getInt32(26);
  if (dirCount <= 0 || dirOffset <= 0 || dirOffset + dirCount * 28 > buffer.byteLength) throw new AbifError('AB1 디렉터리를 읽을 수 없습니다.');
  const entries = new Map<string, Entry>();
  for (let i = 0; i < dirCount; i++) {
    const p = dirOffset + i * 28;
    const name = String.fromCharCode(view.getUint8(p), view.getUint8(p + 1), view.getUint8(p + 2), view.getUint8(p + 3));
    const number = view.getInt32(p + 4);
    const dataSize = view.getInt32(p + 16);
    const e: Entry = {
      name,
      number,
      type: view.getInt16(p + 8),
      size: view.getInt16(p + 10),
      count: view.getInt32(p + 12),
      dataSize,
      offset: dataSize <= 4 ? p + 20 : view.getInt32(p + 20),
    };
    if (e.offset < 0 || e.offset + Math.max(0, dataSize) > buffer.byteLength) continue;
    entries.set(`${name}${number}`, e);
  }
  const get = (key: string) => entries.get(key);
  const chars = (e: Entry | undefined): string => {
    if (!e) return '';
    let s = '';
    for (let i = 0; i < e.dataSize; i++) s += String.fromCharCode(view.getUint8(e.offset + i));
    return s;
  };
  const pString = (e: Entry | undefined): string => {
    if (!e || e.dataSize < 1) return '';
    const n = view.getUint8(e.offset);
    let s = '';
    for (let i = 0; i < n && i + 1 < e.dataSize; i++) s += String.fromCharCode(view.getUint8(e.offset + 1 + i));
    return s;
  };
  const shorts = (e: Entry | undefined): Int16Array => {
    if (!e) return new Int16Array(0);
    const out = new Int16Array(e.count);
    for (let i = 0; i < e.count; i++) out[i] = view.getInt16(e.offset + i * 2);
    return out;
  };
  const bytes = (e: Entry | undefined): number[] => {
    if (!e) return [];
    const out: number[] = [];
    for (let i = 0; i < e.count; i++) out.push(view.getUint8(e.offset + i));
    return out;
  };

  const baseEntry = get('PBAS2') ?? get('PBAS1');
  if (!baseEntry) throw new AbifError('염기 서열(PBAS)이 없는 AB1 파일입니다.');
  const bases = chars(baseEntry).toUpperCase().replace(/[^A-Z]/g, 'N');
  const peaks = Array.from(shorts(get('PLOC2') ?? get('PLOC1')));
  const quality = bytes(get('PCON2') ?? get('PCON1'));
  const order = chars(get('FWO_1')).toUpperCase() || 'GATC';
  const channels: Chromatogram['channels'] = { A: new Int16Array(0), C: new Int16Array(0), G: new Int16Array(0), T: new Int16Array(0) };
  for (let k = 0; k < 4; k++) {
    const base = order[k] as 'A' | 'C' | 'G' | 'T';
    if (base in channels) channels[base] = shorts(get(`DATA${9 + k}`));
  }
  const traceLength = Math.max(channels.A.length, channels.C.length, channels.G.length, channels.T.length);
  if (!traceLength) throw new AbifError('신호 데이터(DATA9–12)가 없는 AB1 파일입니다.');
  if (peaks.length !== bases.length) throw new AbifError('염기 수와 peak 위치 수가 맞지 않습니다.');
  return { bases, peaks, quality, channels, traceLength, sampleName: pString(get('SMPL1')) };
}
