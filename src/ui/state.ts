// Application state, defaults and persistence.
import { DEFAULT_ALIGN_SETTINGS } from '../core/align';
import type { SeqRecord } from '../core/seq';
import type { Alignment, AlignSettings } from '../core/types';

export type Category = 'match' | 'similar' | 'mismatch' | 'indel' | 'gap';
export const CATEGORIES: Category[] = ['match', 'similar', 'mismatch', 'indel', 'gap'];
export const CATEGORY_LABEL: Record<Category, string> = {
  match: '일치 (identical)',
  similar: '유사 (similar)',
  mismatch: '불일치 (mismatch)',
  indel: 'Indel 맞은편 잔기',
  gap: 'Gap (-)',
};

export interface CatColor {
  bg: string; // '' = none
  fg: string; // '' = default text colour
}

export type Highlight = 'identity' | 'conservation' | 'residue' | 'none';
export type ResidueScheme = 'clustalx' | 'zappo' | 'taylor' | 'hydrophobicity' | 'lehninger' | 'nucleotide';

export interface ViewSettings {
  // ---- layout ----
  residuesPerLine: number; // 0 = fit to window
  groupSize: number; // 0 = no grouping
  groupGap: number;
  columnGap: number; // 세로줄(열) 간격, px
  rowGap: number; // 가로줄(행) 간격, px
  blockGap: number; // 줄바꿈 블록 사이 간격, px
  blockSeparator: boolean; // 블록 사이 점선
  showLowQuality: boolean; // AB1 품질이 낮은 염기 밑줄
  qualityThreshold: number; // Phred QV 기준
  showTraces: boolean; // AB1 크로마토그램을 정렬 줄 바로 위에 그림
  traceHeight: number; // 그 크로마토그램 높이, px
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  nameMaxChars: number;
  showRuler: boolean;
  rulerMode: 'reference' | 'alignment';
  showNames: boolean;
  showNumbers: boolean;
  showConsensus: boolean;
  showSymbols: boolean;
  showConservation: boolean;
  viewRange: 'full' | 'aligned';
  // ---- colour ----
  highlight: Highlight;
  compareTo: 'row' | 'consensus';
  compareRow: number;
  showSimilar: boolean;
  colorReference: boolean;
  dotIdentical: boolean;
  hideTerminalGaps: boolean;
  colors: Record<Category, CatColor>;
  residueScheme: ResidueScheme;
  nucleotideColors: Record<'A' | 'C' | 'G' | 'T' | 'N', string>;
  residueTarget: 'bg' | 'fg';
  residueThreshold: number; // colour only columns with ≥ this % identity
  conservationColor: string;
  autoContrast: boolean;
  textColor: string;
  paperColor: string;
  mutedColor: string;
}

export const COLOR_PRESETS: Record<string, { label: string; colors: Record<Category, CatColor> }> = {
  diff: {
    label: '차이 강조',
    colors: {
      match: { bg: '', fg: '' },
      similar: { bg: '#fff1b8', fg: '#6b4e00' },
      mismatch: { bg: '#e5484d', fg: '#ffffff' },
      indel: { bg: '#8e4ec6', fg: '#ffffff' },
      gap: { bg: '#f1e9fb', fg: '#8e4ec6' },
    },
  },
  match: {
    label: '일치 강조',
    colors: {
      match: { bg: '#2f9e6b', fg: '#ffffff' },
      similar: { bg: '#a6dcbf', fg: '#0f3d26' },
      mismatch: { bg: '', fg: '' },
      indel: { bg: '', fg: '' },
      gap: { bg: '', fg: '#9aa0a6' },
    },
  },
  soft: {
    label: '부드러운 3색',
    colors: {
      match: { bg: '#d3f0dc', fg: '#14532d' },
      similar: { bg: '#fdf0c2', fg: '#6b4e00' },
      mismatch: { bg: '#fdd8d6', fg: '#9b1c1c' },
      indel: { bg: '#e8dcf8', fg: '#5b2a86' },
      gap: { bg: '', fg: '#9aa0a6' },
    },
  },
  print: {
    label: '흑백 인쇄용',
    colors: {
      match: { bg: '', fg: '#000000' },
      similar: { bg: '#d9d9d9', fg: '#000000' },
      mismatch: { bg: '#000000', fg: '#ffffff' },
      indel: { bg: '#7f7f7f', fg: '#ffffff' },
      gap: { bg: '', fg: '#7f7f7f' },
    },
  },
};

