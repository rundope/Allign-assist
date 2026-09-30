// Statistics panel: headline numbers, property-level agreement, per-sequence table and identity matrix.
import { computePairStats, pct, type PairStats } from '../core/stats';
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

const nf = (n: number) => n.toLocaleString();

/** A horizontal track standing for the whole comparison sequence, with the matched span marked. */
function miniMap(total: number, range: [number, number] | null, reverseQuery: boolean, refStrand: 1 | -1): HTMLElement {
  const track = h('div', { class: 'minimap', title: range ? `기준 서열 ${range[0]}–${range[1]} / ${nf(total)}` : '겹침 없음' });
  if (range && total > 0) {
    const lo = Math.min(range[0], range[1]);
    const hi = Math.max(range[0], range[1]);
    // positions are in the reference's own numbering; flip when the reference itself was reversed
    const a = refStrand === 1 ? (lo - 1) / total : (total - hi) / total;
    const w = (hi - lo + 1) / total;
    track.append(h('span', { class: `mm-span${reverseQuery ? ' rev' : ''}`, style: { left: `${a * 100}%`, width: `${Math.max(w * 100, 1.2)}%` } }));
  }
  return track;
}

function meter(value: number): HTMLElement {
  return h('div', { class: 'meter' }, h('span', { style: { width: `${Math.max(0, Math.min(100, value))}%` } }));
}

interface Diffs {
  subs: number; // all substituted pairs
  similarSubs: number; // substitutions that are similar (transition / BLOSUM > 0)
  ins: number;
  insLen: number;
  del: number;
  delLen: number;
}

function diffsOf(s: PairStats): Diffs {
  return {
    subs: s.pairs - s.identical,
    similarSubs: s.similar - s.identical,
    ins: s.insEvents,
    insLen: s.insPositions,
    del: s.delEvents,
    delLen: s.delPositions,
  };
}

/** One plain sentence that says what the numbers mean. */
function summarySentence(qName: string, refName: string, s: PairStats, d: Diffs, nucleotide: boolean, reverse: boolean): HTMLElement {
  const unit = nucleotide ? 'nt' : 'aa';
  if (!s.rangeA || s.overlapColumns === 0) return h('p', { class: 'stats-sentence' }, h('b', null, qName), ` 은(는) `, h('b', null, refName), ' 와(과) 겹치는 구간이 없습니다.');
  const parts: string[] = [];
  if (d.subs) parts.push(`치환 ${d.subs}개${d.similarSubs ? `(그중 유사 ${d.similarSubs}개)` : ''}`);
  if (d.ins) parts.push(`삽입 ${d.ins}곳(${d.insLen} ${unit})`);
  if (d.del) parts.push(`결실 ${d.del}곳(${d.delLen} ${unit})`);
  return h(
    'p',
    { class: 'stats-sentence' },
    h('b', null, qName),
    reverse ? ' (역상보)' : '',
    ' 은(는) ',
    h('b', null, refName),
    ` 의 ${s.rangeA[0]}–${s.rangeA[1]} 구간에 정렬됩니다. 겹친 ${nf(s.overlapColumns)}자리 중 `,
    h('b', null, `${nf(s.identical)}자리가 같고 (${fmt(pct(s.identical, s.overlapColumns))}%)`),
    parts.length ? `, ${parts.join(', ')}가 있습니다.` : ', 다른 곳이 없습니다.',
  );
}

function bigCard(label: string, value: string, extra: (HTMLElement | string | null)[], title?: string, cls = ''): HTMLElement {
  return h('div', { class: `stat-card ${cls}`, title }, h('div', { class: 'stat-label' }, label), h('div', { class: 'stat-value' }, value), ...extra.filter((x) => x !== null));
}

