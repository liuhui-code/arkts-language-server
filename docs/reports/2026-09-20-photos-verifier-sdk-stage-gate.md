# Photos verifier SDK stage gate and replay-cache cleanup

Date: 2026-09-20. Fixed server artifact SHA-256:
`9e3ba503ef6961cd6f98799938219557dddf3c0c0b240ab11e3485f68a666f28`;
sidecar SHA-256:
`8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`.
The control replays ran at `80e1fca`; the candidate replays ran after the
documentation-only merge `b6f40ef`. The server and sidecar binaries were
byte-identical, and no semantic runtime code changed. The third candidate
used the replay tool's temp-cache cleanup fix, which acts after sampling and
report writing.

## Fixed real-project comparison

- OpenHarmony `applications_photos` commit
  `98ea1d9cd6a363c576e2c6ff17844e51723baec5`, clean checkout at
  `/private/tmp/applications_photos-6.1-lts`.
- Installed DevEco OpenHarmony API 24 SDK, version `6.1.1.125`; Node
  `v26.3.0` on macOS.
- `imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`,
  imported `getMutuallyExclusiveDesc` at zero-based UTF-16 `351:19`.
- Three fresh-process pairs: `textDocument/references` first after `didOpen`,
  `includeDeclaration=true`, identity-bounded indexed batches, full
  *interactive* SDK and normal automatic diagnostics. Only the existing
  default-off *verifier* SDK profile changed from `full` to `common`.
- All three strict differentials passed: exactly three normalized Locations
  and 62 versioned automatic diagnostics in every replay.

| Run | Full verifier project+SDK files | Common verifier project+SDK files | Full request peak RSS | Common request peak RSS | Full product peak RSS | Common product peak RSS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 2+302 | 2+170 | 497,143,808 B | 434,876,416 B | 587,431,936 B | 589,512,704 B |
| 2 | 2+302 | 2+170 | 491,417,600 B | 437,514,240 B | 578,912,256 B | 588,972,032 B |
| 3 | 2+302 | 2+170 | 481,120,256 B | 433,131,520 B | 584,921,088 B | 587,943,936 B |
| Median | 2+302 | 2+170 | **491,417,600 B** | **434,876,416 B** | **584,921,088 B** | **588,972,032 B** |

The verifier-only SDK reduction lowered the *request-interval* peak by about
11.5% and its request median from 3.130 to 2.668 seconds. It did **not**
lower the product peak; the median increased by about 0.7%, within observed
run variation. The later normal-diagnostic Program remained 323 project + 503
SDK SourceFiles. Thus the fixed verifier SDK cost is real, but the interactive
semantic closure is a separate peak. The matched legacy median was
885,018,624 B, whose 50% threshold is 442,509,312 B. This one symbol's
common-verifier request interval is below that number, but the complete
product run is not.

`common` is **not** approved as a production default: exactness for this one
symbol does not prove verifier equivalence across ArkUI, member, alias,
re-export, open-overlay, and other SDK cases. The complete SDK provider and
dependency closure plus cross-capability differential remain required. The
original user-reported >3 GB reproducer is still unavailable.

## Replay-tool disk incident and fix

Each replay previously left its private SQLite index cache, logs, and RSS
samples under `arkts-references-replay-*`; this fixed Photos workspace made
each cache about 425 MiB. Ten replay directories generated during this
investigation consumed several GiB, and a third candidate report first failed
at write time with `ENOSPC`. That failed attempt is excluded from the table.
Only those ten identified, regenerable temporary directories were deleted;
saved JSON reports and the Photos checkout were retained. The replay tool now
removes its private directory after the report is written or any failure.
The public CLI regression was RED (one leftover directory), then GREEN; an
isolated successful real replay left its `TMPDIR` empty. This changes only
benchmark tooling, not server semantics or measurements.

Raw local reports are `/private/tmp/photos-bottomtoolbar-identity-default-r2k-{2,3,4}.json`
and `/private/tmp/photos-bottomtoolbar-identity-common-r2l-{1,2,3}.json`.
The compact [machine evidence](evidence/2026-09-20-photos-verifier-sdk-stage-gate.json)
preserves the per-run stage peaks and compiler cardinalities without source
text. Production remains `legacy` references, `closure` dependency profile,
and full interactive SDK.
