import { errorText, getLang, onLangChange, setLang, t, tm } from './i18n';
import './styles.css';
import favicon from './assets/favicon.png';
import { resolveSeqType } from './core/align';
import type { AlignSettings } from './core/types';
import { SCHEME_LABEL, SCHEME_LEGEND, mix } from './render/colors';
import { buildModel, type RenderModel } from './render/model';
import { LOW_QV_COLOR, TRACE_COLOR } from './render/svg';
import { drawOverview, overviewColumnAt, type OverviewLayout } from './render/overview';
import { AlignmentViewer } from './render/viewer';
import { h, toast } from './ui/dom';
import { EXAMPLES } from './ui/examples';
import { exportPNG, exportSVG, exportText } from './ui/export';
import { buildInputPanel } from './ui/inputPanel';
import { buildSettings } from './ui/settingsPanel';
import { CATEGORIES, CATEGORY_LABEL, loadState, persist, recordsSignature } from './ui/state';
import { renderStats } from './ui/statsPanel';
import { attachTrace, detachTrace, hasAnyTrace, restoreTraces, traceFor } from './ui/traceStore';
import { align as runInWorker } from './worker/client';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Spoonbills logo as the tab icon (imported, so the single-file build inlines it)
$<HTMLLinkElement>('favicon').href = favicon;

const st = loadState();
let model: RenderModel | null = null;
let overviewLayout: OverviewLayout | null = null;
let lastViewport: [number, number] | undefined;
let running = false;

const viewer = new AlignmentViewer($('viewer-scroll'), $('viewer-inner'), $('tooltip'));

// ---------------------------------------------------------------- theme
function applyTheme(t: string | null) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
try {
  applyTheme(localStorage.getItem('align-assist:theme'));
} catch {
  /* ignore */
}
$('theme-toggle').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem('align-assist:theme', next);
  } catch {
    /* ignore */
  }
  if (model) drawOv();
});

// ---------------------------------------------------------------- input → alignment
function nonEmpty() {
  return st.records.filter((r) => r.seq.length > 0);
}

function effectiveAlignSettings(): AlignSettings {
  const recs = nonEmpty();
  const refRec = st.records[Math.min(st.align.referenceIndex, st.records.length - 1)];
  const idx = refRec ? recs.indexOf(refRec) : 0;
  return { ...st.align, referenceIndex: Math.max(0, idx) };
}

function isStale(): boolean {
  return recordsSignature(nonEmpty(), effectiveAlignSettings()) !== st.alignedSignature;
}

let autoTimer = 0;
function scheduleAuto() {
  clearTimeout(autoTimer);
  updateRunButton();
  const recs = nonEmpty();
  if (recs.length < 2) return;
  // estimate DP work; auto-run only for quick jobs
  let cells = 0;
  for (let i = 0; i < recs.length; i++) for (let j = i + 1; j < recs.length; j++) cells += recs[i].seq.length * recs[j].seq.length;
  if (cells <= 40_000_000) autoTimer = window.setTimeout(() => void runAlignment(), 450);
}

function updateRunButton() {
  const btn = $<HTMLButtonElement>('run-btn');
  const n = nonEmpty().length;
  btn.disabled = n < 2 || running;
  btn.classList.toggle('stale', n >= 2 && isStale());
  $('run-hint').textContent = n < 2 ? t('서열이 2개 이상 필요합니다.') : isStale() ? t('입력이나 정렬 설정이 바뀌었습니다.') : t('최신 결과입니다.');
}

async function runAlignment() {
  const recs = nonEmpty();
  if (recs.length < 2) return;
  const settings = effectiveAlignSettings();
  const sig = recordsSignature(recs, settings);
  running = true;
  updateRunButton();
  const prog = $('progress');
  const progTimer = window.setTimeout(() => (prog.hidden = false), 250);
  try {
    const result = await runInWorker(recs, settings, (stage, fraction) => {
      $('progress-label').textContent = t(stage);
      $<HTMLProgressElement>('progress-bar').value = fraction;
    });
    const prevStrategy = st.alignment?.strategy;
    st.alignment = result;
    st.alignedSignature = sig;
    if (result.strategy === 'reference' && (st.view.compareTo === 'row' || prevStrategy !== 'reference')) {
      st.view.compareTo = 'row';
      st.view.compareRow = result.referenceIndex;
    }
    st.view.compareRow = Math.min(st.view.compareRow, result.rows.length - 1);
    st.statsFocusRow = null;
    persist(st);
    rebuildSettingsPanel();
    // refresh the cards (strand decisions) unless the user is typing in one
    if (!$('input-panel').contains(document.activeElement)) rebuildInputPanel();
    renderResult();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== 'cancelled') toast(t('정렬 실패: {0}', errorText(e)), 'error');
  } finally {
    clearTimeout(progTimer);
    prog.hidden = true;
    running = false;
    updateRunButton();
  }
}

