# API 24 annotation backend gate

## Outcome

**PASS.** The production compiler artifact is now `ohos-typescript@4.9.5-r10`.
For an SDK whose `ets/oh-uni-package.json` reports API 24 or newer, the semantic
host enables the compiler's official `etsAnnotationsEnable` option. No source
rewrite or diagnostic suppression is involved.

The gate parses these declarations from the selected OpenHarmony 6.1.1.125 SDK:

| Declaration | Syntax diagnostics | Annotation declarations |
|---|---:|---:|
| `ets/api/@ohos.annotation.d.ets` | 0 | 2 |
| `ets/arkts/@arkts.lang.d.ets` | 0 | 1 |

The source-revision compiler and the actual production npm artifact both run the
same SDK smoke. Either result failing makes the official-backend spike fail. The
existing backend-independent corpus remains 34 passed, 0 failed, 0 deferred.

## Production artifact identity

- Package: `npm:ohos-typescript@4.9.5-r10`.
- npm integrity:
  `sha512-UyLXhBnUe5H4HGugf1ocYPawod0Q4ituiUATYoHIR5y4uxnH4+8ddD39aeLgcQah1YMv2DRKRaL9W1jgtnbEtQ==`.
- Compiler JS SHA-256:
  `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc`.
- Source reference revision:
  `9cc62fe98f47c0bf113676e3fb33fe932b493052`.
- SDK declaration digest:
  `8098b8abbc6b06fce0e7322d6f8f82a5bbce41e847dbd39e9a98811a33d4c6e4`.

The npm artifact and source checkout use separate identities because the earlier
`r4` npm artifact was demonstrably not byte/API equivalent to the locked source
checkout. The package-manager integrity and compiler JS digest are the production
artifact authority.

## Real-project regression replay

Gramony revision `0a1ee4b026b6736671f0030ba9859aceaa962298`
was replayed through the real stdio Language Server. The request was explicitly
`textDocument/references` for `DateHelper` at zero-based UTF-16 `0:16`, using
`indexed-batched` and the unchanged eight-location oracle.

| SDK profile | Request | Product peak RSS | Program project / SDK | Result | Diagnostics |
|---|---:|---:|---:|---:|---:|
| common | 2.552 s | 389,828,608 B | 32 / 226 | 8/8 exact | 10 |
| full | 3.125 s | 433,258,496 B | 32 / 355 | 8/8 exact | 10 |

Both runs produced the same normalized reference hash and diagnostic hash. Normal
automatic diagnostics remained enabled. The first sandboxed attempt was rejected
because the external RSS sampler could not inspect child processes; it is not
counted as a semantic run.

Machine-readable summary:
[`evidence/2026-09-14-api24-annotation-backend-gate.json`](evidence/2026-09-14-api24-annotation-backend-gate.json).
