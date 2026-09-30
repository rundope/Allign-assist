import type { AlignMode } from './pairwise';
import type { DnaMatrixName, ProteinMatrixName } from './matrices';
import type { SeqType } from './seq';

export type Strategy = 'reference' | 'msa';

export interface AlignSettings {
  seqType: 'auto' | SeqType;
  strategy: Strategy;
  mode: AlignMode;
  /** Index (in the input list) of the reference sequence for the reference strategy. */
  referenceIndex: number;
  proteinMatrix: ProteinMatrixName;
  dnaMatrix: DnaMatrixName;
  dnaMatch: number;
  dnaMismatch: number;
  gapOpen: number;
  gapExtend: number;
  /** DNA/RNA only: also try the reverse complement of each query and keep the better strand. */
  bothStrands: boolean;
}

export interface AlignedRow {
  id: string;
  name: string;
  /** Gapped, uppercase. */
  aligned: string;
  /** Residue number (1-based, in the input sequence) of the first residue shown. */
  start: number;
  /** -1 when the row shows the reverse complement of the input; numbering then counts down. */
  strand: 1 | -1;
  /** Length of the input sequence. */
  length: number;
}

export interface Alignment {
  rows: AlignedRow[];
  seqType: SeqType;
  strategy: Strategy;
  mode: AlignMode;
  scoringName: string;
  gapOpen: number;
  gapExtend: number;
  /** Row that acted as reference (reference strategy) — default comparison row. */
  referenceIndex: number;
  /** DP score of each row against the reference (reference strategy only). */
  scores: (number | null)[];
  /** Translatable messages (key = Korean source text, positional args). */
  warnings: Msg[];
  elapsedMs: number;
}

export type ProgressFn = (stage: string, fraction: number) => void;

/** A translatable message: the Korean source text is the key; {0}, {1}… take args. */
export interface Msg {
  key: string;
  args?: (string | number)[];
}
