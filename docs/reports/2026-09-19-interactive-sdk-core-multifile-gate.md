# Interactive SDK `core` profile: multi-file correctness gate

Date: 2026-09-19. Parent revision: `fc3c849027e97e70a9be73f5777316719ed8abf1`.

The previous [single-file probe](2026-09-19-references-diagnostics-core-enums.md) showed that adding `enums.d.ts` corrected one false diagnostic in Photos `EditorController`. It did not establish that the opt-in `ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE=core` is generally safe. This follow-up held the server, real project, SDK, and LSP request sequence fixed while changing only that environment setting. Both runs used `legacy` references, so the comparison isolates interactive SDK diagnostics rather than indexed-batched verification.

Environment: OpenHarmony `applications_photos` commit `98ea1d9cd6a363c576e2c6ff17844e51723baec5`, DevEco OpenHarmony API 24 SDK `6.1.1.125`, Node `v26.3.0`, server revision `fc3c849`. Each row used a fresh process, normal automatic diagnostics, `textDocument/references` with `includeDeclaration=true`, and external process-tree RSS sampling. The full-profile Location set was confirmed in a second independent process for `BottomToolbar`. An initial `BottomToolbar` position copied from an older report was invalid in this checkout; the actual UTF-16 position was read from the file and used below.

| File / symbol / zero-based UTF-16 position | Full SDK | `core` SDK | Result |
| --- | --- | --- | --- |
| `feature/privacy/src/main/ets/about/AgreementConfig.ets`, `Routers`, `20:16` | 19 references; 8 diagnostics; 573 SDK SourceFiles; 899,768,320 B peak | same 19 references and exact 8 diagnostics; 448 SDK SourceFiles; 828,932,096 B peak | Exact for this file; peak lower by 7.9% |
| `imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets`, `getMutuallyExclusiveDesc`, `351:19` | 3 references; 62 diagnostics; 573 SDK SourceFiles; 894,357,504 B peak | same 3 references, **132 diagnostics**; 448 SDK SourceFiles; 849,473,536 B peak | **Correctness FAIL**: 70 extra diagnostics; peak lower by 5.0% |

All 70 additional `BottomToolbar` diagnostics are error 2304, reporting unresolved ArkUI globals such as `TextAttribute`, `TextInstance`, `Column`, `Scroller`, and `CustomDialogController`. The `core` result omitted none of the 62 full-profile diagnostics, but extra false errors are still unacceptable. Two independent full-profile runs returned the same 62 diagnostics and three Locations. Full raw curves and LSP timelines are retained locally in `/private/tmp/photos-{routers,bottomtoolbar}-{full-*,core-enums-*}-20260919*.json`; the compact [evidence record](evidence/2026-09-19-interactive-sdk-core-multifile-gate.json) contains result hashes and counts without source text.

The first full-profile replay for each symbol used an empty oracle solely to capture the baseline and therefore reported `REFERENCES_REPLAY=FAIL` for the expected oracle mismatch, not a server/query error. The second `BottomToolbar` full-profile replay passed with the captured oracle; both `core` replays passed exact reference-oracle validation. Diagnostic equality was checked separately because the replay tool's PASS status does not enforce it.

Decision: **do not enable `core` by default or treat the single-file 35% result as a product-level memory win.** Production remains `full`. The next change needs a conservative, testable SDK-global closure or an exact fail-closed fallback; adding only the globals encountered in this one file would not prove completeness. The original user-reported >3 GB reproducer and final 50% memory gate remain unverified/unmet.

On the same Mac, the decisive `BottomToolbar` replay is:

```bash
ARKTS_INTERACTIVE_SDK_AMBIENT_PROFILE=core \
node scripts/bench/replay-references.mjs \
  --workspace /private/tmp/applications_photos-6.1-lts \
  --sdk /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  --file imageEditor/product/editor_phone/src/main/ets/component/menu/BottomToolbar.ets \
  --symbol getMutuallyExclusiveDesc --line 351 --character 19 \
  --oracle /private/tmp/photos-bottomtoolbar-full-verified-20260919.json \
  --out /private/tmp/photos-bottomtoolbar-core-repeat.json \
  --mode A --strategy legacy --trace --idle-ms 0
```

The replay's `PASS` verifies the reference oracle only. Compare the report's
`diagnostic.diagnostics` array against the full-profile report to apply the
diagnostic correctness gate.

Validation of this documentation-only follow-up: `git diff --check` and the
machine-evidence JSON assertion passed; the focused public LSP suites passed
17/17; `pnpm check:fast` passed 925/925 when run with the macOS process-sampling
permission required by its external-RSS test. Restricted sandbox runs produced
`spawn EPERM` in that sampler; its isolated test passed with the same required
permission. No server behavior or release default changed in this follow-up.
