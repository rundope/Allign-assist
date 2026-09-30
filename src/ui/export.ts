// Export: SVG / PNG image, aligned FASTA, Clustal (.aln), statistics CSV.
import { t } from '../i18n';
import { pct } from '../core/stats';
import type { RenderModel } from '../render/model';
import { computeGeometry, fullSVG } from '../render/svg';
import { download, toast } from './dom';
import { statsAgainst } from './statsPanel';

function baseName(m: RenderModel): string {
  return `alignment_${m.aln.rows.length}seq_${new Date().toISOString().slice(0, 10)}`;
}

function title(m: RenderModel): string {
  const a = m.aln;
  return `${a.rows.map((r) => r.name).join(' · ')}  (${a.mode}, ${a.scoringName})`;
}

export function exportSVG(m: RenderModel, width: number): void {
  const geo = computeGeometry(m, width);
  download(`${baseName(m)}.svg`, fullSVG(geo, m, title(m)), 'image/svg+xml');
}

export async function exportPNG(m: RenderModel, width: number, scale = 2): Promise<void> {
  const geo = computeGeometry(m, width);
  const svg = fullSVG(geo, m, title(m));
  const wMatch = /width="(\d+)"/.exec(svg);
  const hMatch = /height="(\d+)"/.exec(svg);
  const w = Number(wMatch?.[1] ?? geo.width);
  const hgt = Number(hMatch?.[1] ?? 100);
  // Browsers cap canvas area (~268M px in Chromium) and side length (~32k px).
  let s = scale;
  while (s > 0.5 && (w * s > 32000 || hgt * s > 32000 || w * hgt * s * s > 250e6)) s /= 2;
  if (w * s > 32000 || hgt * s > 32000) {
    toast(t('정렬이 너무 커서 PNG 로 만들 수 없습니다. SVG 로 내보내세요.'), 'error');
    return;
  }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error(t('SVG 렌더링 실패')));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * s);
    canvas.height = Math.round(hgt * s);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(s, s);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error(t('PNG 인코딩 실패'));
    download(`${baseName(m)}.png`, blob, 'image/png');
    if (s < scale) toast(t('크기 제한 때문에 {0}× 해상도로 저장했습니다.', s));
  } catch (e) {
    toast(t('PNG 저장 실패: {0}', (e as Error).message), 'error');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function alignedFasta(m: RenderModel): string {
  return m.aln.rows
    .map((r) => {
      const lines: string[] = [];
      for (let i = 0; i < r.aligned.length; i += 60) lines.push(r.aligned.slice(i, i + 60));
      return `>${r.name}${r.strand === -1 ? ' [reverse complement]' : ''}\n${lines.join('\n')}`;
    })
    .join('\n');
}

export function clustal(m: RenderModel): string {
  const rows = m.aln.rows;
  const names = rows.map((r) => r.name.replace(/\s+/g, '_').slice(0, 30));
  const w = Math.max(...names.map((n) => n.length)) + 6;
  const counts = rows.map(() => 0);
  const L = rows[0].aligned.length;
  const out: string[] = ['CLUSTAL W format — Align Assist', '', ''];
  for (let s = 0; s < L; s += 60) {
    rows.forEach((r, i) => {
      const chunk = r.aligned.slice(s, s + 60);
      counts[i] += chunk.replace(/-/g, '').length;
      out.push(`${names[i].padEnd(w)}${chunk} ${counts[i]}`);
    });
    out.push(`${''.padEnd(w)}${m.cols.symbols.slice(s, s + 60).join('')}`);
    out.push('');
  }
  return out.join('\n');
}

export function statsCSV(m: RenderModel): string {
  const refRow = m.refRow >= 0 ? m.refRow : m.aln.referenceIndex;
  const ref = m.aln.rows[refRow];
  const header = ['reference', 'sequence', 'strand', 'identity_overlap_pct', 'identity_pairs_pct', 'identity_emboss_pct', 'similarity_pct', 'identical', 'similar', 'pairs', 'overlap_columns', 'gap_positions', 'gap_opens', 'insertions', 'inserted_residues', 'deletions', 'deleted_residues', 'coverage_pct', 'ref_start', 'ref_end', 'seq_start', 'seq_end', 'score'];
  const propKeys = statsAgainst(m, refRow)[0]?.stats.properties.map((p) => p.key) ?? [];
  header.push(...propKeys.map((k) => `${k}_agree_pct`));
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const { row, stats: s } of statsAgainst(m, refRow)) {
    const r = m.aln.rows[row];
    lines.push(
      [
        q(ref.name),
        q(r.name),
        r.strand === 1 ? '+' : '-',
        pct(s.identical, s.overlapColumns).toFixed(2),
        pct(s.identical, s.pairs).toFixed(2),
        pct(s.identical, s.columns).toFixed(2),
        pct(s.similar, s.overlapColumns).toFixed(2),
        s.identical,
        s.similar,
        s.pairs,
        s.overlapColumns,
        s.gapPositions,
        s.gapOpens,
        s.insEvents,
        s.insPositions,
        s.delEvents,
        s.delPositions,
        pct(s.pairs, s.residuesB).toFixed(2),
        s.rangeA?.[0] ?? '',
        s.rangeA?.[1] ?? '',
        s.rangeB?.[0] ?? '',
        s.rangeB?.[1] ?? '',
        m.aln.scores[row] ?? '',
        ...s.properties.map((p) => pct(p.agree, p.total).toFixed(2)),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export function exportText(m: RenderModel, kind: 'fasta' | 'clustal' | 'csv'): void {
  if (kind === 'fasta') download(`${baseName(m)}.fasta`, alignedFasta(m), 'text/plain');
  else if (kind === 'clustal') download(`${baseName(m)}.aln`, clustal(m), 'text/plain');
  else download(`${baseName(m)}_stats.csv`, '﻿' + statsCSV(m), 'text/csv');
}
