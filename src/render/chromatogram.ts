// Small chromatogram (4-channel trace) around one base call, as inline SVG for the tooltip.
// When the aligned row shows the reverse complement of the read, the picture is mirrored
// and every channel is drawn as its complementary base, so it reads like the row.
import { t } from '../i18n';
import type { Chromatogram } from '../core/abif';

type Base = 'A' | 'C' | 'G' | 'T';
const BASES: Base[] = ['A', 'C', 'G', 'T'];
const COMP: Record<string, string> = { A: 'T', C: 'G', G: 'C', T: 'A' };
const COLOR: Record<Base, string> = { A: 'var(--tr-a)', C: 'var(--tr-c)', G: 'var(--tr-g)', T: 'var(--tr-t)' };

export function qualityClass(q: number): { label: string; cls: 'hi' | 'mid' | 'lo' } {
  if (q >= 30) return { label: t('높음'), cls: 'hi' };
  if (q >= 20) return { label: t('보통'), cls: 'mid' };
  return { label: t('낮음'), cls: 'lo' };
}

export function chromatogramSVG(c: Chromatogram, idx: number, reverse: boolean, flank = 6): string {
  const W = 300;
  const TRACE_H = 58;
  const H = 98;
  const n = c.bases.length;
  const i0 = Math.max(0, idx - flank);
  const i1 = Math.min(n - 1, idx + flank);
  const half = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    return j >= 0 && j < n ? Math.abs(c.peaks[j] - c.peaks[i]) / 2 : 6;
  };
  const x0 = Math.max(0, Math.floor(c.peaks[i0] - half(i0, -1)));
  const x1 = Math.min(c.traceLength - 1, Math.ceil(c.peaks[i1] + half(i1, 1)));
  const span = Math.max(1, x1 - x0);
  const X = (t: number) => {
    const x = ((t - x0) / span) * W;
    return reverse ? W - x : x;
  };
  let ymax = 1;
  for (const b of BASES) {
    const ch = c.channels[b];
    for (let t = x0; t <= x1 && t < ch.length; t++) ymax = Math.max(ymax, ch[t]);
  }
  const Y = (v: number) => TRACE_H - (Math.max(0, v) / ymax) * (TRACE_H - 4);
  const f = (v: number) => v.toFixed(1);
  const parts: string[] = [];
  // traces
  for (const b of BASES) {
    const ch = c.channels[b];
    const pts: string[] = [];
    for (let t = x0; t <= x1 && t < ch.length; t++) pts.push(`${f(X(t))},${f(Y(ch[t]))}`);
    const shown = (reverse ? COMP[b] : b) as Base;
    parts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${COLOR[shown]}" stroke-width="1.4" stroke-linejoin="round"/>`);
  }
  // current base marker
  const xc = X(c.peaks[idx]);
  parts.unshift(`<rect x="${f(xc - 7)}" y="0" width="14" height="${H}" rx="3" fill="var(--accent)" fill-opacity="0.12"/>`);
  parts.push(`<line x1="${f(xc)}" x2="${f(xc)}" y1="0" y2="${TRACE_H}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 2"/>`);
  // base calls and quality bars
  for (let i = i0; i <= i1; i++) {
    const x = X(c.peaks[i]);
    const call = c.bases[i];
    const shown = reverse ? (COMP[call] ?? call) : call;
    const color = (BASES as string[]).includes(shown) ? COLOR[shown as Base] : 'var(--muted)';
    parts.push(`<text x="${f(x)}" y="71" text-anchor="middle" font-size="${i === idx ? 12 : 10.5}" font-weight="${i === idx ? 700 : 500}" fill="${color}" font-family="ui-monospace, monospace">${shown}</text>`);
    const q = c.quality[i];
    if (q !== undefined) {
      const hq = (Math.min(q, 60) / 60) * 16;
      const cls = qualityClass(q).cls;
      const fill = cls === 'hi' ? 'var(--st-same)' : cls === 'mid' ? 'var(--st-similar)' : 'var(--st-sub)';
      parts.push(`<rect x="${f(x - 3)}" y="${f(H - hq)}" width="6" height="${f(Math.max(1, hq))}" rx="1" fill="${fill}"/>`);
    }
  }
  parts.push(`<line x1="0" x2="${W}" y1="${H - 0.5}" y2="${H - 0.5}" stroke="var(--border)"/>`);
  return `<svg class="chromo" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="chromatogram">${parts.join('')}</svg>`;
}
