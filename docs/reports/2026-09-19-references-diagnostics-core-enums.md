# References product peak and diagnostic SDK roots

Date: 2026-09-19

## Stage finding

The fixed Photos `EditorController` identity-batched replay spent at most
approximately 480–497 MB product RSS during `textDocument/references`, then
rose to approximately 638–652 MB after the response while normal automatic
diagnostics ran. The sidecar contributed only about 47 MB at the sampled peak.
The default diagnostic Program contained 889 SourceFiles: 368 project and 521
SDK. Thus the full-workflow product peak in this case is constrained by the
interactive diagnostic state, not only by the bounded reference verifier.

Changing only the existing default-off interactive project-root profile from
`closure` to `current` reduced explicit project roots from 256 to one but left
all 368 project SourceFiles reachable through imports. Its single-run product
peak was 629,317,632 bytes versus 650,092,544 bytes in one earlier default
run; that is not a demonstrated structural reduction.

Changing only the default-off interactive SDK profile to `core` reduced the
diagnostic Program to 761 SourceFiles (393 SDK) and product peak to 575,111,168
bytes, but produced an extra false `Cannot find name 'Curve'` diagnostic. This
is a correctness failure, not a usable memory result. `Curve` is declared by
the locked SDK's `ets/component/enums.d.ts`, which the core profile had omitted.

## TDD correction

Parent revision: `129a83cbb8925ea31fd4554c940ab02ca81cd6e5`.

The existing public child-process LSP diagnostic/profile test gained an SDK
`enums.d.ts` fixture and a `Curve.Linear` use. RED: the full profile published
no diagnostic while core published `Cannot find name 'Curve'`. GREEN: the core
profile includes `enums.d.ts` when all its required files exist; otherwise it
retains its existing full-profile fallback. The amended public test returned
exact references, diagnostics, completion and definition under both profiles.

This is a correction to an **opt-in** profile, not permission to make it the
production default. It proves neither that every SDK global lives in the four
core roots nor that all ArkTS files have exact diagnostics under this profile.
Validation: `pnpm check` passed, the focused public LSP suite passed 13/13,
and `pnpm check:fast` passed 925/925 with no failures or skips.

## Fixed real-project replay

```text
workspace: OpenHarmony applications_photos
commit:    98ea1d9cd6a363c576e2c6ff17844e51723baec5
SDK:       DevEco OpenHarmony API 24 / 6.1.1.125
Node:      v26.3.0
file:      browserCommonPhone/src/main/ets/controller/EditorController.ets
symbol:    EditorController
position:  133:14 (zero-based UTF-16)
request:   textDocument/references, includeDeclaration=true
```

The baseline is the three independent full-diagnostics legacy runs from the
[disjoint re-export report](2026-09-19-references-disjoint-reexport-support.md).
The corrected core-profile runs used `indexed-batched`, the `common` reference
verifier SDK profile and the `identity` dependency profile. All runs used fresh
server processes with normal automatic diagnostics.

| Strategy | Run | Locations | Diagnostics | Request | Product peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| legacy/full diagnostics | 1 | 17 | 59 | 7.375 s | 890,122,240 B |
| legacy/full diagnostics | 2 | 17 | 59 | 7.918 s | 885,297,152 B |
| legacy/full diagnostics | 3 | 17 | 59 | 7.711 s | 891,904,000 B |
| identity/core+enums diagnostics | 1 | 17 | 59 | 5.370 s | 578,654,208 B |
| identity/core+enums diagnostics | 2 | 17 | 59 | 5.257 s | 587,800,576 B |
| identity/core+enums diagnostics | 3 | 17 | 59 | 5.345 s | 577,789,952 B |

All three corrected runs produced the established 17-Location oracle and the
same 59 diagnostic code/severity/range/message records as the full profile.
The diagnostic Program contained 762 SourceFiles (368 project, 394 SDK),
versus 889 (368 project, 521 SDK) under the full profile. Median product peak
RSS was 578,654,208 versus 890,122,240 bytes, a 35.0% reduction; median
request latency was 5.345 versus 7.711 seconds. This fixed workload passes the
30% prototype memory and `<=2×` latency gates, but **fails** the final 50%
memory gate. It is not the user-reported >3 GB reproducer.

The complete raw curves, protocol transcript and event timeline remain in
`/private/tmp/photos-editorcontroller-diagnostics-core-enums{1,2,3}.json`.
Compact [machine evidence](evidence/2026-09-19-references-diagnostics-core-enums.json)
contains no source text.

## Reproduce

With the exact checkout and SDK above, build the server and release sidecar,
then run:

```bash
ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE=core \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file browserCommonPhone/src/main/ets/controller/EditorController.ets \
  --symbol EditorController --line 133 --character 14 \
  --oracle /private/tmp/photos-editorcontroller-legacy-pass2.json \
  --out /private/tmp/photos-editorcontroller-core-enums-replay.json \
  --mode A --strategy indexed-batched --sdk-profile common \
  --dependency-profile identity --batch-roots 1 --trace --idle-ms 0 \
  --timeout-ms 180000 --diagnostic-timeout-ms 180000
```