export const FONT_CHOICES: { label: string; value: string }[] = [
  { label: 'System Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' },
  { label: 'Courier New', value: '"Courier New", Courier, monospace' },
  { label: 'Consolas', value: 'Consolas, "Liberation Mono", monospace' },
  { label: 'Menlo / Monaco', value: 'Menlo, Monaco, monospace' },
  { label: 'Lucida Console', value: '"Lucida Console", "Lucida Sans Typewriter", monospace' },
  { label: 'Arial (sans-serif)', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Times New Roman (serif)', value: '"Times New Roman", Times, serif' },
];

export const DEFAULT_VIEW: ViewSettings = {
  residuesPerLine: 0,
  groupSize: 10,
  groupGap: 8,
  columnGap: 0,
  rowGap: 2,
  blockGap: 22,
  blockSeparator: true,
  showLowQuality: true,
  qualityThreshold: 20,
  showTraces: true,
  traceHeight: 46,
  fontFamily: FONT_CHOICES[0].value,
  fontSize: 14,
  fontWeight: 'normal',
  nameMaxChars: 22,
  showRuler: true,
  rulerMode: 'reference',
  showNames: true,
  showNumbers: true,
  showConsensus: false,
  showSymbols: true,
  showConservation: false,
  viewRange: 'full',
  highlight: 'identity',
  compareTo: 'row',
  compareRow: 0,
  showSimilar: true,
  colorReference: true,
  dotIdentical: false,
  hideTerminalGaps: true,
  colors: structuredClone(COLOR_PRESETS.soft.colors),
  residueScheme: 'clustalx',
  nucleotideColors: { A: '#5cc864', C: '#5b9cf0', G: '#f5b642', T: '#f06a6a', N: '#c8c8c8' },
  residueTarget: 'bg',
  residueThreshold: 0,
  conservationColor: '#4263eb',
  autoContrast: true,
  textColor: '#1f2328',
  paperColor: '#ffffff',
  mutedColor: '#8b949e',
};

export interface AppState {
  records: SeqRecord[];
  align: AlignSettings;
  view: ViewSettings;
  alignment: Alignment | null;
  /** Records snapshot used for the current alignment (to detect stale results). */
  alignedSignature: string;
  statsFocusRow: number | null;
  /** True when nothing was saved from an earlier visit. */
  firstRun: boolean;
}

const LS_KEY = 'align-assist:v1';

function safeRead(): Partial<AppState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppState>) : null;
  } catch {
    return null;
  }
}

export function persist(s: AppState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ records: s.records, align: s.align, view: s.view }));
  } catch {
    /* storage unavailable or full — not critical */
  }
}

function deepMerge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (!(k in out)) continue;
    const b = out[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = deepMerge(b, v);
    else if (typeof v === typeof b) out[k] = v;
  }
  return out as T;
}

export function loadState(): AppState {
  const saved = safeRead();
  return {
    records: Array.isArray(saved?.records) ? saved!.records!.filter((r) => r && typeof r.seq === 'string') : [],
    align: deepMerge(DEFAULT_ALIGN_SETTINGS, saved?.align),
    view: deepMerge(structuredClone(DEFAULT_VIEW), saved?.view),
    alignment: null,
    alignedSignature: '',
    statsFocusRow: null,
    firstRun: saved === null,
  };
}

export function recordsSignature(records: SeqRecord[], align: AlignSettings): string {
  return JSON.stringify([records.map((r) => [r.name, r.seq, r.strand ?? 'auto']), align]);
}
