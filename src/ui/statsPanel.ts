// Statistics panel: headline numbers, property-level agreement, per-sequence table and identity matrix.
import { computePairStats, identityMatrix, pct, type PairStats } from '../core/stats';
import { mix } from '../render/colors';
import type { RenderModel } from '../render/model';
import { h } from './dom';

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '–');

export interface RowStats {
  row: number;
  stats: PairStats;
}

/** Statistics of every row against the comparison row. */
export function statsAgainst(m: RenderModel, refRow: number): RowStats[] {
  const aln = m.aln;
  const ref = aln.rows[refRow];
  return aln.rows
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => i !== refRow)
    .map(({ r, i }) => ({
      row: i,
      stats: computePairStats(ref.aligned, r.aligned, ref, r, aln.seqType, m.scoring),
    }));
}

function card(label: string, value: string, sub: string, title?: string): HTMLElement {
  return h('div', { class: 'stat-card', title }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-sub' }, sub));
}

function propertyBars(s: PairStats): HTMLElement {
  const rows = [
    { label: 'Identity (완전 일치)', hint: '같은 잔기끼리 짝지어진 비율', agree: s.identical, total: s.pairs },
    ...s.properties.map((p) => ({ label: p.label, hint: p.hint, agree: p.agree, total: p.total })),
  ];
  return h(
    'div',
    { class: 'prop-bars' },
    ...rows.map((p) => {
      const v = pct(p.agree, p.total);
      return h(
        'div',
        { class: 'prop-row', title: p.hint },
        h('div', { class: 'prop-label' }, p.label, h('span', { class: 'prop-hint' }, p.hint)),
        h('div', { class: 'prop-track' }, h('div', { class: 'prop-fill', style: { width: `${v}%` } })),
        h('div', { class: 'prop-val' }, `${fmt(v)}%`, h('span', { class: 'muted' }, ` ${p.agree}/${p.total}`)),
      );
    }),
  );
}

function extraFacts(s: PairStats): HTMLElement | null {
  if (s.dna) {
    const { transitions: ts, transversions: tv, gcA, gcB } = s.dna;
    return h(
      'div',
      { class: 'facts' },
      h('span', null, `Transition ${ts}`),
      h('span', null, `Transversion ${tv}`),
      h('span', { title: 'Transition / Transversion 비. 무작위 치환이면 약 0.5, 실제 유전체 변이는 보통 2 이상.' }, `Ts/Tv ${tv ? fmt(ts / tv, 2) : ts ? '∞' : '–'}`),
      h('span', null, `GC ${fmt(gcA)}% vs ${fmt(gcB)}%`),
    );
  }
  if (s.protein) {
    const d = s.protein.meanAbsDeltaHydropathy;
    return h(
      'div',
      { class: 'facts' },
      h('span', null, `치환 ${s.protein.substitutions}개`),
      h('span', { title: '치환된 잔기쌍의 Kyte-Doolittle hydropathy 차이 절댓값 평균 (0 = 소수성 변화 없음, 최대 9)' }, `평균 |ΔHydropathy| ${d === null ? '–' : fmt(d, 2)}`),
    );
  }
  return null;
}

export function renderStats(host: HTMLElement, m: RenderModel, focusRow: number | null, onFocus: (row: number) => void): void {
  const aln = m.aln;
  const refRow = m.refRow >= 0 ? m.refRow : aln.referenceIndex;
  const all = statsAgainst(m, refRow);
  const refName = aln.rows[refRow].name;
  const focus = all.find((x) => x.row === focusRow) ?? all[0];
  const s = focus.stats;
  const q = aln.rows[focus.row];
  const score = aln.scores[focus.row];

  const header = h(
    'div',
    { class: 'stats-head' },
    h('h3', null, `${q.name}  vs  ${refName}`),
    h('span', { class: 'muted' }, `${aln.seqType.toUpperCase()} · ${aln.strategy === 'msa' ? 'Progressive MSA' : 'Reference-anchored'} · ${aln.mode} · ${aln.scoringName} · gap ${aln.gapOpen}/${aln.gapExtend}`),
  );

  const cards = h(
    'div',
    { class: 'stat-cards' },
    card('Identity', `${fmt(pct(s.identical, s.overlapColumns))}%`, `${s.identical} / ${s.overlapColumns} (겹침 구간)`, `겹침 구간(두 서열이 모두 존재하는 첫 열~마지막 열) 기준.\n정렬쌍 기준: ${fmt(pct(s.identical, s.pairs))}% (${s.identical}/${s.pairs})\nEMBOSS 방식(전체 정렬 길이): ${fmt(pct(s.identical, s.columns))}% (${s.identical}/${s.columns})`),
    card(
      aln.seqType === 'protein' ? 'Similarity' : 'Purine/Pyrimidine',
      `${fmt(pct(s.similar, s.overlapColumns))}%`,
      `${s.similar} / ${s.overlapColumns}`,
      aln.seqType === 'protein' ? `${aln.scoringName} 점수 > 0 인 쌍(동일 포함)` : '동일하거나 transition 관계인 쌍',
    ),
    card('Gaps', `${fmt(pct(s.gapPositions, s.overlapColumns))}%`, `${s.gapPositions} 위치 · ${s.gapOpens} 개 gap`, '겹침 구간 안의 gap 위치 수와 독립된 gap(연속 구간) 수'),
    card('Coverage', `${fmt(pct(s.pairs, s.residuesB))}%`, `${q.name.slice(0, 16)} 잔기 중 정렬된 비율`, '비교 서열의 전체 잔기 중 레퍼런스 잔기와 짝지어진 비율'),
    card(
      '매칭 위치',
      s.rangeA ? `${s.rangeA[0]}–${s.rangeA[1]}` : '–',
      s.rangeB ? `${refName.slice(0, 12)} ← ${q.name.slice(0, 12)} ${s.rangeB[0]}–${s.rangeB[1]}${q.strand === -1 ? ' (rc)' : ''}` : '겹침 없음',
      '레퍼런스 좌표에서의 매칭 구간 ← 비교 서열 좌표',
    ),
    score !== null && score !== undefined ? card('Score', fmt(score, 1), `${aln.scoringName}`, 'DP 정렬 점수 (모드별 말단 gap 규칙 적용)') : null,
  );

  const parts: HTMLElement[] = [header, cards];
  parts.push(h('h4', null, aln.seqType === 'protein' ? '아미노산 물성 기준 일치도' : '염기 특성 기준 일치도'), propertyBars(s));
  const extra = extraFacts(s);
  if (extra) parts.push(extra);

  if (aln.rows.length > 2) {
    const hasScores = aln.scores.some((x) => x !== null && x !== undefined);
    parts.push(h('h4', null, `서열별 요약 (vs ${refName}) — 행을 클릭하면 위 상세가 바뀝니다`));
    const table = h(
      'table',
      { class: 'stats-table' },
      h('thead', null, h('tr', null, ...['서열', '방향', 'Identity', aln.seqType === 'protein' ? 'Similarity' : 'Pu/Py', 'Gaps', 'Coverage', '레퍼런스 구간', '서열 구간', hasScores ? 'Score' : ''].filter(Boolean).map((t) => h('th', null, t)))),
      h(
        'tbody',
        null,
        ...all.map(({ row, stats: st }) => {
          const r = aln.rows[row];
          const idv = pct(st.identical, st.overlapColumns);
          const tr = h(
            'tr',
            { class: row === focus.row ? 'active' : '', onclick: () => onFocus(row) },
            h('td', null, r.name),
            h('td', null, r.strand === -1 ? '−(rc)' : '+'),
            h('td', { class: 'num heat', style: { background: heat(idv) } }, `${fmt(idv)}%`),
            h('td', { class: 'num' }, `${fmt(pct(st.similar, st.overlapColumns))}%`),
            h('td', { class: 'num' }, `${st.gapPositions} (${st.gapOpens})`),
            h('td', { class: 'num' }, `${fmt(pct(st.pairs, st.residuesB))}%`),
            h('td', { class: 'num' }, st.rangeA ? `${st.rangeA[0]}–${st.rangeA[1]}` : '–'),
            h('td', { class: 'num' }, st.rangeB ? `${st.rangeB[0]}–${st.rangeB[1]}` : '–'),
            hasScores ? h('td', { class: 'num' }, aln.scores[row] !== null && aln.scores[row] !== undefined ? fmt(aln.scores[row]!, 1) : '–') : null,
          );
          return tr;
        }),
      ),
    );
    parts.push(h('div', { class: 'table-wrap' }, table));

    if (aln.rows.length <= 40) {
      const mat = identityMatrix(m.rows, m.nucleotide);
      parts.push(h('h4', null, 'Identity matrix (%) — 쌍별, 양쪽 모두 잔기가 있는 열 기준'));
      const t = h(
        'table',
        { class: 'matrix' },
        h('thead', null, h('tr', null, h('th', null, ''), ...aln.rows.map((_, i) => h('th', { title: aln.rows[i].name }, String(i + 1))))),
        h(
          'tbody',
          null,
          ...mat.map((row, i) =>
            h(
              'tr',
              null,
              h('th', { class: 'rowname', title: aln.rows[i].name }, `${i + 1}. ${aln.rows[i].name}`),
              ...row.map((c, j) =>
                i === j || c.pairs === 0
                  ? h('td', { class: 'num muted', title: i === j ? '' : '겹치는 구간이 없습니다' }, i === j ? '—' : '·')
                  : h('td', { class: 'num heat', style: { background: heat(c.identity) }, title: `${aln.rows[i].name} vs ${aln.rows[j].name}: ${fmt(c.identity)}% over ${c.pairs} pairs` }, fmt(c.identity, 0)),
              ),
            ),
          ),
        ),
      );
      parts.push(h('div', { class: 'table-wrap' }, t));
    }
  }

  const sym = m.cols.symbols;
  let full = 0;
  let strong = 0;
  let weak = 0;
  for (const x of sym) {
    if (x === '*') full++;
    else if (x === ':') strong++;
    else if (x === '.') weak++;
  }
  const L = sym.length;
  parts.push(
    h(
      'div',
      { class: 'facts' },
      h('span', null, `정렬 길이 ${L} 열`),
      h('span', { title: "모든 서열이 같은 잔기인 열 ('*')" }, `완전 보존 ${full} (${fmt(pct(full, L))}%)`),
      aln.seqType === 'protein' ? h('span', { title: "Clustal strong group 보존 (':')" }, `강한 보존 ${strong}`) : null,
      aln.seqType === 'protein' ? h('span', { title: "Clustal weak group 보존 ('.')" }, `약한 보존 ${weak}`) : null,
      h('span', null, `계산 ${fmt(aln.elapsedMs, 0)} ms`),
    ),
  );

  parts.push(
    h(
      'details',
      { class: 'defs' },
      h('summary', null, '지표 정의'),
      h(
        'ul',
        null,
        h('li', null, '겹침 구간: 두 서열이 모두 잔기를 가진 첫 열부터 마지막 열까지. 말단 overhang 은 제외하고 내부 gap 은 포함합니다.'),
        h('li', null, 'Identity = 동일 잔기 수 / 겹침 구간 열 수. 카드에 마우스를 올리면 정렬쌍 기준·EMBOSS 기준 값도 보입니다.'),
        h('li', null, aln.seqType === 'protein' ? `Similarity = ${aln.scoringName} 치환 점수가 양수인 쌍(동일 포함) / 겹침 구간 열 수 (EMBOSS 와 같은 기준).` : 'Purine/Pyrimidine = 동일 또는 transition(A↔G, C↔T) 쌍 / 겹침 구간 열 수.'),
        h('li', null, '물성 기준 일치도는 양쪽 모두 표준 잔기인 정렬쌍만 분모로 사용합니다(gap 제외).'),
        h('li', null, 'U 와 T 는 같은 염기로 취급합니다.'),
      ),
    ),
  );
  host.replaceChildren(...parts);
}

function heat(v: number): string {
  // 0% → paper, 100% → green
  const t = Math.max(0, Math.min(1, v / 100));
  return mix('#3fb27f', '#ffffff', 0.08 + t * 0.55);
}
