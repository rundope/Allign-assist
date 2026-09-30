// Sequence input: cards per sequence, file loading, bulk FASTA paste and demo data.
import { errorText, t } from '../i18n';
import { qualitySummary } from '../core/trace';
import { cleanSequence, detectSetType, detectType, newId, parseSequences, type SeqRecord, type StrandMode } from '../core/seq';
import { attachTrace, detachTrace, getTrace, readAb1, traceFor } from './traceStore';
import { EXAMPLES } from './examples';
import { h, toast } from './dom';
import type { AppState } from './state';

export interface InputCallbacks {
  recordsChanged: (opts?: { structural?: boolean }) => void;
  loadExample: (key: string) => void;
}

const TYPE_LABEL = { dna: 'DNA', rna: 'RNA', protein: 'Protein' } as const;

export function buildInputPanel(host: HTMLElement, st: AppState, cb: InputCallbacks): void {
  const fileInput = h('input', { type: 'file', multiple: true, accept: '.fa,.fasta,.fas,.fna,.faa,.ffn,.txt,.seq,.gb,.gbk,.genbank,.embl,.aln,.ab1,.abi,.ab', hidden: true }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    await addFiles(st, [...(fileInput.files ?? [])], cb);
    fileInput.value = '';
  });

  const examples = h(
    'select',
    { class: 'btn-select', 'aria-label': t('예제 불러오기') },
    h('option', { value: '' }, t('예제 ▾')),
    ...EXAMPLES.map((e) => h('option', { value: e.key, title: t(e.description) }, t(e.label))),
  ) as HTMLSelectElement;
  examples.addEventListener('change', () => {
    if (examples.value) cb.loadExample(examples.value);
    examples.value = '';
  });

  const toolbar = h(
    'div',
    { class: 'input-toolbar' },
    h(
      'button',
      {
        class: 'btn small',
        onclick: () => {
          st.records.push({ id: newId(), name: `Sequence ${st.records.length + 1}`, seq: '' });
          cb.recordsChanged({ structural: true });
          requestAnimationFrame(() => (host.querySelector('.seq-card:last-of-type textarea') as HTMLTextAreaElement | null)?.focus());
        },
      },
      t('+ 서열'),
    ),
    h('button', { class: 'btn small', onclick: () => fileInput.click() }, t('파일 열기')),
    h('button', { class: 'btn small', onclick: () => openPasteDialog(st, cb) }, t('FASTA 붙여넣기')),
    examples,
    st.records.length
      ? h(
          'button',
          {
            class: 'btn small ghost danger',
            onclick: (e: MouseEvent) => {
              // two-step confirmation inside the page (window.confirm is unavailable in some embeds)
              const btn = e.currentTarget as HTMLButtonElement;
              if (btn.dataset.armed !== '1') {
                btn.dataset.armed = '1';
                btn.textContent = t('한 번 더 누르면 삭제');
                setTimeout(() => {
                  btn.dataset.armed = '';
                  btn.textContent = t('전체 삭제');
                }, 3000);
                return;
              }
              for (const rec of st.records) detachTrace(rec.id);
              st.records.length = 0;
              cb.recordsChanged({ structural: true });
            },
          },
          t('전체 삭제'),
        )
      : null,
    fileInput,
  );

  const list = h('div', { class: 'seq-list' });
  const isRefStrategy = st.align.strategy === 'reference';
  const refId = st.records[Math.min(st.align.referenceIndex, st.records.length - 1)]?.id;
  st.records.forEach((r, i) => list.appendChild(seqCard(st, r, i, isRefStrategy && r.id === refId, isRefStrategy, cb)));
  if (!st.records.length) {
    list.appendChild(
      h(
        'div',
        { class: 'drop-hint' },
        h('b', null, t('서열을 추가하세요')),
        h('div', null, t('FASTA · GenBank · EMBL · AB1 · 일반 텍스트 파일을 이 영역에 끌어다 놓거나, 위의 버튼을 사용하세요.')),
      ),
    );
  }
  host.replaceChildren(toolbar, list);

  // drag & drop
  if (!host.dataset.dnd) {
    host.dataset.dnd = '1';
    host.addEventListener('dragover', (e) => {
      e.preventDefault();
      host.classList.add('dragging');
    });
    host.addEventListener('dragleave', () => host.classList.remove('dragging'));
    host.addEventListener('drop', async (e) => {
      e.preventDefault();
      host.classList.remove('dragging');
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) await addFiles(st, files, cb);
      else {
        const text = e.dataTransfer?.getData('text/plain');
        if (text) addText(st, text, cb);
      }
    });
  }
}