$('run-btn').addEventListener('click', () => void runAlignment());
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    void runAlignment();
  }
});

// ---------------------------------------------------------------- panels
function rebuildInputPanel() {
  buildInputPanel($('input-panel'), st, {
    recordsChanged: (opts) => {
      persist(st);
      if (opts?.structural) rebuildInputPanel();
      rebuildSettingsPanel();
      $('seq-count').textContent = String(st.records.length);
      scheduleAuto();
    },
    loadExample: (key) => loadExample(key),
  });
  $('seq-count').textContent = String(st.records.length);
}

function loadExample(key: string, quiet = false) {
  const ex = EXAMPLES.find((x) => x.key === key);
  if (!ex) return;
  for (const r of st.records) detachTrace(r.id);
  st.records = ex.records();
  // demo chromatograms (synthetic) so the AB1 feature is visible without a file at hand
  for (const tr of ex.traces?.(st.records) ?? []) attachTrace(st.records[tr.index].id, { fileName: t(tr.fileName), chrom: tr.chrom });
  Object.assign(st.align, ex.align);
  st.view.compareTo = 'row';
  st.view.compareRow = ex.align.referenceIndex ?? 0;
  persist(st);
  rebuildInputPanel();
  rebuildSettingsPanel();
  $('seq-count').textContent = String(st.records.length);
  if (!quiet) toast(t('예제: {0}', t(ex.description)));
  void runAlignment();
}

function rebuildSettingsPanel() {
  buildSettings($('settings'), st, {
    alignChanged: () => {
      persist(st);
      scheduleAuto();
    },
    viewChanged: (opts) => {
      persist(st);
      if (opts?.rebuildPanel) rebuildSettingsPanel();
      scheduleRender();
    },
  });
  // keep the seq type hint in the header up to date
  const recs = nonEmpty();
  $('type-badge').textContent = recs.length ? resolveSeqType(recs, st.align).toUpperCase() : '';
}

// ---------------------------------------------------------------- result rendering
let renderRaf = 0;
function scheduleRender() {
  cancelAnimationFrame(renderRaf);
  renderRaf = requestAnimationFrame(renderResult);
}

function renderResult() {
  const aln = st.alignment;
  $('empty-state').hidden = !!aln;
  $('result').hidden = !aln;
  if (!aln) {
    viewer.setModel(null);
    return;
  }
  model = buildModel(aln, st.view, st.align);
  // attach chromatograms by sequence id; the input text may have changed since the run,
  // so link against the sequence that was aligned
  model.traces = aln.rows.map((row) => {
    const rec = st.records.find((x) => x.id === row.id);
    return rec && aln.seqType !== 'protein' ? traceFor(row.id, rec.seq) : null;
  });
  const warn = $('warnings');
  warn.replaceChildren(...aln.warnings.map((w) => h('div', { class: 'warning' }, tm(w))));
  renderLegend();
  viewer.setModel(model);
  drawOv();
  renderStatsWithFocus();
}

function renderStatsWithFocus() {
  if (!model) return;
  const onFocus = (row: number) => {
    st.statsFocusRow = row;
    renderStatsWithFocus();
  };
  renderStats($('stats'), model, st.statsFocusRow, onFocus);
}

function drawOv() {
  if (!model) return;
  const canvas = $<HTMLCanvasElement>('overview');
  const w = $('overview-wrap').clientWidth;
  if (w <= 0) return;
  overviewLayout = drawOverview(canvas, model, w, lastViewport);
}

viewer.onViewportChange = (range) => {
  lastViewport = range;
  drawOv();
};

$<HTMLCanvasElement>('overview').addEventListener('click', (e) => {
  if (!model || !overviewLayout) return;
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  const c = overviewColumnAt(overviewLayout, e.clientX - rect.left, model.rows[0].length);
  if (c !== null) viewer.scrollToColumn(Math.max(model.c0, Math.min(model.c1 - 1, c)));
});