/** Stacked bar: what every position of the overlap is (same / similar / substituted / inserted / deleted). */
function composition(s: PairStats, d: Diffs, nucleotide: boolean): HTMLElement {
  const segs = [
    { key: 'same', label: '같음', n: s.identical },
    { key: 'similar', label: nucleotide ? '유사 치환 (transition)' : '유사 치환 (BLOSUM > 0)', n: d.similarSubs },
    { key: 'sub', label: nucleotide ? '치환 (transversion)' : '비유사 치환', n: d.subs - d.similarSubs },
    { key: 'ins', label: '삽입', n: d.insLen },
    { key: 'del', label: '결실', n: d.delLen },
  ];
  const total = s.overlapColumns || 1;
  const bar = h(
    'div',
    { class: 'comp-bar', role: 'img', 'aria-label': segs.map((x) => `${x.label} ${x.n}`).join(', ') },
    ...segs.filter((x) => x.n > 0).map((x) => h('span', { class: `seg seg-${x.key}`, style: { flexGrow: String(x.n), minWidth: '3px' }, title: `${x.label}: ${nf(x.n)}자리 (${fmt(pct(x.n, total))}%)` })),
  );
  const legend = h(
    'div',
    { class: 'comp-legend' },
    ...segs.map((x) =>
      h('span', { class: `comp-item${x.n ? '' : ' zero'}` }, h('i', { class: `sw seg-${x.key}` }), `${x.label} `, h('b', null, nf(x.n)), h('span', { class: 'muted' }, ` (${fmt(pct(x.n, total))}%)`)),
    ),
  );
  return h('div', { class: 'comp' }, h('div', { class: 'comp-title' }, `겹침 구간 ${nf(s.overlapColumns)}자리의 구성`), bar, legend);
}

function propertyTable(s: PairStats, nucleotide: boolean): HTMLElement {
  const rows = [
    { label: '완전 일치', hint: '같은 잔기끼리 짝지어진 비율. 양쪽 모두 잔기가 있는 자리만 셉니다(gap 제외).', agree: s.identical, total: s.pairs },
    ...s.properties.map((p) => ({ label: p.label.replace(' 일치', '').replace(' 보존', ''), hint: p.hint, agree: p.agree, total: p.total })),
  ];
  return h(
    'table',
    { class: 'prop-table' },
    h('thead', null, h('tr', null, h('th', null, nucleotide ? '염기 특성' : '아미노산 물성'), h('th', { class: 'bar-col' }, '같은 비율'), h('th', { class: 'num' }, '%'), h('th', { class: 'num' }, '다른 쌍'))),
    h(
      'tbody',
      null,
      ...rows.map((r) => {
        const v = pct(r.agree, r.total);
        const diff = r.total - r.agree;
        return h(
          'tr',
          { title: r.hint },
          h('td', null, r.label, h('span', { class: 'info', 'aria-label': r.hint }, 'ⓘ')),
          h('td', { class: 'bar-col' }, meter(v)),
          h('td', { class: 'num strong' }, `${fmt(v)}%`),
          h('td', { class: `num${diff ? ' has-diff' : ' muted'}` }, diff ? `${diff}쌍` : '없음'),
        );
      }),
    ),
    h('caption', null, `분모: 양쪽 모두 잔기가 있는 정렬쌍 ${nf(s.pairs)}개 (gap 제외). 행에 마우스를 올리면 설명이 보입니다.`),
  );
}

function substitutionFacts(s: PairStats): HTMLElement | null {
  if (s.dna) {
    const { transitions: ts, transversions: tv, gcA, gcB } = s.dna;
    return h(
      'div',
      { class: 'facts' },
      h('span', { title: 'A↔G, C↔T (purine↔purine, pyrimidine↔pyrimidine)' }, 'Transition ', h('b', null, String(ts))),
      h('span', { title: 'purine↔pyrimidine' }, 'Transversion ', h('b', null, String(tv))),
      h('span', { title: 'Transition / Transversion 비. 무작위 치환이면 약 0.5, 실제 유전체 변이는 보통 2 이상.' }, 'Ts/Tv ', h('b', null, tv ? fmt(ts / tv, 2) : ts ? '∞' : '–')),
      h('span', null, 'GC 함량 ', h('b', null, `${fmt(gcA)}% · ${fmt(gcB)}%`), h('span', { class: 'muted' }, ' (기준 · 비교)')),
    );
  }
  if (s.protein) {
    const dH = s.protein.meanAbsDeltaHydropathy;
    return h(
      'div',
      { class: 'facts' },
      h('span', { title: '치환된 잔기쌍의 Kyte-Doolittle hydropathy 차이 절댓값 평균 (0 = 소수성 변화 없음, 최대 9)' }, '평균 |ΔHydropathy| ', h('b', null, dH === null ? '–' : fmt(dH, 2))),
    );
  }
  return null;
}