function seqCard(st: AppState, r: SeqRecord, i: number, isRef: boolean, refStrategy: boolean, cb: InputCallbacks): HTMLElement {
  const len = r.seq.length;
  const type = len ? TYPE_LABEL[detectType(r.seq)] : '';
  const nucleotideCard = type !== 'Protein' && setIsNucleotide(st);
  const nameIn = h('input', { class: 'seq-name', value: r.name, 'aria-label': t('서열 이름') }) as HTMLInputElement;
  nameIn.addEventListener('change', () => {
    r.name = nameIn.value.trim() || `Sequence ${i + 1}`;
    cb.recordsChanged();
  });
  const area = h('textarea', { rows: 3, spellcheck: 'false', placeholder: t('서열 붙여넣기 (공백·숫자는 자동 제거, FASTA 여러 개도 가능)') }, r.seq) as HTMLTextAreaElement;
  const meta = h('span', { class: 'seq-meta' }, len ? `${len.toLocaleString()} ${type === 'Protein' ? 'aa' : 'nt'} · ${type}` : t('비어 있음'));
  area.addEventListener('input', () => {
    const cleaned = cleanSequence(area.value);
    meta.textContent = cleaned.length ? `${cleaned.length.toLocaleString()} · ${TYPE_LABEL[detectType(cleaned)]}` : t('비어 있음');
  });
  area.addEventListener('change', () => {
    const text = area.value;
    // pasting a multi-record FASTA into one card splits it into several cards
    if (text.trim().startsWith('>') && (text.match(/^>/gm)?.length ?? 0) > 1) {
      const recs = parseSequences(text);
      st.records.splice(i, 1, ...recs);
      toast(t('{0}개 서열로 나눠서 추가했습니다.', recs.length));
      cb.recordsChanged({ structural: true });
      return;
    }
    const parsed = parseSequences(text, r.name);
    if (parsed.length === 1 && text.trim().startsWith('>')) {
      r.name = parsed[0].name;
      r.seq = parsed[0].seq;
      cb.recordsChanged({ structural: true });
      return;
    }
    r.seq = cleanSequence(text);
    area.value = r.seq;
    cb.recordsChanged();
  });
  const move = (d: number) => {
    const j = i + d;
    if (j < 0 || j >= st.records.length) return;
    const refRec = st.records[st.align.referenceIndex];
    [st.records[i], st.records[j]] = [st.records[j], st.records[i]];
    if (refRec) st.align.referenceIndex = st.records.indexOf(refRec);
    cb.recordsChanged({ structural: true });
  };
  return h(
    'div',
    { class: `seq-card${isRef ? ' is-ref' : ''}` },
    h(
      'div',
      { class: 'seq-card-head' },
      h('span', { class: 'seq-idx' }, String(i + 1)),
      nameIn,
      refStrategy
        ? h(
            'label',
            { class: `ref-toggle${isRef ? ' on' : ''}`, title: t('레퍼런스(기준 서열)로 지정') },
            h('input', {
              type: 'radio',
              name: 'refseq',
              checked: isRef,
              onchange: () => {
                st.align.referenceIndex = i;
                st.view.compareRow = i;
                st.view.compareTo = 'row';
                cb.recordsChanged({ structural: true });
              },
            }),
            isRef ? t('레퍼런스') : t('기준으로'),
          )
        : null,
      nucleotideCard ? ab1Button(r, cb) : null,
      h('button', { class: 'icon-btn', title: t('위로'), onclick: () => move(-1), disabled: i === 0 }, '↑'),
      h('button', { class: 'icon-btn', title: t('아래로'), onclick: () => move(1), disabled: i === st.records.length - 1 }, '↓'),
      h(
        'button',
        {
          class: 'icon-btn danger',
          title: t('삭제'),
          onclick: () => {
            const refRec = st.records[st.align.referenceIndex];
            st.records.splice(i, 1);
            detachTrace(r.id);
            st.align.referenceIndex = Math.max(0, refRec ? st.records.indexOf(refRec) : 0);
            cb.recordsChanged({ structural: true });
          },
        },
        '✕',
      ),
    ),
    area,
    h('div', { class: 'seq-foot' }, meta, type && type !== 'Protein' && setIsNucleotide(st) ? strandControl(st, r, refStrategy ? isRef : i === 0, cb) : null),
    nucleotideCard ? traceChip(st, r, cb) : null,
  );
}

