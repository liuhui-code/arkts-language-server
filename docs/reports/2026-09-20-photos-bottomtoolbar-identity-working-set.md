# Photos `BottomToolbar` identity-bounded references: matched real-project replay

Date: 2026-09-20. Server HEAD:
`34cdba2926860607c35b75735af3aaaecf89f18a` (`main`, clean before this
documentation change). This is an experiment with existing default-off
settings, not a production strategy change.

## Fixed input and method

- OpenHarmony `applications_photos` commit
  `98ea1d9cd6a363c576e2c6ff17844e51723baec5`, clean checkout at
  `/private/tmp/applications_photos-6.1-lts` (1,794 cataloged ArkTS/TS files).
- Installed DevEco OpenHarmony API 24 SDK, version `6.1.1.125`; Node
  `v26.3.0` on macOS.
- `imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`,
  `getMutuallyExclusiveDesc` import use at zero-based UTF-16 `351:19`.
  Declaration is the exported arrow function in sibling `Consts.ets`.
- Fresh process per run; `textDocument/references` first after `didOpen`,
  `includeDeclaration=true`, normal automatic diagnostics, external 50 ms
  process-tree RSS sampling. The harness and worker RSS were not added to the
  product total twice.
- Control: `legacy`. Candidate: `indexed-batched` with only the existing
  `identity` dependency profile enabled. Verifier SDK profile remained
  `full`; candidate batch size remained its default. Thus no trimmed SDK
  declaration profile or artificial root cap contributed to the matched A/B.

| Run | Legacy peak product RSS | Identity peak product RSS | Legacy request | Identity request | Locations / diagnostics |
| ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 885,018,624 B | 604,676,096 B | 7.562 s | 2.947 s | 3 / 62 exact |
| 2 | 879,022,080 B | 587,530,240 B | 7.535 s | 2.981 s | 3 / 62 exact |
| 3 | 891,719,680 B | 585,228,288 B | 7.539 s | 2.966 s | 3 / 62 exact |
| Median | **885,018,624 B** | **587,530,240 B** | **7.539 s** | **2.966 s** | all pairs exact |

The median product peak fell **33.6%** and median request time was 0.39×
legacy. Every run completed normally. The strict replay differential passed
both normalized Locations and versioned automatic diagnostics for each paired
run. The identity path accepted a complete two-file candidate set, performed
one batch, and compiled **2 project + 302 SDK** SourceFiles with no closure
expansion. Legacy subsequently showed **1,246 project + 573 SDK** files in
its interactive diagnostic Program; identity showed **323 project + 503 SDK**.
The latter difference is not a diagnostic truncation: the published 62
diagnostics are exact. It is consistent with legacy references first expanding
the long-lived context to full membership, while the batched request leaves
the interactive context at the current import closure.

Two one-run controls separate other settings. `indexed-batched` at its
default `closure` dependency profile compiled 323 project + 503 SDK files
in the verifier and peaked at 672,653,312 B (24.2% below one legacy run):
it preserved all three Locations and 62 diagnostics, but missed the 30%
prototype memory gate. Keeping `identity` while switching the verifier SDK
from full to the experimental `common` profile changed its SDK file count
from 302 to 170, yet the one-run product peak stayed near 588 MB. Thus the
large *observed* gain in this symbol is associated with the identity-bounded
project closure, not a supported conclusion that a reduced SDK profile is
generally safe.

## Repeat and edit control

A separate mode-C replay made ten references requests in one process, then
sent an unsaved comment edit and made an eleventh request. All eleven
responses returned the same three valid Locations, normal diagnostics were
published for document version 2 with the same 62 records, and the product
peak was 601,956,352 B. Response-adjacent RSS rose from about 495 MB on the
first request to about 529 MB on the tenth, then was about 504 MB after the
edit; this run does not show linear 11-request accumulation. It is one
retention control, not a long-duration memory proof.

## Decision

This real workload passes the plan's 30% prototype peak and ≤2× latency
gates with exact reference/diagnostic results. It **does not** pass the final
50% peak gate, has not been tested against the user's unavailable >3 GB
reproducer, and does not establish correctness across every symbol or SDK.
Keep production defaults `legacy`/`closure` and interactive SDK `full`.
The next working-set investigation should target the remaining normal
diagnostic context (323 project + 503 SDK files here) with a complete,
versioned closure proof; no arbitrary root cap, omitted diagnostics, or
index-only references are permitted.

Three paired raw replay reports per strategy and the mode-C report remain
locally at `/private/tmp/photos-bottomtoolbar-{legacy,identity}-r2j-{1,2,3}.json`
and `/private/tmp/photos-bottomtoolbar-identity-repeat-r2j.json`.
The compact [machine evidence](evidence/2026-09-20-photos-bottomtoolbar-identity-working-set.json)
stores fixed identities, measurements, and result hashes without source text.

Reproduce one identity run on the same Mac after building the server and
release sidecar:

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets \
  --symbol getMutuallyExclusiveDesc --line 351 --character 19 \
  --oracle /private/tmp/photos-bottomtoolbar-full-main-20260920.json \
  --out /private/tmp/photos-bottomtoolbar-identity-replay.json \
  --mode A --strategy indexed-batched --dependency-profile identity \
  --trace --idle-ms 0
```
