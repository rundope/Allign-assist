// Colour utilities and residue colour schemes.
import { AA_CLASS, KYTE_DOOLITTLE } from '../core/properties';
import type { ResidueScheme, ViewSettings } from '../ui/state';

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear mix: t = 1 → a, t = 0 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return a;
  return rgbToHex(x[0] * t + y[0] * (1 - t), x[1] * t + y[1] * (1 - t), x[2] * t + y[2] * (1 - t));
}

function relLum(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever has the higher WCAG contrast against bg. */
export function readableOn(bg: string, dark = '#111111', light = '#ffffff'): string {
  const L = relLum(bg);
  const cDark = (L + 0.05) / (relLum(dark) + 0.05);
  const cLight = (relLum(light) + 0.05) / (L + 0.05);
  return cDark >= cLight ? dark : light;
}

// ClustalX residue colours (as used by Jalview's Clustal scheme, without its column thresholds).
const CLUSTALX: Record<string, string> = {};
const setAll = (target: Record<string, string>, residues: string, color: string) => {
  for (const r of residues) target[r] = color;
};
setAll(CLUSTALX, 'AILMFWVC', '#80a0f0');
setAll(CLUSTALX, 'KR', '#f01505');
setAll(CLUSTALX, 'DE', '#c048c0');
setAll(CLUSTALX, 'NQST', '#15c015');
CLUSTALX.C = '#f08080';
CLUSTALX.G = '#f09048';
CLUSTALX.P = '#c0c000';
setAll(CLUSTALX, 'HY', '#15a4a4');

// Zappo: physicochemical classes.
const ZAPPO: Record<string, string> = {};
setAll(ZAPPO, 'ILVAM', '#ffafaf');
setAll(ZAPPO, 'FWY', '#ffc800');
setAll(ZAPPO, 'KRH', '#6464ff');
setAll(ZAPPO, 'DE', '#ff0000');
setAll(ZAPPO, 'STNQ', '#00ff00');
setAll(ZAPPO, 'PG', '#ff00ff');
ZAPPO.C = '#ffff00';

// Taylor (1997): one colour per residue.
const TAYLOR: Record<string, string> = {
  A: '#ccff00', R: '#0000ff', N: '#cc00ff', D: '#ff0000', C: '#ffff00', Q: '#ff00cc', E: '#ff0066',
  G: '#ff9900', H: '#0066ff', I: '#66ff00', L: '#33ff00', K: '#6600ff', M: '#00ff00', F: '#00ff66',
  P: '#ffcc00', S: '#ff3300', T: '#ff6600', W: '#00ccff', Y: '#00ffcc', V: '#99ff00',
};

// Lehninger five classes (matches the statistics panel grouping).
const LEHNINGER_COLORS: Record<string, string> = {
  aliphatic: '#f2c14e',
  aromatic: '#b07cd8',
  polar: '#6cc5a4',
  positive: '#5b8def',
  negative: '#ef6a6a',
};

export const SCHEME_LABEL: Record<ResidueScheme, string> = {
  clustalx: 'ClustalX (잔기 계열)',
  zappo: 'Zappo (물리화학적)',
  taylor: 'Taylor (잔기별 고유색)',
  hydrophobicity: 'Hydrophobicity (Kyte-Doolittle)',
  lehninger: 'Lehninger 5계열',
  nucleotide: 'Nucleotide (A/C/G/T 사용자 지정)',
};

export const SCHEME_LEGEND: Record<Exclude<ResidueScheme, 'nucleotide' | 'taylor'>, [string, string][]> = {
  clustalx: [
    ['#80a0f0', '소수성 AILMFWV'],
    ['#f01505', '양전하 KR'],
    ['#c048c0', '음전하 DE'],
    ['#15c015', '극성 NQST'],
    ['#f08080', 'C'],
    ['#f09048', 'G'],
    ['#c0c000', 'P'],
    ['#15a4a4', '방향족 HY'],
  ],
  zappo: [
    ['#ffafaf', '지방족 ILVAM'],
    ['#ffc800', '방향족 FWY'],
    ['#6464ff', '양전하 KRH'],
    ['#ff0000', '음전하 DE'],
    ['#00ff00', '친수성 STNQ'],
    ['#ff00ff', '구조 PG'],
    ['#ffff00', 'C'],
  ],
  hydrophobicity: [
    ['#d7301f', '소수성 (KD +4.5)'],
    ['#f7f7f7', '중간 (0)'],
    ['#2c7bb6', '친수성 (KD −4.5)'],
  ],
  lehninger: [
    [LEHNINGER_COLORS.aliphatic, '지방족 GAPVLIM'],
    [LEHNINGER_COLORS.aromatic, '방향족 FYW'],
    [LEHNINGER_COLORS.polar, '극성 STCNQ'],
    [LEHNINGER_COLORS.positive, '양전하 KRH'],
    [LEHNINGER_COLORS.negative, '음전하 DE'],
  ],
};

function hydroColor(r: string): string | null {
  const v = KYTE_DOOLITTLE[r];
  if (v === undefined) return null;
  const t = Math.max(-1, Math.min(1, v / 4.5));
  return t >= 0 ? mix('#d7301f', '#f7f7f7', t) : mix('#2c7bb6', '#f7f7f7', -t);
}

export function residueColor(ch: string, scheme: ResidueScheme, v: ViewSettings, nucleotide: boolean): string | null {
  if (ch === '-' || ch === ' ') return null;
  if (nucleotide || scheme === 'nucleotide') {
    const k = (ch === 'U' ? 'T' : ch) as keyof ViewSettings['nucleotideColors'];
    return v.nucleotideColors[k] ?? v.nucleotideColors.N;
  }
  switch (scheme) {
    case 'clustalx':
      return CLUSTALX[ch] ?? null;
    case 'zappo':
      return ZAPPO[ch] ?? null;
    case 'taylor':
      return TAYLOR[ch] ?? null;
    case 'hydrophobicity':
      return hydroColor(ch);
    case 'lehninger':
      return AA_CLASS[ch] ? LEHNINGER_COLORS[AA_CLASS[ch]] : null;
    default:
      return null;
  }
}