function heat(v: number, lo: number): string {
  const t = Math.max(0, Math.min(1, (v - lo) / Math.max(1, 100 - lo)));
  return mix('#1f8a5b', '#ffffff', 0.1 + t * 0.62);
}

export function renderStats(host: HTMLElement, m: RenderModel, focusRow: number | null, onFocus: (row: number) => void): void {
  const aln = m.aln;
  const nucleotide = aln.seqType !== 'protein';
  const refRow = m.refRow >= 0 ? m.refRow : aln.referenceIndex;
  const ref = aln.rows[refRow];
  const all = statsAgainst(m, refRow);
  const focus = all.find((x) => x.row === focusRow) ?? all[0];
  const s = focus.stats;
  const q = aln.rows[focus.row];
  const d = diffsOf(s);
  const score = aln.scores[focus.row];
  const multi = aln.rows.length > 2;

  // ---- header ----
  let conserved = 0;
  for (const x of m.cols.symbols) if (x === '*') conserved++;
  const L = m.cols.symbols.length;
  const header = h(
    'div',
    { class: 'stats-head' },
    h('h3', null, '일치도 통계'),
    h(
      'div',
      { class: 'stats-meta' },
      h('span', null, aln.seqType.toUpperCase()),
      h('span', null, aln.strategy === 'msa' ? 'Progressive MSA' : aln.rows.length > 2 ? 'Reference-anchored' : 'Pairwise'),
      h('span', null, `${aln.mode} · ${aln.scoringName} · gap ${aln.gapOpen}/${aln.gapExtend}`),
      h('span', null, `정렬 ${nf(L)}열`),
      // only meaningful when every sequence spans the alignment (an MSA), not for reads on a reference
      aln.strategy === 'msa' ? h('span', { title: "모든 서열이 같은 잔기인 열 ('*')" }, `완전 보존 열 ${fmt(pct(conserved, L))}%`) : null,
    ),
  );
  const parts: HTMLElement[] = [header];

  // ---- per-sequence overview (multi) ----
  if (multi) {
    const hasScores = aln.scores.some((x) => x !== null && x !== undefined);
    const refLen = ref.length;
    const table = h(
      'table',
      { class: 'stats-table' },
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, '서열'),
          h('th', { class: 'map-col' }, `${ref.name} 위의 위치`),
          h('th', { class: 'id-col' }, '일치도'),
          h('th', { class: 'num' }, '치환'),
          h('th', { class: 'num' }, '삽입'),
          h('th', { class: 'num' }, '결실'),
          hasScores ? h('th', { class: 'num' }, 'Score') : null,
        ),
      ),
      h(
        'tbody',
        null,
        ...all.map(({ row, stats: st }) => {
          const r = aln.rows[row];
          const dd = diffsOf(st);
          const idv = pct(st.identical, st.overlapColumns);
          const active = row === focus.row;
          return h(
            'tr',
            { class: active ? 'active' : '', onclick: () => onFocus(row), tabindex: '0', onkeydown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && onFocus(row), 'aria-selected': String(active) },
            h('td', { class: 'name-cell' }, h('span', { class: `pick${active ? ' on' : ''}`, 'aria-hidden': 'true' }), r.name, r.strand === -1 ? h('span', { class: 'rc-tag' }, 'rc') : null),
            h('td', { class: 'map-col' }, miniMap(refLen, st.rangeA, r.strand === -1, ref.strand), h('span', { class: 'range' }, st.rangeA ? `${st.rangeA[0]}–${st.rangeA[1]}` : '겹침 없음')),
            h('td', { class: 'id-col' }, h('div', { class: 'id-cell' }, meter(idv), h('b', null, st.overlapColumns ? `${fmt(idv)}%` : '–'))),
            h('td', { class: `num${dd.subs ? '' : ' muted'}` }, String(dd.subs)),
            h('td', { class: `num${dd.ins ? '' : ' muted'}` }, dd.ins ? `${dd.ins} (${dd.insLen})` : '0'),
            h('td', { class: `num${dd.del ? '' : ' muted'}` }, dd.del ? `${dd.del} (${dd.delLen})` : '0'),
            hasScores ? h('td', { class: 'num muted' }, aln.scores[row] !== null && aln.scores[row] !== undefined ? fmt(aln.scores[row]!, 1) : '–') : null,
          );
        }),
      ),
    );
    parts.push(
      h('h4', null, `서열별 비교 `, h('span', { class: 'muted' }, `— 기준: ${ref.name} · 행을 누르면 아래에 그 서열의 상세가 나옵니다 · 삽입·결실 괄호는 길이`)),
      h('div', { class: 'table-wrap' }, table),
    );
  }

  // ---- selected pair ----
  const pairTitle = h('h4', { class: 'pair-title' }, h('span', { class: 'pair-q' }, q.name), h('span', { class: 'muted' }, ' ↔ '), h('span', null, ref.name), multi ? h('span', { class: 'muted' }, '  (선택한 서열)') : null);
  const cards = h(
    'div',
    { class: 'stat-cards' },
    bigCard(
      '일치도 (Identity)',
      s.overlapColumns ? `${fmt(pct(s.identical, s.overlapColumns))}%` : '–',
      [meter(pct(s.identical, s.overlapColumns)), h('div', { class: 'stat-sub' }, `${nf(s.identical)} / ${nf(s.overlapColumns)}자리 · gap 포함`), h('div', { class: 'stat-sub' }, `gap 제외 시 ${fmt(pct(s.identical, s.pairs))}% (${nf(s.identical)} / ${nf(s.pairs)}쌍)`)],
      '겹침 구간(두 서열이 모두 있는 첫 자리부터 마지막 자리까지) 안의 같은 잔기 비율입니다. 내부 gap 도 분모에 들어갑니다.',
      'primary',
    ),
    bigCard(
      nucleotide ? '유사도 (Purine/Pyrimidine)' : '유사도 (Similarity)',
      s.overlapColumns ? `${fmt(pct(s.similar, s.overlapColumns))}%` : '–',
      [meter(pct(s.similar, s.overlapColumns)), h('div', { class: 'stat-sub' }, nucleotide ? '같거나 transition 인 자리' : `같거나 ${aln.scoringName} 점수 > 0 인 자리`)],
    ),
    bigCard(
      '차이',
      String(d.subs + d.ins + d.del),
      [
        h(
          'div',
          { class: 'diff-row' },
          h('span', { class: 'd-sub' }, h('b', null, String(d.subs)), ' 치환'),
          h('span', { class: 'd-ins' }, h('b', null, String(d.ins)), ' 삽입'),
          h('span', { class: 'd-del' }, h('b', null, String(d.del)), ' 결실'),
        ),
        h('div', { class: 'stat-sub' }, d.ins || d.del ? `삽입 ${d.insLen} · 결실 ${d.delLen} ${nucleotide ? 'nt' : 'aa'}` : 'indel 없음'),
      ],
      '치환 자리 수와 삽입·결실이 일어난 곳의 수입니다.',
    ),
    bigCard(
      '정렬 위치',
      s.rangeA ? `${s.rangeA[0]}–${s.rangeA[1]}` : '–',
      [
        miniMap(ref.length, s.rangeA, q.strand === -1, ref.strand),
        h('div', { class: 'stat-sub' }, `${ref.name} 좌표 · ${nf(ref.length)} ${nucleotide ? 'nt' : 'aa'} 중`),
        h('div', { class: 'stat-sub' }, s.rangeB ? `${q.name} ${s.rangeB[0]}–${s.rangeB[1]}${q.strand === -1 ? ' (역상보)' : ''} · 정렬된 비율 ${fmt(pct(s.pairs, s.residuesB))}%` : ''),
        score !== null && score !== undefined ? h('div', { class: 'stat-sub' }, `Score ${fmt(score, 1)}`) : null,
      ],
    ),
  );
  parts.push(
    h(
      'section',
      { class: 'pair-detail' },
      pairTitle,
      summarySentence(q.name, ref.name, s, d, nucleotide, q.strand === -1),
      cards,
      composition(s, d, nucleotide),
      h('div', { class: 'table-wrap' }, propertyTable(s, nucleotide)),
      substitutionFacts(s) ?? h('span'),
    ),
  );

  // ---- identity matrix ----
  if (multi && aln.rows.length <= 40) {
    // same definition as the table above: identical / overlap positions (internal gaps count)
    const mat = aln.rows.map((a, i) =>
      aln.rows.map((b, j) => {
        if (i === j) return { identity: 100, pairs: 1 };
        const st = computePairStats(a.aligned, b.aligned, a, b, aln.seqType, m.scoring);
        return { identity: pct(st.identical, st.overlapColumns), pairs: st.overlapColumns };
      }),
    );
    let lo = 100;
    mat.forEach((row, i) => row.forEach((c, j) => i !== j && c.pairs && (lo = Math.min(lo, c.identity))));
    lo = Math.max(0, Math.floor(lo) - 2);
    const t = h(
      'table',
      { class: 'matrix' },
      h('thead', null, h('tr', null, h('th', null, ''), ...aln.rows.map((r, i) => h('th', { title: r.name }, String(i + 1))))),
      h(
        'tbody',
        null,
        ...mat.map((row, i) =>
          h(
            'tr',
            null,
            h('th', { class: 'rowname', title: aln.rows[i].name }, `${i + 1}. ${aln.rows[i].name}`),
            ...row.map((c, j) =>
              i === j
                ? h('td', { class: 'num diag' }, '—')
                : c.pairs === 0
                  ? h('td', { class: 'num none', title: '겹치는 구간이 없습니다' }, '겹침 없음')
                  : h('td', { class: 'num heat', style: { background: heat(c.identity, lo) }, title: `${aln.rows[i].name} vs ${aln.rows[j].name}: ${fmt(c.identity)}% (겹침 ${c.pairs}자리)` }, fmt(c.identity)),
            ),
          ),
        ),
      ),
    );
    const scale = h('div', { class: 'heat-scale' }, h('span', null, `${lo}%`), h('i', { style: { background: `linear-gradient(90deg, ${heat(lo, lo)}, ${heat(100, lo)})` } }), h('span', null, '100%'));
    parts.push(h('h4', null, 'Identity matrix ', h('span', { class: 'muted' }, '— 모든 쌍의 일치도(%) · 위 표와 같은 기준(겹침 구간, gap 포함)')), h('div', { class: 'table-wrap' }, t), scale);
  }

  parts.push(
    h(
      'details',
      { class: 'defs' },
      h('summary', null, '지표 정의'),
      h(
        'ul',
        null,
        h('li', null, '겹침 구간: 두 서열이 모두 잔기를 가진 첫 자리부터 마지막 자리까지입니다. 말단 overhang 은 빼고 내부 gap 은 넣습니다.'),
        h('li', null, '일치도 = 같은 잔기 수 / 겹침 구간 자리 수. 카드의 "gap 제외" 값은 양쪽 모두 잔기가 있는 쌍만 분모로 씁니다. 통계 CSV 에는 EMBOSS 방식(정렬 전체 길이 분모) 값도 들어 있습니다.'),
        h('li', null, nucleotide ? '유사도 = 같거나 transition(A↔G, C↔T) 인 자리 / 겹침 구간 자리 수.' : `유사도 = 같거나 ${aln.scoringName} 점수가 양수인 자리 / 겹침 구간 자리 수 (EMBOSS 와 같은 기준).`),
        h('li', null, '삽입·결실은 기준 서열에 대한 방향입니다. 삽입 = 비교 서열에만 있는 잔기, 결실 = 기준 서열에만 있는 잔기.'),
        h('li', null, '물성 표의 분모는 양쪽 모두 표준 잔기인 정렬쌍입니다. U 와 T 는 같은 염기로 취급합니다.'),
      ),
    ),
  );
  host.replaceChildren(...parts);
}
