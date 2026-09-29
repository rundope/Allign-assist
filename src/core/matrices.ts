// Substitution scoring schemes built from the NCBI matrices.
import { RAW_MATRICES } from './matrices.generated';

export type ProteinMatrixName = 'BLOSUM62' | 'BLOSUM45' | 'BLOSUM80' | 'PAM250';
export type DnaMatrixName = 'NUC.4.4' | 'simple';

export const PROTEIN_MATRICES: ProteinMatrixName[] = ['BLOSUM62', 'BLOSUM45', 'BLOSUM80', 'PAM250'];

export interface Scoring {
  name: string;
  nucleotide: boolean;
  alphabet: string; // symbol for each index
  size: number;
  lookup: Int16Array; // char code -> index
  matrix: Float64Array; // size * size, row-major
}

const IUPAC_SETS: Record<string, string> = {
  A: 'A', C: 'C', G: 'G', T: 'T', U: 'T',
  R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC',
  B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT',
};

/** True when two IUPAC nucleotide codes can denote the same base. */
export function iupacCompatible(a: string, b: string): boolean {
  const sa = IUPAC_SETS[a];
  const sb = IUPAC_SETS[b];
  if (!sa || !sb) return false;
  for (const c of sa) if (sb.includes(c)) return true;
  return false;
}

function buildLookup(alphabet: string, fallback: string, aliases: Record<string, string>): Int16Array {
  const lookup = new Int16Array(128).fill(alphabet.indexOf(fallback));
  for (let i = 0; i < alphabet.length; i++) {
    lookup[alphabet.charCodeAt(i)] = i;
    lookup[alphabet.toLowerCase().charCodeAt(i)] = i;
  }
  for (const [from, to] of Object.entries(aliases)) {
    lookup[from.charCodeAt(0)] = alphabet.indexOf(to);
    lookup[from.toLowerCase().charCodeAt(0)] = alphabet.indexOf(to);
  }
  return lookup;
}

function fromRaw(name: string, nucleotide: boolean, fallback: string, aliases: Record<string, string>): Scoring {
  const raw = RAW_MATRICES[name];
  if (!raw) throw new Error(`Unknown matrix ${name}`);
  return {
    name,
    nucleotide,
    alphabet: raw.alphabet,
    size: raw.alphabet.length,
    lookup: buildLookup(raw.alphabet, fallback, aliases),
    matrix: Float64Array.from(raw.scores),
  };
}

const cache = new Map<string, Scoring>();

export function proteinScoring(name: ProteinMatrixName = 'BLOSUM62'): Scoring {
  const key = `p:${name}`;
  let s = cache.get(key);
  if (!s) {
    // Selenocysteine/pyrrolysine/J and anything unknown score as X.
    s = fromRaw(name, false, 'X', {});
    cache.set(key, s);
  }
  return s;
}

/**
 * Nucleotide scoring. 'NUC.4.4' is the NCBI/EMBOSS EDNAFULL matrix with IUPAC codes.
 * 'simple' uses user match/mismatch values; ambiguous codes that can denote the same
 * base score 0 (neither rewarded nor penalised).
 */
export function dnaScoring(name: DnaMatrixName = 'NUC.4.4', match = 5, mismatch = -4): Scoring {
  const key = `d:${name}:${match}:${mismatch}`;
  let s = cache.get(key);
  if (s) return s;
  const base = fromRaw('NUC.4.4', true, 'N', { U: 'T' });
  if (name === 'simple') {
    const n = base.size;
    const m = new Float64Array(n * n);
    const alpha = base.alphabet;
    const unambiguous = 'ACGT';
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = alpha[i];
        const b = alpha[j];
        if (unambiguous.includes(a) && unambiguous.includes(b)) m[i * n + j] = a === b ? match : mismatch;
        else m[i * n + j] = iupacCompatible(a, b) ? 0 : mismatch;
      }
    s = { ...base, name: `simple (+${match}/${mismatch})`, matrix: m };
  } else {
    s = base;
  }
  cache.set(key, s);
  return s;
}

export function encode(seq: string, scoring: Scoring): Uint8Array {
  const out = new Uint8Array(seq.length);
  for (let i = 0; i < seq.length; i++) {
    const c = seq.charCodeAt(i);
    out[i] = c < 128 ? scoring.lookup[c] : scoring.lookup['X'.charCodeAt(0)];
  }
  return out;
}

export function pairScore(scoring: Scoring, a: string, b: string): number {
  const ia = scoring.lookup[a.charCodeAt(0) & 127];
  const ib = scoring.lookup[b.charCodeAt(0) & 127];
  return scoring.matrix[ia * scoring.size + ib];
}
