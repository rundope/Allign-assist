import './styles.css';
import { resolveSeqType } from './core/align';
import type { AlignSettings } from './core/types';
import { SCHEME_LABEL, SCHEME_LEGEND, mix } from './render/colors';
import { buildModel, type RenderModel } from './render/model';
import { drawOverview, overviewColumnAt, type OverviewLayout } from './render/overview';
import { AlignmentViewer } from './render/viewer';
import { h, toast } from './ui/dom';
import { EXAMPLES } from './ui/examples';
import { exportPNG, exportSVG, exportText } from './ui/export';
import { buildInputPanel } from './ui/inputPanel';
import { buildSettings } from './ui/settingsPanel';
import { CATEGORIES, CATEGORY_LABEL, loadState, persist, recordsSignature } from './ui/state';
import { GlancePanel } from './ui/glancePanel';
import { renderStats } from './ui/statsPanel';
import { align as runInWorker } from './worker/client';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const st = loadState();
let model: RenderModel | null = null;
let overviewLayout: OverviewLayout | null = null;
let lastViewport: [number, number] | undefined;
let running = false;

const viewer = new AlignmentViewer($('viewer-scroll'), $('viewer-inner'), $('tooltip'));
const glance = new GlancePanel($('glance'), {
  jumpTo: (col) => {
    setDisplayMode('detail');
    // wait for the detail view to lay out before scrolling
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!model) return;
        viewer.scrollToColumn(Math.max(model.c0, Math.min(model.c1 - 1, col)));
        $('detail-zone').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }),
    );
  },
});

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
  if (model) {
    drawOv();
    glance.render();
  }
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
  $('run-hint').textContent = n < 2 ? '서열이 2개 이상 필요합니다.' : isStale() ? '입력이나 정렬 설정이 바뀌었습니다.' : '최신 결과입니다.';
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
      $('progress-label').textContent = stage;
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
    // the glance view is sized to the window; show it whole
    if (st.view.displayMode === 'glance' && !$('input-panel').contains(document.activeElement))
      $('glance-zone').scrollIntoView({ block: 'start' });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg !== 'cancelled') toast(`정렬 실패: ${msg}`, 'error');
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
  st.records = ex.records();
  Object.assign(st.align, ex.align);
  st.view.compareTo = 'row';
  st.view.compareRow = ex.align.referenceIndex ?? 0;
  persist(st);
  rebuildInputPanel();
  rebuildSettingsPanel();
  $('seq-count').textContent = String(st.records.length);
  if (!quiet) toast(`예제: ${ex.description}`);
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
  const warn = $('warnings');
  warn.replaceChildren(...aln.warnings.map((w) => h('div', { class: 'warning' }, w)));
  renderLegend();
  applyDisplayMode();
  if (st.view.displayMode === 'glance') {
    glance.setModel(model);
    viewer.setModel(null);
  } else {
    viewer.setModel(model);
    drawOv();
  }
  renderStatsWithFocus();
}

function applyDisplayMode() {
  const g = st.view.displayMode === 'glance';
  $('glance-zone').hidden = !g;
  $('detail-zone').hidden = g;
  $('legend').hidden = g;
  for (const [id, on] of [
    ['mode-detail', !g],
    ['mode-glance', g],
  ] as const) {
    const b = $(id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}

function setDisplayMode(mode: 'detail' | 'glance') {
  if (st.view.displayMode === mode) return;
  st.view.displayMode = mode;
  persist(st);
  renderResult();
  // the glance view is sized to the window, so bring it fully into view
  if (mode === 'glance') $('glance-zone').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('mode-detail').addEventListener('click', () => setDisplayMode('detail'));
$('mode-glance').addEventListener('click', () => setDisplayMode('glance'));
document.addEventListener('keydown', (e) => {
  if (e.key !== 'g' && e.key !== 'G') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, [contenteditable]')) return;
  if (!st.alignment) return;
  setDisplayMode(st.view.displayMode === 'glance' ? 'detail' : 'glance');
});

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
    items.push(h('span', { class: 'lg-title' }, `기준: ${target}`));
    for (const c of CATEGORIES) {
      if (c === 'similar' && !v.showSimilar) continue;
      items.push(sw(v.colors[c].bg, v.colors[c].fg, c === 'gap' ? '-' : 'A', CATEGORY_LABEL[c]));
    }
  } else if (v.highlight === 'conservation') {
    items.push(h('span', { class: 'lg-title' }, '열 보존도'));
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
      items.push(h('span', { class: 'lg-title' }, SCHEME_LABEL[v.residueScheme]));
      const leg = (SCHEME_LEGEND as Record<string, [string, string][]>)[v.residueScheme];
      if (leg) for (const [c, l] of leg) items.push(sw(c, '', '', l));
      else items.push(h('span', { class: 'muted' }, '잔기마다 고유색 (마우스를 올리면 잔기 정보 표시)'));
    }
  }
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
    if (st.view.displayMode === 'glance') glance.render();
    else {
      if (st.view.residuesPerLine === 0) viewer.rebuild();
      drawOv();
    }
  }, 150);
});

// sidebar toggle (small screens)
$('sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-hidden'));

// ---------------------------------------------------------------- boot
rebuildInputPanel();
rebuildSettingsPanel();
renderResult();
updateRunButton();
if (nonEmpty().length >= 2) scheduleAuto();
else if (st.firstRun) {
  // first visit: open on a worked example (synthetic data) instead of an empty screen
  loadExample('mapping', true);
  toast('예제(합성 서열)를 불러왔습니다. 왼쪽에서 내 서열로 바꿔 넣으세요.');
}
