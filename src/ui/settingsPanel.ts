// Sidebar settings: alignment parameters, layout/typography, colours and display toggles.
import { t } from '../i18n';
import { resolveSeqType } from '../core/align';
import { PROTEIN_MATRICES } from '../core/matrices';
import type { AlignMode } from '../core/pairwise';
import { SCHEME_LABEL } from '../render/colors';
import { checkbox, colorInput, h, numberInput, section, select } from './dom';
import { CATEGORIES, CATEGORY_LABEL, COLOR_PRESETS, DEFAULT_VIEW, FONT_CHOICES, type AppState, type ResidueScheme } from './state';

export interface SettingsCallbacks {
  alignChanged: () => void;
  viewChanged: (opts?: { rebuildPanel?: boolean }) => void;
}

const MODE_HELP: Record<AlignMode, string> = {
  fit: '레퍼런스 안에서 비교 서열 전체가 들어갈 자리를 찾습니다. (primer·read·조각 → 플라스미드/유전자 매핑)',
  semiglobal: '양쪽 말단 overhang 을 벌점 없이 허용합니다. 길이가 다른 비슷한 두 서열 비교에 적합합니다.',
  global: '처음부터 끝까지 전체를 정렬합니다 (Needleman-Wunsch). 길이·범위가 같은 서열 비교용입니다.',
  local: '가장 잘 맞는 부분 구간만 찾습니다 (Smith-Waterman). 도메인·모티프 탐색용입니다.',
};

