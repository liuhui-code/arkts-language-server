# Static interactive SDK `core` profile: current-main no-go

Date: 2026-09-20. Server HEAD: `3938181724da12d41650ccedfc8fbeb70feac84e`
(`main`, clean before this report). No production semantics or defaults changed.

## Fixed real-project replay

- Project: OpenHarmony `applications_photos`, commit
  `98ea1d9cd6a363c576e2c6ff17844e51723baec5`, clean checkout at
  `/private/tmp/applications_photos-6.1-lts`.
- SDK: installed DevEco OpenHarmony API 24, version `6.1.1.125`.
- Node: `v26.3.0` on macOS.
- Built server SHA-256:
  `9e3ba503ef6961cd6f98799938219557dddf3c0c0b240ab11e3485f68a666f28`;
  sidecar SHA-256:
  `8d4e95b5c603b8f43e0da9a7e62d74b127a94fe16f8b6d0afbc9fd0d6ebe40ae`.
- Target: `imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`,
  `getMutuallyExclusiveDesc` at zero-based UTF-16 `351:19`.
- Request: fresh-process `textDocument/references`, `includeDeclaration=true`;
  automatic diagnostics were not disabled. Both runs used the same built
  server and `legacy` references strategy. Only
  `ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE` changed.

| Profile | References | Diagnostics | Diagnostic Program | Peak product RSS |
| --- | ---: | ---: | --- | ---: |
| default `full` | 3 | 62 | 1,246 project + 573 SDK SourceFiles | 887,308,288 B |
| opt-in `core` | 3, exact | 132 | 1,246 project + 448 SDK SourceFiles | 841,830,400 B |

The strict replay differential emitted `REFERENCES_LOCATION_GATE=PASS` and
`DIAGNOSTIC_CORRECTNESS_GATE=FAIL`. The 70 additional errors are all TS2304
unresolved-global diagnostics. Their 27 distinct names are supplied by 13
different SDK component declaration files referenced from `index-full.d.ts`,
including `column.d.ts`, `text.d.ts`, `scroll.d.ts`, and
`custom_dialog_controller.d.ts`. The approximately 5.1% product RSS reduction
is **not** a valid optimization because normal diagnostics are wrong. This
independent current-main replay reproduces the earlier
[multi-file failure](2026-09-19-interactive-sdk-core-multifile-gate.md).

## SDK surface check

The installed `index-full.d.ts` lists 134 direct component references; 120
referenced files exist in this SDK installation. A read-only TypeScript AST
inventory of their top-level named declarations found 1,833 distinct names.
Of these, 1,353 have no provider among the four `core` roots
(`common.d.ts`, `units.d.ts`, `common_ts_ets_api.d.ts`, `enums.d.ts`). This is an
inventory of *direct named declarations*, not a complete compiler dependency
or semantic-equivalence proof. In particular, it does not certify that all
1,353 names are used by Photos, nor that a smaller per-document set would be
correct. It does prove the static four-root profile does not preserve the
SDK's full global declaration surface for arbitrary ArkTS documents.

The 27 names responsible for this replay's false errors all map to direct
providers in the installed `index-full.d.ts` graph; there is no evidence that
the errors are caused by the reference result mapper or by missing project
membership. Simply adding these 13 files would repair only this observed
document, not the other omitted SDK globals or future edits.

## Decision and next gate

**NO-GO for promoting the static `core` profile.** Keep the production
interactive profile `full`. Do not add a list of names or declaration files
chosen from `BottomToolbar` to claim general correctness. The next proposed
working-set slice must derive an SDK-global candidate set from a complete,
versioned SDK declaration inventory and the actual semantic dependency
closure, then fail closed to `full` whenever completeness, project generation,
open overlays, or a declaration provider is unknown. Before default promotion,
run the public LSP differential on ArkUI-heavy, ordinary module, member,
alias/re-export, and edited-overlay real documents across supported SDKs;
require exact references, navigation, completion, and versioned automatic
diagnostics, followed by the established latency and product-memory gates.
The user-reported >3 GB reproducer remains unavailable, so no 5 GB fix or
final 50% peak reduction is claimed.

Validation: both current-main real replays completed with the exact three
reference Locations, the strict diagnostic differential failed as expected,
`git diff --check` passed, and `pnpm check:fast` passed 926/926 tests.

Raw local reports:

```text
/private/tmp/photos-bottomtoolbar-full-main-20260920.json
/private/tmp/photos-bottomtoolbar-core-main-20260920.json
```

Reproduce the decisive comparison on this Mac after building the server:

```bash
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets \
  --symbol getMutuallyExclusiveDesc --line 351 --character 19 \
  --oracle /private/tmp/photos-bottomtoolbar-full-verified-20260919.json \
  --out /private/tmp/photos-bottomtoolbar-full-main-20260920.json \
  --mode A --strategy legacy --trace --idle-ms 0

ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE=core \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets \
  --symbol getMutuallyExclusiveDesc --line 351 --character 19 \
  --oracle /private/tmp/photos-bottomtoolbar-full-verified-20260919.json \
  --out /private/tmp/photos-bottomtoolbar-core-main-20260920.json \
  --mode A --strategy legacy --trace --idle-ms 0

node scripts/bench/assert-replay-differential.mjs \
  --baseline /private/tmp/photos-bottomtoolbar-full-main-20260920.json \
  --candidate /private/tmp/photos-bottomtoolbar-core-main-20260920.json
```