function renderLegend() {
  const v = st.view;
  const host = $('legend');
  const items: HTMLElement[] = [];
  const sw = (bg: string, fg: string, ch: string, label: string) =>
    h('span', { class: 'lg-item' }, h('span', { class: 'lg-sw', style: { background: bg || 'transparent', color: fg || v.textColor, borderColor: bg ? 'transparent' : 'var(--border)' } }, ch), label);
  if (v.highlight === 'identity') {
    const target = v.compareTo === 'consensus' ? 'Consensus' : (st.alignment?.rows[v.compareRow]?.name ?? '');
    items.push(h('span', { class: 'lg-title' }, t('기준: {0}', target)));
    for (const c of CATEGORIES) {
      if (c === 'similar' && !v.showSimilar) continue;
      items.push(sw(v.colors[c].bg, v.colors[c].fg, c === 'gap' ? '-' : 'A', t(CATEGORY_LABEL[c])));
    }
  } else if (v.highlight === 'conservation') {
    items.push(h('span', { class: 'lg-title' }, t('열 보존도')));
    for (const [lvl, label] of [
      [1, '> 80%'],
      [0.62, '> 60%'],
      [0.3, '> 40%'],
    ] as const)
      items.push(sw(mix(v.conservationColor, v.paperColor, lvl), '', 'A', label));
  } else if (v.highlight === 'residue') {
    const nuc = st.alignment?.seqType !== 'protein';
    if (nuc || v.residueScheme === 'nucleotide') {
      items.push(h('span', { class: 'lg-title' }, 'Nucleotide'));
      for (const b of ['A', 'C', 'G', 'T'] as const) items.push(sw(v.nucleotideColors[b], '', b, ''));
    } else {
      items.push(h('span', { class: 'lg-title' }, t(SCHEME_LABEL[v.residueScheme])));
      const leg = (SCHEME_LEGEND as Record<string, [string, string][]>)[v.residueScheme];
      if (leg) for (const [c, l] of leg) items.push(sw(c, '', '', t(l)));
      else items.push(h('span', { class: 'muted' }, t('잔기마다 고유색 (마우스를 올리면 잔기 정보 표시)')));
    }
  }
  if (v.showLowQuality && hasAnyTrace() && model?.traces?.some(Boolean))
    items.push(h('span', { class: 'lg-item' }, h('span', { class: 'lg-qv', style: { borderColor: LOW_QV_COLOR } }), t('AB1 품질 QV < {0}', v.qualityThreshold)));
  if (v.showTraces && model?.nucleotide && model.traces?.some(Boolean))
    items.push(
      h(
        'span',
        { class: 'lg-item lg-trace' },
        t('크로마토그램'),
        ...(['A', 'C', 'G', 'T'] as const).map((b) => h('b', { style: { color: b === 'G' ? 'var(--tr-g)' : TRACE_COLOR[b] } }, b)),
      ),
    );
  host.replaceChildren(...items);
}

// ---------------------------------------------------------------- export & toolbar
function exportWidth() {
  return st.view.residuesPerLine > 0 ? 100000 : viewer.availableWidth;
}
$('export-svg').addEventListener('click', () => model && exportSVG(model, exportWidth()));
$('export-png').addEventListener('click', () => model && void exportPNG(model, exportWidth()));
$('export-fasta').addEventListener('click', () => model && exportText(model, 'fasta'));
$('export-aln').addEventListener('click', () => model && exportText(model, 'clustal'));
$('export-csv').addEventListener('click', () => model && exportText(model, 'csv'));

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (!model) return;
    if (st.view.residuesPerLine === 0) viewer.rebuild();
    drawOv();
  }, 150);
});

// sidebar toggle (small screens)
$('sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-hidden'));

// ---------------------------------------------------------------- language
const MANUAL_URL = { ko: 'https://github.com/rundope/Allign-assist/blob/main/docs/manual.ko.md', en: 'https://github.com/rundope/Allign-assist/blob/main/docs/manual.en.md' };

/** Translate the static page (elements marked with data-i18n / data-i18n-html / data-i18n-title). */
function applyStaticText() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml!)));
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.title);
  });
  ($('help-link') as HTMLAnchorElement).href = MANUAL_URL[lang];
  for (const l of ['ko', 'en'] as const) {
    const b = $(`lang-${l}`);
    b.classList.toggle('on', l === lang);
    b.setAttribute('aria-pressed', String(l === lang));
  }
}

$('lang-ko').addEventListener('click', () => setLang('ko'));
$('lang-en').addEventListener('click', () => setLang('en'));
onLangChange(() => {
  applyStaticText();
  rebuildInputPanel();
  rebuildSettingsPanel();
  renderResult();
  updateRunButton();
});

// ---------------------------------------------------------------- boot
applyStaticText();
restoreTraces(st.records.map((r) => r.id));
rebuildInputPanel();
rebuildSettingsPanel();
renderResult();
updateRunButton();
if (nonEmpty().length >= 2) scheduleAuto();
else if (st.firstRun) {
  // first visit: open on a worked example (synthetic data) instead of an empty screen
  loadExample('mapping', true);
  toast(t('예제(합성 서열)를 불러왔습니다. read_1·read_3 에는 AB1 크로마토그램이 붙어 있으니 정렬 보기에서 그 염기에 마우스를 올려 보세요.'));
}
