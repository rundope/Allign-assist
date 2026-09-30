// Demo data. All sequences are SYNTHETIC (generated from a fixed seed) — they are not
// taken from any database and must not be read as real genes or proteins.
import { CLUSTAL_STRONG } from '../core/properties';
import { newId, reverseComplement, type SeqRecord } from '../core/seq';
import type { Chromatogram } from '../core/abif';
import type { AlignSettings } from '../core/types';
import { synthChromatogram } from './demoTrace';

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

function randomSeq(rand: () => number, alphabet: string, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}

function substitute(s: string, pos: number, ch: string): string {
  return s.slice(0, pos) + ch + s.slice(pos + 1);
}

function conservative(rand: () => number, aa: string): string {
  const groups = CLUSTAL_STRONG.filter((g) => g.includes(aa));
  if (!groups.length) return aa;
  const g = groups[Math.floor(rand() * groups.length)].replace(aa, '');
  return g[Math.floor(rand() * g.length)] || aa;
}

export interface Example {
  key: string;
  label: string;
  description: string;
  records: () => SeqRecord[];
  align: Partial<AlignSettings>;
  /** Synthetic chromatograms to attach, by record index. */
  traces?: (records: SeqRecord[]) => { index: number; fileName: string; chrom: Chromatogram }[];
}

const rec = (name: string, seq: string): SeqRecord => ({ id: newId(), name, seq });