export function buildSettings(host: HTMLElement, st: AppState, cb: SettingsCallbacks): void {
  const a = st.align;
  const v = st.view;
  const setA = <K extends keyof typeof a>(k: K) => (val: (typeof a)[K]) => {
    a[k] = val;
    cb.alignChanged();
  };
  const setV = <K extends keyof typeof v>(k: K, rebuildPanel = false) => (val: (typeof v)[K]) => {
    v[k] = val;
    cb.viewChanged({ rebuildPanel });
  };
  const n = st.records.length;
  const effType = a.seqType === 'auto' ? (st.records.some((r) => r.seq) ? resolveSeqType(st.records.filter((r) => r.seq), a) : null) : a.seqType;
  const nucleotideSelected = effType !== 'protein';
  const proteinSelected = effType === 'protein' || effType === null;

  // ---------------- alignment ----------------
  const alignSec = section(
    t('① 정렬 방법'),
    true,
    select(
      t('방식'),
      [
        { value: 'reference', label: n > 2 ? t('레퍼런스 기준 정렬 (각 서열 → 레퍼런스)') : t('쌍 정렬 (Pairwise)') },
        { value: 'msa', label: t('다중 서열 정렬 (Progressive MSA)') },
      ],
      () => a.strategy,
      (val) => {
        a.strategy = val;
        cb.alignChanged();
        cb.viewChanged({ rebuildPanel: true });
      },
      a.strategy === 'msa'
        ? t('Guide tree(UPGMA) 순서로 서열·프로파일을 차례로 합칩니다. 서로 비슷한 여러 서열을 한꺼번에 비교할 때.')
        : t('레퍼런스 1개에 나머지를 각각 정렬한 뒤 레퍼런스 좌표로 합칩니다. "내 서열이 레퍼런스 어디에 붙는가"에 적합합니다.'),
    ),
    select(
      t('정렬 모드'),
      [
        { value: 'fit', label: t('Fit — 레퍼런스 안에서 위치 찾기') },
        { value: 'semiglobal', label: t('Semi-global — 말단 overhang 허용') },
        { value: 'global', label: t('Global — 전체 대 전체') },
        { value: 'local', label: t('Local — 가장 잘 맞는 구간만') },
      ],
      () => a.mode,
      (val) => {
        a.mode = val;
        cb.alignChanged();
        cb.viewChanged({ rebuildPanel: true });
      },
      t(MODE_HELP[a.mode]) + (a.strategy === 'msa' && (a.mode === 'fit' || a.mode === 'local') ? t(' (MSA 에서는 semi-global 로 실행됩니다)') : ''),
    ),
    select(
      t('서열 종류'),
      [
        { value: 'auto', label: effType ? t('자동 감지 ({0})', effType.toUpperCase()) : t('자동 감지') },
        { value: 'dna', label: 'DNA' },
        { value: 'rna', label: 'RNA' },
        { value: 'protein', label: 'Protein' },
      ],
      () => a.seqType,
      (val) => {
        a.seqType = val;
        cb.alignChanged();
        cb.viewChanged({ rebuildPanel: true });
      },
    ),
    proteinSelected
      ? select(
          t('단백질 치환 행렬'),
          PROTEIN_MATRICES.map((mname) => ({ value: mname, label: mname })),
          () => a.proteinMatrix,
          setA('proteinMatrix'),
          t('BLOSUM62 가 일반 기본값. 먼 관계는 BLOSUM45/PAM250, 가까운 관계는 BLOSUM80.'),
        )
      : null,
    nucleotideSelected
      ? select(
          t('DNA 점수'),
          [
            { value: 'NUC.4.4', label: 'NUC.4.4 / EDNAFULL (+5 / −4, IUPAC)' },
            { value: 'simple', label: t('직접 지정 (match / mismatch)') },
          ],
          () => a.dnaMatrix,
          (val) => {
            a.dnaMatrix = val;
            cb.alignChanged();
            cb.viewChanged({ rebuildPanel: true });
          },
        )
      : null,
    nucleotideSelected && a.dnaMatrix === 'simple'
      ? h(
          'div',
          { class: 'grid2' },
          numberInput('Match', () => a.dnaMatch, setA('dnaMatch'), { min: 1, max: 20 }),
          numberInput('Mismatch', () => a.dnaMismatch, setA('dnaMismatch'), { min: -20, max: 0 }),
        )
      : null,
    h(
      'div',
      { class: 'grid2' },
      numberInput('Gap open', () => a.gapOpen, setA('gapOpen'), { min: 0, max: 50, step: 0.5 }),
      numberInput('Gap extend', () => a.gapExtend, setA('gapExtend'), { min: 0, max: 20, step: 0.1 }),
    ),
    h('div', { class: 'hint' }, t('길이 L 의 gap 비용 = open + (L−1) × extend. 기본값 10 / 0.5 는 EMBOSS needle·water 와 같습니다.')),
    nucleotideSelected
      ? checkbox(t('양쪽 가닥 탐색 (역상보 자동 판단)'), () => a.bothStrands, setA('bothStrands'), t("가닥이 '자동'인 서열에만 적용됩니다. 역상보(reverse complement)가 더 잘 맞으면 뒤집어서 정렬하고 이름 뒤에 (rc)를 붙입니다. 서열마다 카드 아래에서 정방향/역상보를 직접 고를 수 있습니다."))
      : null,
  );

  // ---------------- layout ----------------
  const fontIsPreset = FONT_CHOICES.some((f) => f.value === v.fontFamily);
  const layoutSec = section(
    t('② 레이아웃 · 글꼴'),
    true,
    numberInput(t('한 줄에 표시할 잔기 수 (0 = 창 너비에 맞춤)'), () => v.residuesPerLine, setV('residuesPerLine'), { min: 0, max: 500, step: 10, slider: true }),
    numberInput(t('세로줄 간격 (잔기 사이, px)'), () => v.columnGap, setV('columnGap'), { min: 0, max: 16, slider: true, hint: t('0 보다 크면 잔기마다 색 타일이 분리되어 보입니다.') }),
    numberInput(t('가로줄 간격 (서열 행 사이, px)'), () => v.rowGap, setV('rowGap'), { min: 0, max: 30, slider: true }),
    numberInput(t('블록 간격 (줄바꿈 사이, px)'), () => v.blockGap, setV('blockGap'), { min: 0, max: 80, slider: true }),
    checkbox(t('블록 사이 점선'), () => v.blockSeparator, setV('blockSeparator'), t('줄바꿈된 블록 사이에 점선을 그어 구간을 나눕니다. 이미지 내보내기에도 들어갑니다.')),
    h(
      'div',
      { class: 'grid2' },
      numberInput(t('묶음 단위 (잔기)'), () => v.groupSize, setV('groupSize'), { min: 0, max: 50, hint: t('0 = 묶지 않음') }),
      numberInput(t('묶음 간격 (px)'), () => v.groupGap, setV('groupGap'), { min: 0, max: 40 }),
    ),
    select(
      t('글꼴'),
      [...FONT_CHOICES, { label: t('직접 입력…'), value: '__custom' }],
      () => (fontIsPreset ? v.fontFamily : '__custom'),
      (val) => {
        if (val === '__custom') {
          v.fontFamily = 'Pretendard, sans-serif';
          cb.viewChanged({ rebuildPanel: true });
        } else setV('fontFamily', true)(val);
      },
      t('어떤 글꼴이든 잔기는 열 격자에 정확히 맞춰 배치됩니다.'),
    ),
    !fontIsPreset
      ? (() => {
          const inp = h('input', { type: 'text', value: v.fontFamily, placeholder: t('예: "JetBrains Mono", monospace') }) as HTMLInputElement;
          inp.addEventListener('change', () => setV('fontFamily')(inp.value || DEFAULT_VIEW.fontFamily));
          return h('div', { class: 'field' }, h('label', null, t('글꼴 이름 (CSS font-family, 설치된 글꼴)')), inp);
        })()
      : null,
    numberInput(t('글자 크기 (px)'), () => v.fontSize, setV('fontSize'), { min: 8, max: 36, slider: true }),
    select(
      t('글자 굵기'),
      [
        { value: 'normal', label: t('보통') },
        { value: 'bold', label: t('굵게') },
      ],
      () => v.fontWeight,
      setV('fontWeight'),
    ),
    numberInput(t('이름 최대 글자 수'), () => v.nameMaxChars, setV('nameMaxChars'), { min: 4, max: 80 }),
  );

  // ---------------- colours ----------------
  const colorSec = section(
    t('③ 색상 · 강조'),
    true,
    select(
      t('강조 방식'),
      [
        { value: 'identity', label: t('일치 / 유사 / 불일치 (비교 대상 기준)') },
        { value: 'conservation', label: t('열 보존도 음영 (% identity)') },
        { value: 'residue', label: t('잔기 물성 색 (color scheme)') },
        { value: 'none', label: t('색 없음') },
      ],
      () => v.highlight,
      setV('highlight', true),
    ),
    select(
      t('비교 대상'),
      [
        ...(st.alignment?.rows ?? st.records).map((r, i) => ({ value: `row:${i}`, label: t('서열 {0}: {1}', i + 1, r.name) })),
        { value: 'consensus', label: t('Consensus (열별 최다 잔기)') },
      ],
      () => (v.compareTo === 'consensus' ? 'consensus' : `row:${v.compareRow}`),
      (val) => {
        if (val === 'consensus') v.compareTo = 'consensus';
        else {
          v.compareTo = 'row';
          v.compareRow = Number(val.slice(4));
        }
        st.statsFocusRow = null;
        cb.viewChanged();
      },
      t('색·점(.) 표시·통계의 기준이 되는 서열입니다. 정렬을 다시 하지 않고 바꿀 수 있습니다.'),
    ),
    v.highlight === 'identity' ? presetRow(st, cb) : null,
    v.highlight === 'identity' ? categoryGrid(st, cb) : null,
    v.highlight === 'identity'
      ? h(
          'div',
          null,
          checkbox(t('유사 잔기 따로 표시'), () => v.showSimilar, setV('showSimilar'), t('단백질: 치환 행렬 점수 > 0 / DNA: purine·pyrimidine 이 같은 transition')),
          checkbox(t('비교 기준 서열도 색칠'), () => v.colorReference, setV('colorReference'), t('기준 서열의 잔기를 다른 서열들과의 비교 결과로 색칠합니다.')),
        )
      : null,
    v.highlight === 'conservation'
      ? field2(t('보존도 색'), colorInput(() => v.conservationColor, setV('conservationColor')), t('열에서 consensus 와 같은 잔기를 >80% / >60% / >40% 세 단계 농도로 칠합니다 (Jalview Percentage Identity 방식).'))
      : null,
    v.highlight === 'residue'
      ? h(
          'div',
          null,
          select(
            'Color scheme',
            (Object.keys(SCHEME_LABEL) as ResidueScheme[]).map((k) => ({ value: k, label: t(SCHEME_LABEL[k]) })),
            () => v.residueScheme,
            setV('residueScheme', true),
            t('DNA/RNA 는 항상 Nucleotide 색을 씁니다.'),
          ),
          select(
            t('색 적용 위치'),
            [
              { value: 'bg', label: t('배경') },
              { value: 'fg', label: t('글자') },
            ],
            () => v.residueTarget,
            setV('residueTarget'),
          ),
          numberInput(t('보존 임계값 (%)'), () => v.residueThreshold, setV('residueThreshold'), { min: 0, max: 100, step: 5, slider: true, hint: t('열의 consensus 비율이 이 값 이상인 열만 색칠합니다.') }),
          nucleotideColorsRow(st, cb),
        )
      : null,
    checkbox(t('기준과 같은 잔기를 점(.)으로 표시'), () => v.dotIdentical, setV('dotIdentical'), t('차이만 글자로 남아 변이 위치가 한눈에 보입니다.')),
    checkbox(t('말단 gap 숨기기'), () => v.hideTerminalGaps, setV('hideTerminalGaps'), t('서열이 시작하기 전·끝난 뒤의 gap(-)을 빈칸으로 표시합니다.')),
    checkbox(t('배경색에 맞춰 글자색 자동 대비'), () => v.autoContrast, setV('autoContrast')),
    h(
      'div',
      { class: 'grid3' },
      field2(t('기본 글자색'), colorInput(() => v.textColor, setV('textColor'))),
      field2(t('보조 글자색'), colorInput(() => v.mutedColor, setV('mutedColor'))),
      field2(t('배경(종이)'), colorInput(() => v.paperColor, setV('paperColor'))),
    ),
  );

  // ---------------- display elements ----------------
  const showSec = section(
    t('④ 표시 요소'),
    false,
    checkbox(t('서열 이름'), () => v.showNames, setV('showNames')),
    checkbox(t('시작 / 끝 잔기 번호'), () => v.showNumbers, setV('showNumbers')),
    checkbox(t('눈금자 (ruler)'), () => v.showRuler, setV('showRuler', true)),
    v.showRuler
      ? select(
          t('눈금 기준'),
          [
            { value: 'reference', label: t('비교 기준 서열의 잔기 번호') },
            { value: 'alignment', label: t('정렬 열 번호') },
          ],
          () => v.rulerMode,
          setV('rulerMode'),
        )
      : null,
    checkbox(t("보존 기호 (* : .)"), () => v.showSymbols, setV('showSymbols'), t("'*' 모두 동일, ':' Clustal strong group, '.' weak group")),
    checkbox(t('Consensus 행'), () => v.showConsensus, setV('showConsensus'), t('과반(>50%)이면 대문자, 아니면 소문자')),
    checkbox(t('AB1 크로마토그램을 서열 바로 위에 표시'), () => v.showTraces, setV('showTraces', true), t('AB1 을 붙인 서열의 정렬 줄 위에 신호 곡선을 그립니다. 각 염기의 peak 이 아래 글자와 같은 열에 오도록 맞춥니다.')),
    v.showTraces ? numberInput(t('크로마토그램 높이'), () => v.traceHeight, setV('traceHeight'), { min: 20, max: 160, suffix: 'px' }) : null,
    checkbox(t('AB1 품질이 낮은 염기 밑줄'), () => v.showLowQuality, (val) => { v.showLowQuality = val; cb.viewChanged({ rebuildPanel: true }); }, t('AB1 크로마토그램을 붙인 서열에서 품질값(Phred QV)이 기준보다 낮은 염기 아래에 주황 점선을 긋습니다.')),
    v.showLowQuality ? numberInput(t('품질 기준 (QV)'), () => v.qualityThreshold, setV('qualityThreshold'), { min: 1, max: 60, hint: t('QV 20 = 오류 확률 1%, QV 30 = 0.1%') }) : null,
    checkbox(t('열별 % identity 막대'), () => v.showConservation, setV('showConservation')),
    select(
      t('표시 범위'),
      [
        { value: 'full', label: t('전체') },
        { value: 'aligned', label: t('두 서열 이상 겹치는 구간만') },
      ],
      () => v.viewRange,
      setV('viewRange'),
    ),
    h(
      'button',
      {
        class: 'btn ghost small',
        onclick: () => {
          const keepCompare = { compareTo: v.compareTo, compareRow: v.compareRow };
          Object.assign(v, structuredClone(DEFAULT_VIEW), keepCompare);
          cb.viewChanged({ rebuildPanel: true });
        },
      },
      t('표시 설정 초기화'),
    ),
  );

  host.replaceChildren(alignSec, layoutSec, colorSec, showSec);
}

