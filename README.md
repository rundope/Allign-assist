<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/spoonbills-dark.png">
    <img src="docs/images/spoonbills.png" alt="Spoonbills" width="88">
  </picture>
</p>

# Allign-assist

[한국어](#한국어) · [English](#english)

## 한국어

DNA·RNA·단백질 서열 정렬을 **읽기 쉽게** 보여주는 뷰어입니다. Serial Cloner·UniProt Align을 참고했고,
가독성과 사용자 조절 범위를 넓히는 데 초점을 맞췄습니다.

- 내 서열이 레퍼런스의 **어디에, 얼마나** 맞는지 확인합니다 (Fit 모드, 역상보 자동 판단).
- 비슷한 서열 2~N개가 **어디가 같고 어디가 다른지** 색으로 표시합니다 (pairwise, reference-anchored, progressive MSA).
- 일치도를 **물성 기준**으로도 보여줍니다. 단백질은 Clustal 그룹·Lehninger 5계열·전하·소수성을, DNA는 purine/pyrimidine·strong/weak·amino/keto·Ts/Tv를 기준으로 합니다.

**바로 사용하기:** https://rundope.github.io/Allign-assist/

**사용 설명서:** [한국어](docs/manual.ko.md) · [English](docs/manual.en.md)

화면 오른쪽 위의 `한국어 | English` 버튼으로 UI 언어를 바꿀 수 있습니다. 처음 열 때는 브라우저 언어를 따르고, 고른 언어는 브라우저에 저장됩니다.

### 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # dist/index.html — JS·CSS·Worker가 모두 들어 있는 단일 파일
npm test         # 단위 테스트 + Biopython 교차검증
```

설명서의 스크린샷(`docs/images/`)은 UI가 바뀌면 다시 찍습니다.

```bash
npm run build && npm i --no-save playwright && npx playwright install chromium && node scripts/screenshots.mjs
```

`main`에 푸시하면 `.github/workflows/pages.yml`이 테스트와 빌드를 돌린 뒤 GitHub Pages에 배포합니다.

`dist/index.html`은 서버 없이 더블클릭만으로 열리고 오프라인에서도 동작합니다. 서열은 브라우저 밖으로 전송되지 않습니다.

### 기능 구성

| 영역 | 내용 |
|---|---|
| 입력 | 서열 카드 편집, FASTA / GenBank / EMBL / 일반 텍스트, 파일 끌어놓기, 여러 레코드 FASTA 한 번에 붙여넣기, 합성 예제 4종 |
| 정렬 알고리즘 | Gotoh affine gap DP로 4개 모드를 지원합니다: Global (Needleman-Wunsch), Semi-global (말단 gap 무료), Fit (레퍼런스 안 위치 찾기), Local (Smith-Waterman) |
| 다중 정렬 | Reference-anchored는 각 서열을 레퍼런스에 정렬한 뒤 레퍼런스 좌표로 합칩니다. Progressive MSA는 UPGMA guide tree를 따라 profile-profile로 정렬합니다 |
| 점수 | BLOSUM45/62/80, PAM250, NUC.4.4 (EDNAFULL, IUPAC), match/mismatch 직접 지정. gap open/extend를 조절할 수 있습니다 |
| 레이아웃 | 한 줄 잔기 수(0이면 창 너비에 맞춤), 세로줄(열) 간격, 가로줄(행) 간격, 블록 간격, 10잔기 묶음, 글꼴·크기·굵기 |
| 색상 | 강조 방식 4종(일치/유사/불일치/indel/gap, 열 보존도 음영, 잔기 물성 scheme 6종, 없음). 범주별 배경·글자색 지정, 프리셋 4종, 비교 대상(임의 서열 또는 consensus) |
| 표시 | 눈금자(레퍼런스 좌표 또는 열 번호), 시작/끝 번호, consensus 행, 보존 기호 `* : .`, 열별 % identity 막대, 점(.) 표기, 말단 gap 숨김, 겹침 구간만 보기 |
| 탐색 | 전체 overview 맵(클릭하면 해당 위치로 이동), 마우스를 올리면 잔기·위치·물성·열 통계를 보여주는 툴팁 |
| AB1 크로마토그램 | DNA 서열 카드의 파형 아이콘으로 ABIF(.ab1) 파일을 붙이거나, '파일 열기'로 .ab1 을 바로 올리면 염기 호출이 새 서열이 됩니다. 정렬 보기에서 잔기에 마우스를 올리면 그 염기 주변의 4채널 신호 곡선, 호출 염기, Phred 품질(QV)이 나옵니다. 서열이 잘렸거나 고쳐졌거나 역상보여도 염기 호출과 정렬해서 위치를 맞춥니다. 품질이 기준(기본 QV 20)보다 낮은 염기 아래에는 주황 점선을 긋습니다. 크로마토그램은 정렬 줄 바로 위에도 그려져, 각 peak 이 아래 글자와 같은 열에 옵니다 |
| 통계 | Identity / Similarity / Gaps / Coverage / 매칭 위치 / Score, 물성 기준 일치도, 서열별 요약표, identity matrix |
| 내보내기 | SVG (벡터), PNG (2×), 정렬 FASTA, Clustal `.aln`, 통계 CSV |

### 구조

```
src/core/      정렬·통계 엔진 (DOM 의존성 없음, Web Worker에서 실행)
  pairwise.ts    Gotoh DP (4 모드), 1 byte/cell traceback
  msa.ts         reference-anchored merge, UPGMA, profile alignment
  stats.ts       pair / column / identity-matrix 통계
  properties.ts  아미노산·염기 물성 분류
  matrices.ts    NCBI 행렬 (matrices.generated.ts는 scripts/gen-matrices.mjs가 생성)
src/render/    RenderModel(셀 분류·스타일) → SVG 블록, overview canvas, lazy viewer
src/ui/        입력·설정·통계 패널, 내보내기, 상태 저장(localStorage)
src/worker/    정렬 Web Worker와 client (Worker를 쓸 수 없으면 메인 스레드에서 실행)
src/i18n.ts    언어 전환. 한국어 원문이 key이고 영어 번역은 src/i18n.en.ts에 있습니다
```

UI 문자열은 `t('한국어 원문 {0}', 값)` 형태로 씁니다. `tests/i18n.test.ts`는 모든 한국어 문자열에 영어 번역이 있는지, placeholder가 맞는지, 쓰이지 않는 번역이 남아 있지 않은지 검사합니다.

### 정확성 검증

- `tests/crosscheck.test.ts`: 무작위 서열 200쌍(DNA/단백질 × 4 모드 × gap 설정)의 점수를 **Biopython 1.88 `PairwiseAligner`** 결과와 비교합니다. 또 traceback 경로를 독립적으로 재채점해서 보고된 점수와 같은지 확인합니다.
- `tests/abif.test.ts`: AB1 파서가 Biopython 테스트 파일(3100.ab1, 3730.ab1)에서 Biopython 과 같은 염기 호출, 품질값, peak 위치, 4채널 신호를 읽는지 확인합니다.
- 치환 행렬은 NCBI 원본 파일(`vendor/matrices`, Biopython 배포본)에서 생성합니다. 생성할 때 대칭성도 검사합니다.

### 지표 정의

- **겹침 구간**: 두 서열이 모두 잔기를 가진 첫 열부터 마지막 열까지입니다. 말단 overhang은 빠지고 내부 gap은 포함됩니다.
- **Identity** = 동일 잔기 수 / 겹침 구간 열 수. 정렬쌍 기준 값과 EMBOSS 기준(전체 정렬 길이) 값은 툴팁과 CSV에 함께 나옵니다.
- **Similarity** (단백질) = 치환 행렬 점수가 0보다 큰 쌍(동일 포함) / 겹침 구간 열 수. EMBOSS와 같은 기준입니다.
- DNA에서 **유사**는 transition(A↔G, C↔T)을 뜻합니다. U와 T는 같은 염기로 취급합니다.

### 한계

- DP 메모리는 셀당 1 byte이고 최대 1.5억 셀까지 계산합니다(예: 10 kb × 15 kb). 이보다 긴 게놈 규모 서열은 아직 지원하지 않습니다.
- Progressive MSA는 반복 정제(iterative refinement) 없이 한 번만 정렬합니다. 서열이 수십 개 이상이거나 먼 관계면 Clustal Omega / MAFFT보다 정확도가 낮을 수 있습니다.
- 예제 서열은 모두 **합성 데이터**이며 실제 유전자·단백질이 아닙니다.

### 라이선스

[MIT License](LICENSE). 단, Spoonbills 로고(`src/assets/`, `docs/images/spoonbills*.png`)는 MIT 라이선스 대상이 아니며 Spoonbills 에 권리가 있습니다. 함께 배포하는 제3자 자료(NCBI 치환 행렬, Biopython 테스트용 AB1 파일)의 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 있습니다.

## English

A viewer that makes DNA, RNA and protein sequence alignments **easy to read**. It takes Serial Cloner and
UniProt Align as references and puts readability and user control first.

- See **where and how well** your sequence matches a reference (Fit mode, automatic strand detection).
- Colour **where 2–N similar sequences agree and differ** (pairwise, reference-anchored, progressive MSA).
- Measure agreement **by residue properties** as well: Clustal groups, Lehninger's five classes, charge and hydropathy for proteins; purine/pyrimidine, strong/weak, amino/keto and Ts/Tv for DNA.

**Use it now:** https://rundope.github.io/Allign-assist/

**User manual:** [English](docs/manual.en.md) · [한국어](docs/manual.ko.md)

Switch the interface language with the `한국어 | English` buttons at the top right. The first visit follows the browser language, and your choice is remembered in the browser.

### Running

```bash
npm install
npm run dev      # dev server
npm run build    # dist/index.html — one file with all JS, CSS and the Worker inlined
npm test         # unit tests + Biopython cross-checks
```

Retake the manual screenshots (`docs/images/`) when the UI changes:

```bash
npm run build && npm i --no-save playwright && npx playwright install chromium && node scripts/screenshots.mjs
```

Pushing to `main` runs `.github/workflows/pages.yml`, which tests, builds and deploys to GitHub Pages.

`dist/index.html` opens by double-clicking, without a server, and works offline. Sequences never leave the browser.

### Features

| Area | What it does |
|---|---|
| Input | Editable sequence cards; FASTA / GenBank / EMBL / plain text; drag and drop; paste a multi-record FASTA at once; four synthetic examples |
| Alignment | Gotoh affine-gap DP in four modes: Global (Needleman-Wunsch), Semi-global (free end gaps), Fit (place a sequence inside the reference), Local (Smith-Waterman) |
| Multiple sequences | Reference-anchored aligns each sequence to the reference and merges them on reference coordinates. Progressive MSA aligns profile to profile along a UPGMA guide tree |
| Scoring | BLOSUM45/62/80, PAM250, NUC.4.4 (EDNAFULL, IUPAC), or your own match/mismatch; adjustable gap open/extend |
| Layout | Residues per line (0 fits the window), column spacing, row spacing, block spacing, groups of 10, font, size and weight |
| Colours | Four highlighting modes (identical/similar/mismatch/indel/gap, column conservation shading, six residue property schemes, none). Background and text colour per category, four presets, and a choice of comparison target (any sequence or the consensus) |
| Display | Ruler (reference coordinates or column numbers), start/end numbers, consensus row, conservation marks `* : .`, per-column % identity bars, dots for identical residues, hidden end gaps, overlap-only view |
| Navigation | Overview map (click to jump), and a tooltip with residue, position, properties and column statistics |
| AB1 chromatograms | Attach an ABIF (.ab1) file with the waveform icon on a DNA card, or open an .ab1 file directly to turn its base calls into a new sequence. The trace is drawn right above the alignment row, each peak in the column of its letter, and hovering a residue shows the four-channel trace, base calls and Phred quality (QV) around it. Trimmed, edited or reverse-complemented sequences are matched to the base calls. Bases below the quality threshold (QV 20 by default) get an orange dotted underline |
| Statistics | Identity / Similarity / Gaps / Coverage / match position / Score, property-based agreement, a per-sequence table, identity matrix |
| Export | SVG (vector), PNG (2×), aligned FASTA, Clustal `.aln`, statistics CSV |

### Layout of the code

```
src/core/      alignment and statistics engine (no DOM; runs in a Web Worker)
  pairwise.ts    Gotoh DP (4 modes), 1 byte/cell traceback
  msa.ts         reference-anchored merge, UPGMA, profile alignment
  stats.ts       pair / column / identity-matrix statistics
  properties.ts  amino-acid and nucleotide property classes
  matrices.ts    NCBI matrices (matrices.generated.ts is written by scripts/gen-matrices.mjs)
src/render/    RenderModel (cell classes and styles) → SVG blocks, overview canvas, lazy viewer
src/ui/        input, settings and statistics panels, export, saved state (localStorage)
src/worker/    alignment Web Worker and its client (falls back to the main thread without Workers)
src/i18n.ts    language switch. Korean source strings are the keys; English lives in src/i18n.en.ts
```

UI strings are written as `t('한국어 원문 {0}', value)`. `tests/i18n.test.ts` checks that every Korean string has an English translation, that placeholders match, and that no unused translations are left.

### Verification

- `tests/crosscheck.test.ts` compares scores for 200 random pairs (DNA/protein × 4 modes × gap settings) with **Biopython 1.88 `PairwiseAligner`**, and independently re-scores each traceback to confirm it matches the reported score.
- `tests/abif.test.ts` checks that the AB1 parser reads the same base calls, quality values, peak positions and four-channel traces as Biopython from its test files (3100.ab1, 3730.ab1).
- Substitution matrices are generated from the original NCBI files (`vendor/matrices`, as shipped with Biopython) and checked for symmetry.

### Definitions

- **Overlap**: from the first to the last column where both sequences have a residue. End overhangs are excluded; internal gaps are included.
- **Identity** = identical residues / overlap columns. The per-aligned-pair value and the EMBOSS value (whole alignment length) also appear in the tooltip and the CSV.
- **Similarity** (protein) = pairs with a positive substitution score (identical included) / overlap columns, as in EMBOSS.
- For DNA, **similar** means a transition (A↔G, C↔T). U and T count as the same base.

### Limitations

- The DP uses 1 byte per cell and computes up to 150 million cells (e.g. 10 kb × 15 kb). Genome-scale sequences are not supported yet.
- Progressive MSA aligns once, without iterative refinement. With dozens of sequences or distant relatives it can be less accurate than Clustal Omega or MAFFT.
- All example sequences are **synthetic** and are not real genes or proteins.

### License

[MIT License](LICENSE). The Spoonbills logo (`src/assets/`, `docs/images/spoonbills*.png`) is not covered by the MIT License; all rights to it stay with Spoonbills. Sources and licenses of bundled third-party material (NCBI substitution matrices, Biopython AB1 test files) are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
