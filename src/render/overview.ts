// Overview map: one strip per sequence across the whole alignment, showing where each
// sequence has residues and where it differs from the comparison target.
import { categorize, isTerminal, type RenderModel } from './model';

const PRIORITY: Record<string, number> = { mismatch: 5, indel: 4, gap: 3, similar: 2, match: 1, plain: 1, terminal: 0 };

export interface OverviewLayout {
  labelW: number;
  stripH: number;
  gap: number;
  top: number;
  width: number;
  height: number;
}

export function drawOverview(canvas: HTMLCanvasElement, m: RenderModel, cssWidth: number, highlight?: [number, number]): OverviewLayout {
  const v = m.view;
  const N = m.rows.length;
  const stripH = N > 12 ? 6 : 10;
  const gap = N > 12 ? 2 : 4;
  const labelW = Math.min(160, Math.max(70, cssWidth * 0.18));
  const top = 16;
  const height = top + N * (stripH + gap) + 4;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  const layout = { labelW, stripH, gap, top, width: cssWidth, height };
  if (!ctx) return layout;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const styles = getComputedStyle(canvas);
  const fg = styles.getPropertyValue('--text').trim() || '#222';
  const muted = styles.getPropertyValue('--muted').trim() || '#888';
  ctx.clearRect(0, 0, cssWidth, height);
  const L = m.rows[0].length;
  const plotW = cssWidth - labelW - 8;
  ctx.font = `11px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  // axis ticks (alignment columns)
  ctx.fillStyle = muted;
  const step = niceStep(L / 8);
  for (let c = 0; c <= L; c += step) {
    const x = labelW + (c / L) * plotW;
    ctx.fillRect(x, top - 4, 1, 3);
    if (c > 0) {
      ctx.textAlign = 'center';
      ctx.fillText(String(c), Math.min(x, cssWidth - 16), 6);
    }
  }
  const color = (cat: string): string => {
    if (cat === 'plain' || cat === 'match') return v.colors.match.bg || '#9fc5a8';
    const c = v.colors[cat as keyof typeof v.colors];
    const fallback: Record<string, string> = { similar: '#f1d27a', mismatch: '#e5484d', indel: '#8e4ec6', gap: '#c9b3e6' };
    return c?.bg || fallback[cat] || '#bbb';
  };
  const px = Math.max(1, Math.floor(plotW));
  for (let r = 0; r < N; r++) {
    const y = top + r * (stripH + gap);
    ctx.fillStyle = fg;
    ctx.textAlign = 'right';
    const name = m.aln.rows[r].name;
    ctx.fillText(name.length > 18 ? `${name.slice(0, 17)}…` : name, labelW - 6, y + stripH / 2);
    // baseline
    ctx.fillStyle = muted;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(labelW, y + stripH / 2 - 0.5, plotW, 1);
    ctx.globalAlpha = 1;
    for (let p = 0; p < px; p++) {
      const ca = Math.floor((p / px) * L);
      const cb = Math.max(ca + 1, Math.floor(((p + 1) / px) * L));
      let best = -1;
      let bestCat = '';
      for (let c = ca; c < cb && c < L; c++) {
        if (isTerminal(m, r, c)) continue;
        const cat = r === m.refRow ? 'plain' : categorize(m, r, c);
        const pr = PRIORITY[cat] ?? 0;
        if (pr > best) {
          best = pr;
          bestCat = cat;
          if (pr === 5) break;
        }
      }
      if (best <= 0) continue;
      ctx.fillStyle = r === m.refRow ? muted : color(bestCat);
      ctx.fillRect(labelW + p, y, 1, stripH);
    }
  }
  // visible window / viewport marker
  if (highlight) {
    const [a, b] = highlight;
    const xa = labelW + (a / L) * plotW;
    const xb = labelW + (b / L) * plotW;
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(xa, top - 2, Math.max(2, xb - xa), height - top - 2);
  }
  return layout;
}

function niceStep(raw: number): number {
  if (raw <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

export function overviewColumnAt(layout: OverviewLayout, x: number, L: number): number | null {
  const plotW = layout.width - layout.labelW - 8;
  if (x < layout.labelW || x > layout.labelW + plotW) return null;
  return Math.floor(((x - layout.labelW) / plotW) * L);
}