function setIsNucleotide(st: AppState): boolean {
  if (st.align.seqType !== 'auto') return st.align.seqType !== 'protein';
  const seqs = st.records.filter((x) => x.seq).map((x) => x.seq);
  return seqs.length === 0 || detectSetType(seqs) !== 'protein';
}

/** Segmented control: align this sequence as entered, as its reverse complement, or decide automatically. */
function strandControl(st: AppState, r: SeqRecord, isRef: boolean, cb: InputCallbacks): HTMLElement {
  const mode: StrandMode = r.strand ?? 'auto';
  // The reference is the anchor, so "auto" means "as entered" for it.
  const options: { value: StrandMode; label: string; title: string }[] = [
    ...(isRef ? [] : [{ value: 'auto' as const, label: t('자동'), title: t('정방향과 역상보 중 레퍼런스에 더 잘 맞는 쪽을 자동으로 고릅니다.') }]),
    { value: 'forward', label: t('정방향 →'), title: t('입력한 방향 그대로 정렬합니다.') },
    { value: 'reverse', label: t('역상보 ←'), title: t('역상보(reverse complement)로 뒤집어서 정렬합니다.') },
  ];
  const active: StrandMode = isRef && mode === 'auto' ? 'forward' : mode;
  const group = h(
    'div',
    { class: 'strand-seg', role: 'group', 'aria-label': t('{0} 가닥 선택', r.name) },
    ...options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: o.value === active ? 'on' : '',
          'aria-pressed': o.value === active ? 'true' : 'false',
          title: o.title,
          onclick: () => {
            if (r.strand === o.value) return;
            r.strand = o.value;
            cb.recordsChanged({ structural: true });
          },
        },
        o.label,
      ),
    ),
  );
  // show what "auto" decided in the latest alignment
  const row = mode === 'auto' && !isRef ? st.alignment?.rows.find((x) => x.id === r.id) : undefined;
  const decided = row ? h('span', { class: `strand-result${row.strand === -1 ? ' rev' : ''}`, title: t('마지막 정렬에서 자동으로 고른 방향') }, row.strand === -1 ? t('→ 역상보로 판단') : t('→ 정방향으로 판단')) : null;
  return h('div', { class: 'strand-wrap' }, group, decided);
}

async function addFiles(st: AppState, files: File[], cb: InputCallbacks): Promise<void> {
  let added = 0;
  for (const f of files) {
    try {
      if (isAb1(f)) {
        const trc = await readAb1(f);
        const rec: SeqRecord = { id: newId(), name: trc.chrom.sampleName || f.name.replace(/\.[^.]+$/, ''), seq: trc.chrom.bases };
        st.records.push(rec);
        if (!attachTrace(rec.id, trc)) toast(t('저장 공간이 부족해 AB1 은 새로고침하면 다시 올려야 합니다.'), 'error');
        added++;
        continue;
      }
      const text = await f.text();
      const recs = parseSequences(text, f.name.replace(/\.[^.]+$/, ''));
      if (!recs.length) toast(t('{0}: 서열을 찾지 못했습니다.', f.name), 'error');
      st.records.push(...recs);
      added += recs.length;
    } catch (e) {
      toast(t('{0}: 읽기 실패 ({1})', f.name, errorText(e)), 'error');
    }
  }
  if (added) {
    toast(t('{0}개 서열을 추가했습니다.', added));
    cb.recordsChanged({ structural: true });
  }
}

function addText(st: AppState, text: string, cb: InputCallbacks): number {
  const recs = parseSequences(text, `Sequence ${st.records.length + 1}`);
  if (!recs.length) {
    toast(t('서열을 찾지 못했습니다.'), 'error');
    return 0;
  }
  st.records.push(...recs);
  cb.recordsChanged({ structural: true });
  toast(t('{0}개 서열을 추가했습니다.', recs.length));
  return recs.length;
}