export const EXAMPLES: Example[] = [
  {
    key: 'mapping',
    label: 'DNA: 레퍼런스에 read 매핑 (AB1 포함)',
    description: '합성 600 bp 레퍼런스에 3개 read(치환·indel 포함, 1개는 역상보)를 fit 모드로 매핑합니다. read_1 과 read_3 에는 합성 AB1 크로마토그램이 붙어 있습니다.',
    align: { strategy: 'reference', mode: 'fit', referenceIndex: 0, bothStrands: true },
    records: () => {
      const r = rng(11);
      const ref = randomSeq(r, 'ACGT', 600);
      let read1 = ref.slice(60, 260);
      read1 = substitute(read1, 40, read1[40] === 'A' ? 'G' : 'A');
      read1 = substitute(read1, 118, read1[118] === 'C' ? 'T' : 'C');
      read1 = read1.slice(0, 150) + read1.slice(153);
      let read2 = ref.slice(330, 560);
      read2 = read2.slice(0, 90) + 'GATTACA' + read2.slice(90);
      read2 = substitute(read2, 170, read2[170] === 'G' ? 'T' : 'G');
      const read3 = reverseComplement(substitute(ref.slice(220, 400), 60, 'N'));
      return [rec('Demo reference (synthetic, 600 bp)', ref), rec('read_1', read1), rec('read_2 (insertion)', read2), rec('read_3 (reverse)', read3)];
    },
    // read_1: the substitution at base 41 is a clean, high-quality peak (a real difference);
    // the one at base 119 sits on a weak, mixed peak (more likely a sequencing error).
    // read_3: the N is an unresolved mixed peak.
    traces: (recs) => [
      { index: 1, fileName: 'read_1.ab1 (합성 예제)', chrom: synthChromatogram(recs[1].seq, { seed: 7, doubtful: [118] }) },
      { index: 3, fileName: 'read_3.ab1 (합성 예제)', chrom: synthChromatogram(recs[3].seq, { seed: 9, doubtful: [recs[3].seq.indexOf('N')] }) },
    ],
  },
  {
    key: 'ab1-read',
    label: 'DNA: AB1 read 와 레퍼런스 비교 (크로마토그램)',
    description: 'AB1 파일 하나를 입력으로 넣어 합성 360 bp 레퍼런스와 비교합니다. read 의 크로마토그램이 정렬 줄 바로 위에 그려져, 차이가 난 자리의 peak 을 바로 확인할 수 있습니다.',
    align: { strategy: 'reference', mode: 'fit', referenceIndex: 0, bothStrands: true },
    records: () => {
      const r = rng(31);
      const ref = randomSeq(r, 'ACGT', 360);
      const other: Record<string, string> = { A: 'C', C: 'A', G: 'T', T: 'G' };
      const ts: Record<string, string> = { A: 'G', G: 'A', C: 'T', T: 'C' };
      // the base calls of the AB1 file (it is loaded as the sequence, like opening an .ab1)
      let calls = ref.slice(30, 330);
      calls = substitute(calls, 285, other[calls[285]]); // near the read end, on a poor peak
      calls = calls.slice(0, 215) + calls.slice(216); // one base missing
      calls = substitute(calls, 154, ts[calls[154]]); // heterozygous: both peaks present
      calls = substitute(calls, 74, other[calls[74]]); // clean, high-quality difference
      return [rec('Reference (synthetic, 360 bp)', ref), rec('clone_07_F', calls)];
    },
    // base 75: a real difference (one tall peak). Base 155: two overlapping peaks — the called
    // base and the reference base — as at a heterozygous site. Base 285: low quality near the
    // read end, more likely a sequencing error. The missing base leaves a gap in the trace.
    traces: (recs) => {
      const ref = recs[0].seq.slice(30, 330);
      return [
        {
          index: 1,
          fileName: 'clone_07_F.ab1 (합성 예제)',
          chrom: synthChromatogram(recs[1].seq, { seed: 13, doubtful: [284], mixed: { 154: ref[154] as 'A' | 'C' | 'G' | 'T' } }),
        },
      ];
    },
  },
  {
    key: 'pair-dna',
    label: 'DNA: 두 변이체 비교',
    description: '길이가 다른 두 합성 DNA를 semiglobal 로 비교합니다 (transition/transversion 통계 확인용).',
    align: { strategy: 'reference', mode: 'semiglobal', referenceIndex: 0, bothStrands: false },
    records: () => {
      const r = rng(5);
      const a = randomSeq(r, 'ACGT', 240);
      let b = a.slice(12);
      const ts: Record<string, string> = { A: 'G', G: 'A', C: 'T', T: 'C' };
      for (const p of [20, 55, 81, 130, 177]) b = substitute(b, p, ts[b[p]]);
      for (const p of [100, 150]) b = substitute(b, p, b[p] === 'A' ? 'C' : 'A');
      b = b.slice(0, 60) + b.slice(64) + 'TTGACC';
      return [rec('variant_A', a), rec('variant_B', b)];
    },
  },
  {
    key: 'protein-msa',
    label: '단백질: 5개 서열 MSA',
    description: '합성 단백질 1개에서 보존적/비보존적 치환·결실을 가한 5개 서열을 progressive MSA 로 정렬합니다.',
    align: { strategy: 'msa', mode: 'semiglobal', bothStrands: false },
    records: () => {
      const r = rng(23);
      const base = 'M' + randomSeq(r, 'ACDEFGHIKLMNPQRSTVWYAAGLLKEEVS', 179);
      const variant = (seed: number, cons: number, radical: number, del: [number, number] | null) => {
        const rr = rng(seed);
        let s = base;
        for (let i = 0; i < cons; i++) {
          const p = 1 + Math.floor(rr() * (s.length - 1));
          s = substitute(s, p, conservative(rr, s[p]));
        }
        for (let i = 0; i < radical; i++) {
          const p = 1 + Math.floor(rr() * (s.length - 1));
          s = substitute(s, p, 'ACDEFGHIKLMNPQRSTVWY'[Math.floor(rr() * 20)]);
        }
        if (del) s = s.slice(0, del[0]) + s.slice(del[1]);
        return s;
      };
      return [
        rec('ProtX_demo_1', base),
        rec('ProtX_demo_2', variant(101, 8, 3, null)),
        rec('ProtX_demo_3', variant(102, 14, 6, [70, 76])),
        rec('ProtX_demo_4', variant(103, 20, 12, [120, 124])),
        rec('ProtX_demo_5', variant(104, 25, 20, [0, 15])),
      ];
    },
  },
];
