// Sequence input: parsing (FASTA / GenBank / EMBL / plain text), cleaning and type detection.

export type SeqType = 'dna' | 'rna' | 'protein';

export interface SeqRecord {
  id: string;
  name: string;
  seq: string; // uppercase, no whitespace/digits/gaps
}

const NUC_STRICT = new Set('ACGTUN');
const NUC_IUPAC = new Set('ACGTURYSWKMBDHVN');

/** Remove everything that is not a residue letter (or stop '*'), uppercase the rest. */
export function cleanSequence(raw: string): string {
  return raw.replace(/[^A-Za-z*]/g, '').toUpperCase();
}

/**
 * Guess the molecule type. A sequence is treated as nucleotide when ≥90% of its
 * letters are A/C/G/T/U/N and every letter is a valid IUPAC nucleotide code.
 */
export function detectType(seq: string): SeqType {
  if (!seq.length) return 'dna';
  let strict = 0;
  let iupac = 0;
  let u = 0;
  let t = 0;
  for (const ch of seq) {
    if (NUC_STRICT.has(ch)) strict++;
    if (NUC_IUPAC.has(ch)) iupac++;
    if (ch === 'U') u++;
    else if (ch === 'T') t++;
  }
  if (iupac === seq.length && strict / seq.length >= 0.9) return u > t ? 'rna' : 'dna';
  return 'protein';
}

/** Majority type across several sequences; any protein makes the whole set protein. */
export function detectSetType(seqs: string[]): SeqType {
  const types = seqs.filter((s) => s.length).map(detectType);
  if (!types.length) return 'dna';
  if (types.includes('protein')) return 'protein';
  const rna = types.filter((t) => t === 'rna').length;
  return rna > types.length / 2 ? 'rna' : 'dna';
}

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/**
 * Parse free text into records. Recognises multi-record FASTA, GenBank (ORIGIN
 * section), EMBL (SQ section) and falls back to a single plain sequence.
 */
export function parseSequences(text: string, fallbackName = 'Sequence'): SeqRecord[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('>')) return parseFasta(trimmed);
  if (/^LOCUS\s/m.test(trimmed) && /^ORIGIN/m.test(trimmed)) return parseGenBank(trimmed);
  if (/^ID\s/m.test(trimmed) && /^SQ\s/m.test(trimmed)) return parseEmbl(trimmed);
  const seq = cleanSequence(trimmed);
  return seq ? [{ id: newId(), name: fallbackName, seq }] : [];
}

export function parseFasta(text: string): SeqRecord[] {
  const out: SeqRecord[] = [];
  let name: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (name !== null) {
      const seq = cleanSequence(buf.join(''));
      if (seq) out.push({ id: newId(), name: name || `Sequence ${out.length + 1}`, seq });
    }
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('>')) {
      flush();
      name = line.slice(1).trim();
      buf = [];
    } else if (!line.startsWith(';')) {
      buf.push(line);
    }
  }
  flush();
  return out;
}

export function parseGenBank(text: string): SeqRecord[] {
  const out: SeqRecord[] = [];
  // A GenBank file may hold several records separated by "//".
  for (const rec of text.split(/^\/\/\s*$/m)) {
    if (!/^ORIGIN/m.test(rec)) continue;
    const locus = rec.match(/^LOCUS\s+(\S+)/m)?.[1];
    const definition = rec.match(/^DEFINITION\s+(.+)$/m)?.[1]?.trim();
    const origin = rec.slice(rec.search(/^ORIGIN/m)).replace(/^ORIGIN.*$/m, '');
    const seq = cleanSequence(origin);
    if (seq) out.push({ id: newId(), name: locus ?? definition ?? `GenBank ${out.length + 1}`, seq });
  }
  return out;
}

export function parseEmbl(text: string): SeqRecord[] {
  const out: SeqRecord[] = [];
  for (const rec of text.split(/^\/\/\s*$/m)) {
    const sqIdx = rec.search(/^SQ\s/m);
    if (sqIdx < 0) continue;
    const id = rec.match(/^ID\s+([^;\s]+)/m)?.[1];
    const body = rec.slice(sqIdx).replace(/^SQ.*$/m, '');
    const seq = cleanSequence(body);
    if (seq) out.push({ id: newId(), name: id ?? `EMBL ${out.length + 1}`, seq });
  }
  return out;
}

const COMPLEMENT: Record<string, string> = {
  A: 'T', T: 'A', U: 'A', G: 'C', C: 'G',
  R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
  B: 'V', V: 'B', D: 'H', H: 'D', N: 'N',
};

/** Reverse complement (IUPAC aware). RNA input yields RNA output. */
export function reverseComplement(seq: string, rna = false): string {
  let out = '';
  for (let i = seq.length - 1; i >= 0; i--) {
    const c = COMPLEMENT[seq[i]] ?? 'N';
    out += rna && c === 'T' ? 'U' : c;
  }
  return out;
}

export function toFasta(records: { name: string; seq: string }[], width = 60): string {
  return records
    .map((r) => {
      const lines: string[] = [];
      for (let i = 0; i < r.seq.length; i += width) lines.push(r.seq.slice(i, i + width));
      return `>${r.name}\n${lines.join('\n')}`;
    })
    .join('\n');
}
