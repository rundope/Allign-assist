// Physicochemical residue classes used for property-level agreement and colouring.

/** Lehninger (Principles of Biochemistry) five-class grouping of the 20 amino acids. */
export const AA_CLASS: Record<string, string> = {
  G: 'aliphatic', A: 'aliphatic', P: 'aliphatic', V: 'aliphatic', L: 'aliphatic', I: 'aliphatic', M: 'aliphatic',
  F: 'aromatic', Y: 'aromatic', W: 'aromatic',
  S: 'polar', T: 'polar', C: 'polar', N: 'polar', Q: 'polar',
  K: 'positive', R: 'positive', H: 'positive',
  D: 'negative', E: 'negative',
};

export const AA_CLASS_LABEL: Record<string, string> = {
  aliphatic: '비극성 지방족 (G A P V L I M)',
  aromatic: '방향족 (F Y W)',
  polar: '극성 비전하 (S T C N Q)',
  positive: '양전하 (K R H)',
  negative: '음전하 (D E)',
};

/** Side-chain charge at physiological pH (H counted as basic, as in the Lehninger classes). */
export function aaCharge(c: string): '+' | '-' | '0' | null {
  if (!AA_CLASS[c]) return null;
  if (c === 'K' || c === 'R' || c === 'H') return '+';
  if (c === 'D' || c === 'E') return '-';
  return '0';
}

/** Kyte & Doolittle (1982) hydropathy index. */
export const KYTE_DOOLITTLE: Record<string, number> = {
  I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5, M: 1.9, A: 1.8, G: -0.4, T: -0.7, S: -0.8,
  W: -0.9, Y: -1.3, P: -1.6, H: -3.2, E: -3.5, Q: -3.5, D: -3.5, N: -3.5, K: -3.9, R: -4.5,
};

export function hydropathySign(c: string): 'phobic' | 'philic' | null {
  const v = KYTE_DOOLITTLE[c];
  if (v === undefined) return null;
  return v > 0 ? 'phobic' : 'philic';
}

/** Clustal "strong" and "weak" conservation groups (used for the ':' and '.' symbols). */
export const CLUSTAL_STRONG = ['STA', 'NEQK', 'NHQK', 'NDEQ', 'QHRK', 'MILV', 'MILF', 'HY', 'FYW'];
export const CLUSTAL_WEAK = ['CSA', 'ATV', 'SAG', 'STNK', 'STPA', 'SGND', 'SNDEQK', 'NDEQHK', 'NEQHRK', 'FVLIM', 'HFY'];

export function inSameGroup(a: string, b: string, groups: string[]): boolean {
  return groups.some((g) => g.includes(a) && g.includes(b));
}

export function allInOneGroup(chars: Iterable<string>, groups: string[]): boolean {
  const set = [...new Set(chars)];
  return groups.some((g) => set.every((c) => g.includes(c)));
}

// ---- nucleotides ----

export function normNuc(c: string): string {
  return c === 'U' ? 'T' : c;
}

/** Purine (R = A/G) or pyrimidine (Y = C/T). */
export function purPyr(c: string): 'R' | 'Y' | null {
  const n = normNuc(c);
  if (n === 'A' || n === 'G') return 'R';
  if (n === 'C' || n === 'T') return 'Y';
  return null;
}

/** Strong (S = G/C, 3 H-bonds) or weak (W = A/T, 2 H-bonds). */
export function strongWeak(c: string): 'S' | 'W' | null {
  const n = normNuc(c);
  if (n === 'G' || n === 'C') return 'S';
  if (n === 'A' || n === 'T') return 'W';
  return null;
}

/** Amino (M = A/C) or keto (K = G/T). */
export function aminoKeto(c: string): 'M' | 'K' | null {
  const n = normNuc(c);
  if (n === 'A' || n === 'C') return 'M';
  if (n === 'G' || n === 'T') return 'K';
  return null;
}

export function isTransition(a: string, b: string): boolean {
  const x = normNuc(a);
  const y = normNuc(b);
  if (x === y) return false;
  const r = purPyr(x);
  return r !== null && r === purPyr(y);
}

export function isTransversion(a: string, b: string): boolean {
  const ra = purPyr(a);
  const rb = purPyr(b);
  return ra !== null && rb !== null && ra !== rb;
}

export const RESIDUE_NAMES: Record<string, string> = {
  A: 'Ala · Alanine', R: 'Arg · Arginine', N: 'Asn · Asparagine', D: 'Asp · Aspartate', C: 'Cys · Cysteine',
  Q: 'Gln · Glutamine', E: 'Glu · Glutamate', G: 'Gly · Glycine', H: 'His · Histidine', I: 'Ile · Isoleucine',
  L: 'Leu · Leucine', K: 'Lys · Lysine', M: 'Met · Methionine', F: 'Phe · Phenylalanine', P: 'Pro · Proline',
  S: 'Ser · Serine', T: 'Thr · Threonine', W: 'Trp · Tryptophan', Y: 'Tyr · Tyrosine', V: 'Val · Valine',
  B: 'Asx (N/D)', Z: 'Glx (Q/E)', X: 'unknown', '*': 'stop',
};

export const NUC_NAMES: Record<string, string> = {
  A: 'Adenine (purine, weak, amino)', C: 'Cytosine (pyrimidine, strong, amino)',
  G: 'Guanine (purine, strong, keto)', T: 'Thymine (pyrimidine, weak, keto)', U: 'Uracil (pyrimidine, weak, keto)',
  R: 'A/G (purine)', Y: 'C/T (pyrimidine)', S: 'G/C (strong)', W: 'A/T (weak)', K: 'G/T (keto)', M: 'A/C (amino)',
  B: 'not A', D: 'not C', H: 'not G', V: 'not T', N: 'any base',
};
