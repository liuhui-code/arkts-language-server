# Photos identity references + current-document roots: no-go

Date: 2026-09-20. Server HEAD: `80e1fca8929e12393adeab05bb27061d1c3dd5e1`,
clean before this documentation change. This is a paired experiment with existing
default-off settings; production behavior was not changed.

## Fixed replay

- OpenHarmony `applications_photos` commit
  `98ea1d9cd6a363c576e2c6ff17844e51723baec5`, clean checkout at
  `/private/tmp/applications_photos-6.1-lts`.
- Installed DevEco OpenHarmony API 24 SDK, version `6.1.1.125`; Node `v26.3.0`
  on macOS. Server SHA-256:
  `9e3ba503ef6961cd6f98799938219557dddf3c0c0b240ab11e3485f68a666f28`.
- `imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`,
  `getMutuallyExclusiveDesc` import use at zero-based UTF-16 `351:19`.
- Three fresh-process pairs, `textDocument/references` first after `didOpen`,
  `includeDeclaration=true`, identity-bounded indexed batches, full SDK,
  automatic diagnostics, and external process-tree RSS sampling. Only
  `ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE=current` differs in the candidate.
- Every pair passed the strict normalized Location and versioned automatic
  diagnostic differential: exactly three Locations and 62 diagnostics.

| Run | Default peak RSS | Current-root peak RSS | Default request | Current-root request |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 587,431,936 B | 581,857,280 B | 3.388 s | 2.947 s |
| 2 | 578,912,256 B | 578,752,512 B | 3.130 s | 3.035 s |
| 3 | 584,921,088 B | 592,269,312 B | 3.073 s | 3.123 s |
| Median | **584,921,088 B** | **581,857,280 B** | **3.130 s** | **3.035 s** |

The median peak difference is only **0.52%**, smaller than the run-to-run
spread. The current-root profile reduced explicit diagnostic *project roots*
from 256 to one, but both modes built the same diagnostic Program: **323
project + 503 SDK SourceFiles**. The source file imports recursively pulled
the project closure back into the Program. The identity reference verifier
was unchanged at two project + 302 SDK SourceFiles. Shrinking only
`getScriptFileNames()` is therefore not a working-set bound for this document.

Separating external samples by request timeline, the median peak *during*
references was 491,417,600 B for default roots and 487,542,784 B for current
roots; the later normal-diagnostic interval raised the respective product
peaks to 584,921,088 B and 581,857,280 B. The matched legacy median from the
[previous report](2026-09-20-photos-bottomtoolbar-identity-working-set.md)
was 885,018,624 B, so its 50% release threshold is 442,509,312 B. Even a
hypothetical complete removal of the *later diagnostic* peak would not make
this workload meet that threshold: the reference interval alone is above it.
That hypothetical is not a proposed behavior change; normal diagnostics must
remain enabled and correct.

## Decision

**NO-GO for promoting the current-document root profile as a memory fix.**
The next experiment must explain and bound both (1) the verifier's fixed
SDK/setup footprint and (2) the interactive document's *transitive* project
and SDK dependency closure. A root count or a list of names observed in this
one file is not a completeness proof. Keep production `legacy` references,
`closure` dependency profile, and full interactive SDK. The original >3 GB
reproducer and final release gates remain open.

Raw local reports are `/private/tmp/photos-bottomtoolbar-identity-default-r2k-{2,3,4}.json`
and `/private/tmp/photos-bottomtoolbar-identity-current-r2k-{1,2,3}.json`.
The compact [machine evidence](evidence/2026-09-20-photos-interactive-roots-with-identity-no-go.json)
preserves all six peak/request measurements and Program cardinalities without
source text or machine-specific absolute paths.
The first unprivileged attempt, `/private/tmp/photos-bottomtoolbar-identity-default-r2k-1.json`,
failed before the request because macOS process sampling was sandbox-denied
(`spawn EPERM`); it was excluded from all measurements.

Reproduce one candidate run on the same Mac after building the pinned server
and release sidecar:

```bash
ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE=current \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets \
  --symbol getMutuallyExclusiveDesc --line 351 --character 19 \
  --oracle /private/tmp/photos-bottomtoolbar-full-main-20260920.json \
  --out /private/tmp/photos-bottomtoolbar-current-replay.json \
  --mode A --strategy indexed-batched --dependency-profile identity \
  --trace --idle-ms 0
```