function openPasteDialog(st: AppState, cb: InputCallbacks): void {
  const area = h('textarea', { rows: 14, spellcheck: 'false', placeholder: t('>seq1\nATGC...\n>seq2\nATGG...\n\nFASTA, GenBank, EMBL, 또는 서열 한 개') }) as HTMLTextAreaElement;
  const dlg = h(
    'dialog',
    { class: 'paste-dialog' },
    h('h3', null, t('서열 붙여넣기')),
    area,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { class: 'btn ghost', onclick: () => dlg.close() }, t('취소')),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            if (addText(st, area.value, cb)) dlg.close();
          },
        },
        t('추가'),
      ),
    ),
  ) as HTMLDialogElement;
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  area.focus();
}

function isAb1(f: File): boolean {
  return /\.(ab1|abi|ab)$/i.test(f.name);
}

const WAVE_ICON =
  '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 12 C3 12 3 3 5 3 S7 12 8 12 9 6 10.5 6 12 12 13 12 14 9 15 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** Card-head button: attach (or replace) an AB1 chromatogram for this sequence. */
function ab1Button(r: SeqRecord, cb: InputCallbacks): HTMLElement {
  const input = h('input', { type: 'file', accept: '.ab1,.abi,.ab', hidden: true }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const trc = await readAb1(f);
      if (!r.seq) r.seq = trc.chrom.bases; // empty card: take the base calls as the sequence
      if (!attachTrace(r.id, trc)) toast(t('저장 공간이 부족해 AB1 은 새로고침하면 다시 올려야 합니다.'), 'error');
      const linked = traceFor(r.id, r.seq);
      if (linked && linked.link.identity < 0.8)
        toast(t('"{0}" 서열과 AB1 염기 호출이 {1}% 만 맞습니다. 같은 샘플의 파일인지 확인하세요.', r.name, Math.round(linked.link.identity * 100)), 'error');
      else toast(t('{0} 을(를) "{1}" 에 연결했습니다.', f.name, r.name));
      cb.recordsChanged({ structural: true });
    } catch (e) {
      toast(`${f.name}: ${errorText(e)}`, 'error');
    }
  });
  const has = !!getTrace(r.id);
  const btn = h('button', { type: 'button', class: `icon-btn ab1-btn${has ? ' on' : ''}`, title: has ? t('AB1 크로마토그램 바꾸기') : t('AB1 크로마토그램 파일 붙이기 (선택)'), 'aria-label': t('AB1 파일 붙이기'), onclick: () => input.click() });
  btn.innerHTML = WAVE_ICON;
  return h('span', { class: 'ab1-wrap' }, btn, input);
}

/** Card-foot chip describing the attached chromatogram. */
function traceChip(st: AppState, r: SeqRecord, cb: InputCallbacks): HTMLElement | null {
  const trc = traceFor(r.id, r.seq);
  if (!trc) return null;
  const qs = qualitySummary(trc.chrom, st.view.qualityThreshold);
  const ok = trc.link.identity >= 0.8;
  const chip = h(
    'div',
    { class: `trace-chip${ok ? '' : ' warn'}`, title: t('{0}\n염기 호출 {1}개 · 서열과 {2}% 일치{3}', trc.fileName, trc.chrom.bases.length, Math.round(trc.link.identity * 100), trc.link.rc ? t(' (역상보)') : '') },
    h('span', { class: 'tc-icon', html: WAVE_ICON }),
    h('span', { class: 'tc-name' }, trc.fileName),
    h('span', { class: 'tc-meta' }, qs.mean === null ? t('품질값 없음') : t('평균 QV {0} · QV<{1} {2}개', qs.mean.toFixed(0), st.view.qualityThreshold, qs.low)),
    ok ? null : h('span', { class: 'tc-warn' }, t('서열과 {0}% 일치', Math.round(trc.link.identity * 100))),
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn danger',
        title: t('AB1 연결 해제'),
        'aria-label': t('AB1 연결 해제'),
        onclick: () => {
          detachTrace(r.id);
          cb.recordsChanged({ structural: true });
        },
      },
      '✕',
    ),
  );
  return chip;
}
