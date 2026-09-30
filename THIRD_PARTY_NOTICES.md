# Third-party material

Allign-assist's own code is under the MIT License (see `LICENSE`). The repository also
contains the following material from other sources, under their own terms.

| Path | What | Source | Terms |
|---|---|---|---|
| `vendor/matrices/` (BLOSUM45/62/80, PAM250, NUC.4.4) and the generated `src/core/matrices.generated.ts` | Substitution matrices | NCBI BLAST matrices, as redistributed in Biopython 1.88 (`Bio/Align/substitution_matrices/data`) | Biopython License Agreement — `vendor/matrices/LICENSE-Biopython.rst` |
| `tests/fixtures/abi/*.ab1` | Test chromatograms (used only by the test suite) | Biopython 1.88 `Tests/Abi/` | Biopython License Agreement — `tests/fixtures/abi/LICENSE-Biopython.rst` |
| `tests/fixtures/biopython-pairwise.json`, `tests/fixtures/abi/expected.json` | Reference results computed with Biopython 1.88 | generated for this project | — |

Runtime dependencies bundled into the built page: none (the app has no runtime npm
dependencies). Build-time tools (Vite, TypeScript, Vitest, vite-plugin-singlefile) are
under their own licenses and are not part of the published page.