function field2(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('div', { class: 'field' }, h('label', null, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
}

function presetRow(st: AppState, cb: SettingsCallbacks): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('label', null, t('색 프리셋')),
    h(
      'div',
      { class: 'chips' },
      ...Object.entries(COLOR_PRESETS).map(([, p]) =>
        h(
          'button',
          {
            class: 'chip',
            onclick: () => {
              st.view.colors = structuredClone(p.colors);
              cb.viewChanged({ rebuildPanel: true });
            },
          },
          h('span', { class: 'chip-swatch', style: { background: p.colors.mismatch.bg || p.colors.match.bg || '#ccc' } }),
          t(p.label),
        ),
      ),
    ),
  );
}

function categoryGrid(st: AppState, cb: SettingsCallbacks): HTMLElement {
  const v = st.view;
  return h(
    'div',
    { class: 'cat-grid' },
    h('div', { class: 'cat-head' }, ''),
    h('div', { class: 'cat-head' }, t('배경')),
    h('div', { class: 'cat-head' }, t('글자')),
    ...CATEGORIES.flatMap((cat) => [
      h(
        'div',
        { class: 'cat-name' },
        h('span', { class: 'cat-sample', style: { background: v.colors[cat].bg || 'transparent', color: v.colors[cat].fg || v.textColor } }, cat === 'gap' ? '-' : 'A'),
        t(CATEGORY_LABEL[cat]),
      ),
      colorInput(
        () => v.colors[cat].bg,
        (c) => {
          v.colors[cat].bg = c;
          cb.viewChanged();
        },
        { allowNone: true, title: t('{0} 배경', t(CATEGORY_LABEL[cat])) },
      ),
      colorInput(
        () => v.colors[cat].fg,
        (c) => {
          v.colors[cat].fg = c;
          cb.viewChanged();
        },
        { allowNone: true, title: t('{0} 글자 (없음 = 자동)', t(CATEGORY_LABEL[cat])), fallback: '#1f2328' },
      ),
    ]),
  );
}

function nucleotideColorsRow(st: AppState, cb: SettingsCallbacks): HTMLElement {
  const v = st.view;
  return h(
    'div',
    { class: 'field' },
    h('label', null, t('Nucleotide 색 (A / C / G / T·U / N)')),
    h(
      'div',
      { class: 'nuc-row' },
      ...(['A', 'C', 'G', 'T', 'N'] as const).map((b) =>
        h(
          'span',
          { class: 'nuc-item' },
          h('b', null, b),
          colorInput(
            () => v.nucleotideColors[b],
            (c) => {
              v.nucleotideColors[b] = c;
              cb.viewChanged();
            },
          ),
        ),
      ),
    ),
  );
}
