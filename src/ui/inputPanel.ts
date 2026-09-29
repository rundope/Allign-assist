// Sequence input: cards per sequence, file loading, bulk FASTA paste and demo data.
import { cleanSequence, detectType, newId, parseSequences, type SeqRecord } from '../core/seq';
import { EXAMPLES } from './examples';
import { h, toast } from './dom';
import type { AppState } from './state';

export interface InputCallbacks {
  recordsChanged: (opts?: { structural?: boolean }) => void;
  loadExample: (key: string) => void;
}

const TYPE_LABEL = { dna: 'DNA', rna: 'RNA', protein: 'Protein' } as const;

export function buildInputPanel(host: HTMLElement, st: AppState, cb: InputCallbacks): void {
  const fileInput = h('input', { type: 'file', multiple: true, accept: '.fa,.fasta,.fas,.fna,.faa,.ffn,.txt,.seq,.gb,.gbk,.genbank,.embl,.aln', hidden: true }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    await addFiles(st, [...(fileInput.files ?? [])], cb);
    fileInput.value = '';
  });

  const examples = h(
    'select',
    { class: 'btn-select', 'aria-label': '예제 불러오기' },
    h('option', { value: '' }, '예제 ▾'),
    ...EXAMPLES.map((e) => h('option', { value: e.key, title: e.description }, e.label)),
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
      '+ 서열',
    ),
    h('button', { class: 'btn small', onclick: () => fileInput.click() }, '파일 열기'),
    h('button', { class: 'btn small', onclick: () => openPasteDialog(st, cb) }, 'FASTA 붙여넣기'),
    examples,
    st.records.length
      ? h(
          'button',
          {
            class: 'btn small ghost danger',
            onclick: () => {
              if (!confirm('모든 서열을 지울까요?')) return;
              st.records.length = 0;
              cb.recordsChanged({ structural: true });
            },
          },
          '전체 삭제',
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
        h('b', null, '서열을 추가하세요'),
        h('div', null, 'FASTA · GenBank · EMBL · 일반 텍스트 파일을 이 영역에 끌어다 놓거나, 위의 버튼을 사용하세요.'),
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
  const nameIn = h('input', { class: 'seq-name', value: r.name, 'aria-label': '서열 이름' }) as HTMLInputElement;
  nameIn.addEventListener('change', () => {
    r.name = nameIn.value.trim() || `Sequence ${i + 1}`;
    cb.recordsChanged();
  });
  const area = h('textarea', { rows: 3, spellcheck: 'false', placeholder: '서열 붙여넣기 (공백·숫자는 자동 제거, FASTA 여러 개도 가능)' }, r.seq) as HTMLTextAreaElement;
  const meta = h('span', { class: 'seq-meta' }, len ? `${len.toLocaleString()} ${type === 'Protein' ? 'aa' : 'nt'} · ${type}` : '비어 있음');
  area.addEventListener('input', () => {
    const cleaned = cleanSequence(area.value);
    meta.textContent = cleaned.length ? `${cleaned.length.toLocaleString()} · ${TYPE_LABEL[detectType(cleaned)]}` : '비어 있음';
  });
  area.addEventListener('change', () => {
    const text = area.value;
    // pasting a multi-record FASTA into one card splits it into several cards
    if (text.trim().startsWith('>') && (text.match(/^>/gm)?.length ?? 0) > 1) {
      const recs = parseSequences(text);
      st.records.splice(i, 1, ...recs);
      toast(`${recs.length}개 서열로 나눠서 추가했습니다.`);
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
            { class: `ref-toggle${isRef ? ' on' : ''}`, title: '레퍼런스(기준 서열)로 지정' },
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
            isRef ? '레퍼런스' : '기준으로',
          )
        : null,
      h('button', { class: 'icon-btn', title: '위로', onclick: () => move(-1), disabled: i === 0 }, '↑'),
      h('button', { class: 'icon-btn', title: '아래로', onclick: () => move(1), disabled: i === st.records.length - 1 }, '↓'),
      h(
        'button',
        {
          class: 'icon-btn danger',
          title: '삭제',
          onclick: () => {
            const refRec = st.records[st.align.referenceIndex];
            st.records.splice(i, 1);
            st.align.referenceIndex = Math.max(0, refRec ? st.records.indexOf(refRec) : 0);
            cb.recordsChanged({ structural: true });
          },
        },
        '✕',
      ),
    ),
    area,
    meta,
  );
}

async function addFiles(st: AppState, files: File[], cb: InputCallbacks): Promise<void> {
  let added = 0;
  for (const f of files) {
    try {
      const text = await f.text();
      const recs = parseSequences(text, f.name.replace(/\.[^.]+$/, ''));
      if (!recs.length) toast(`${f.name}: 서열을 찾지 못했습니다.`, 'error');
      st.records.push(...recs);
      added += recs.length;
    } catch (e) {
      toast(`${f.name}: 읽기 실패 (${(e as Error).message})`, 'error');
    }
  }
  if (added) {
    toast(`${added}개 서열을 추가했습니다.`);
    cb.recordsChanged({ structural: true });
  }
}

function addText(st: AppState, text: string, cb: InputCallbacks): number {
  const recs = parseSequences(text, `Sequence ${st.records.length + 1}`);
  if (!recs.length) {
    toast('서열을 찾지 못했습니다.', 'error');
    return 0;
  }
  st.records.push(...recs);
  cb.recordsChanged({ structural: true });
  toast(`${recs.length}개 서열을 추가했습니다.`);
  return recs.length;
}

function openPasteDialog(st: AppState, cb: InputCallbacks): void {
  const area = h('textarea', { rows: 14, spellcheck: 'false', placeholder: '>seq1\nATGC...\n>seq2\nATGG...\n\nFASTA, GenBank, EMBL, 또는 서열 한 개' }) as HTMLTextAreaElement;
  const dlg = h(
    'dialog',
    { class: 'paste-dialog' },
    h('h3', null, '서열 붙여넣기'),
    area,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { class: 'btn ghost', onclick: () => dlg.close() }, '취소'),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            if (addText(st, area.value, cb)) dlg.close();
          },
        },
        '추가',
      ),
    ),
  ) as HTMLDialogElement;
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  area.focus();
}
