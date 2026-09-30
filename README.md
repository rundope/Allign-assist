# Align Assist

DNA·RNA·단백질 서열 정렬을 **읽기 쉽게** 보여주는 뷰어입니다. Serial Cloner·UniProt Align을 참고했고,
가독성과 사용자 조절 범위를 넓히는 데 초점을 맞췄습니다.

- 내 서열이 레퍼런스의 **어디에, 얼마나** 맞는지 확인합니다 (Fit 모드, 역상보 자동 판단).
- 비슷한 서열 2~N개가 **어디가 같고 어디가 다른지** 색으로 표시합니다 (pairwise, reference-anchored, progressive MSA).
- 일치도를 **물성 기준**으로도 보여줍니다. 단백질은 Clustal 그룹·Lehninger 5계열·전하·소수성을, DNA는 purine/pyrimidine·strong/weak·amino/keto·Ts/Tv를 기준으로 합니다.

**바로 사용하기:** https://rundope.github.io/Allign-assist/

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # dist/index.html — JS·CSS·Worker가 모두 들어 있는 단일 파일
npm test         # 단위 테스트 + Biopython 교차검증
```

`main`에 푸시하면 `.github/workflows/pages.yml`이 테스트와 빌드를 돌린 뒤 GitHub Pages에 배포합니다.

`dist/index.html`은 서버 없이 더블클릭만으로 열리고 오프라인에서도 동작합니다. 서열은 브라우저 밖으로 전송되지 않습니다.

## 기능 구성

| 영역 | 내용 |
|---|---|
| 입력 | 서열 카드 편집, FASTA / GenBank / EMBL / 일반 텍스트, 파일 끌어놓기, 여러 레코드 FASTA 한 번에 붙여넣기, 합성 예제 3종 |
| 정렬 알고리즘 | Gotoh affine gap DP로 4개 모드를 지원합니다: Global (Needleman-Wunsch), Semi-global (말단 gap 무료), Fit (레퍼런스 안 위치 찾기), Local (Smith-Waterman) |
| 다중 정렬 | Reference-anchored는 각 서열을 레퍼런스에 정렬한 뒤 레퍼런스 좌표로 합칩니다. Progressive MSA는 UPGMA guide tree를 따라 profile-profile로 정렬합니다 |
| 점수 | BLOSUM45/62/80, PAM250, NUC.4.4 (EDNAFULL, IUPAC), match/mismatch 직접 지정. gap open/extend를 조절할 수 있습니다 |
| 레이아웃 | 한 줄 잔기 수(0이면 창 너비에 맞춤), 세로줄(열) 간격, 가로줄(행) 간격, 블록 간격, 10잔기 묶음, 글꼴·크기·굵기 |
| 색상 | 강조 방식 4종(일치/유사/불일치/indel/gap, 열 보존도 음영, 잔기 물성 scheme 6종, 없음). 범주별 배경·글자색 지정, 프리셋 4종, 비교 대상(임의 서열 또는 consensus) |
| 표시 | 눈금자(레퍼런스 좌표 또는 열 번호), 시작/끝 번호, consensus 행, 보존 기호 `* : .`, 열별 % identity 막대, 점(.) 표기, 말단 gap 숨김, 겹침 구간만 보기 |
| 탐색 | 전체 overview 맵(클릭하면 해당 위치로 이동), 마우스를 올리면 잔기·위치·물성·열 통계를 보여주는 툴팁 |
| 한눈에 보기 | 버튼 한 번(단축키 G)으로 전체 정렬을 한 화면에 요약합니다. 기준 서열 좌표의 구간 일치도 곡선, 서열별 트랙(치환 = 긴 막대, 유사 치환 = 짧은 막대, 삽입 = ▼, 결실 = 끊긴 구간), HGVS 방식으로 표기한 변이 목록(유형 필터, CSV 저장)이 있습니다. 어디를 클릭하든 상세 보기의 그 위치로 이동합니다 |
| 가닥 선택 | DNA·RNA 서열마다 자동 / 정방향 / 역상보를 고릅니다. 자동이면 마지막 정렬에서 판단한 방향을 카드에 표시합니다 |
| 통계 | Identity / Similarity / Gaps / Coverage / 매칭 위치 / Score, 물성 기준 일치도, 서열별 요약표, identity matrix |
| 내보내기 | SVG (벡터), PNG (2×), 정렬 FASTA, Clustal `.aln`, 통계 CSV |

## 구조

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
```

## 정확성 검증

- `tests/crosscheck.test.ts`: 무작위 서열 200쌍(DNA/단백질 × 4 모드 × gap 설정)의 점수를 **Biopython 1.88 `PairwiseAligner`** 결과와 비교합니다. 또 traceback 경로를 독립적으로 재채점해서 보고된 점수와 같은지 확인합니다.
- 치환 행렬은 NCBI 원본 파일(`vendor/matrices`, Biopython 배포본)에서 생성합니다. 생성할 때 대칭성도 검사합니다.

## 지표 정의

- **겹침 구간**: 두 서열이 모두 잔기를 가진 첫 열부터 마지막 열까지입니다. 말단 overhang은 빠지고 내부 gap은 포함됩니다.
- **Identity** = 동일 잔기 수 / 겹침 구간 열 수. 정렬쌍 기준 값과 EMBOSS 기준(전체 정렬 길이) 값은 툴팁과 CSV에 함께 나옵니다.
- **Similarity** (단백질) = 치환 행렬 점수가 0보다 큰 쌍(동일 포함) / 겹침 구간 열 수. EMBOSS와 같은 기준입니다.
- DNA에서 **유사**는 transition(A↔G, C↔T)을 뜻합니다. U와 T는 같은 염기로 취급합니다.

## 한계

- DP 메모리는 셀당 1 byte이고 최대 1.5억 셀까지 계산합니다(예: 10 kb × 15 kb). 이보다 긴 게놈 규모 서열은 아직 지원하지 않습니다.
- Progressive MSA는 반복 정제(iterative refinement) 없이 한 번만 정렬합니다. 서열이 수십 개 이상이거나 먼 관계면 Clustal Omega / MAFFT보다 정확도가 낮을 수 있습니다.
- 예제 서열은 모두 **합성 데이터**이며 실제 유전자·단백질이 아닙니다.
