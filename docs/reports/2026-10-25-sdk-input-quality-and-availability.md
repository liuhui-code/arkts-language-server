# SDK input quality is separate from language-service availability

2026-10-24–25; implementation in the working tree; not merged or released.
[ADR 0021](../adr/0021-sdk-input-quality-and-service-availability.md) records the
user's requirement. [TDD evidence](../tdd/sdk-input-quality-20261025.md) records
the failing commands, corrections and regression boundaries.

## Result and boundary

An unknown SDK module is now an SDK input issue (`semanticState: partial`), not a
failed language service. Normal diagnostics and healthy completion/navigation
remain available. A partial report is not a complete-project generation/coverage
certificate; reference/rename requests retain their existing verification and
fallback rules. Healthy local references and rename edits are tested through LSP.

Program/Worker construction, ownership, cancellation and pressure failures retain
their own existing failure/recovery behavior. This work does not mark those as
healthy, suppress real errors, add `any` declarations, remove identity checks or
spend recovery budget to repair missing SDK APIs. It does not implement the paused
cache-performance TODO. The 455-file cold-directory 3-second gate remains excluded
under the user's previous instruction; no indexing feature was removed.

`partial` carries the first bounded SDK issue, six locally available capabilities,
and no complete proof fields. Missing SDK identity/ambient coverage stops complete
qualification before introducing new global Program work; it does not deny ordinary
queries or claim a prepared root Program. Known SDK coverage plus an unresolved API
can leave an already built Program usable, without a complete-project certificate.
SDK issue reporting is not an exhaustive validation of all SDK declarations.

## Causes and implementation

| Cause | Change and code evidence |
| --- | --- |
| Exported `api/@internal/full/global.d.ts` is an external module; it does not supply ambient timer/console names | `discoverSdkAmbientDeclarations`, `src/core/types/typescript-sdk-ambient.ts`, loads the selected SDK loader's generated ambient `declarations/global.d.ts`, with `component/global.d.ts` as fallback |
| Declaration-only SDK omitted loader tsconfig, so `ets.components` was absent and valid builder tails were misparsed | `officialEtsCompilerOptions`, `src/semantic/backends/ohos-typescript/ets-options.ts`, prefers loader configuration; bounded fallback uses that SDK's component-config keys |
| A components-only options object is incomplete for the actual installed fork: decorator calls dereference `extend.decorator` | `withEtsDefaults` fills required option records with empty feature sets, for both a partial loader and component fallback. SDK-provided decorator names/options are preserved; absent names are not invented |
| Missing SDK module was classified together with global input failure | `prepareOfficialReadiness`, `src/core/types/typescript-semantic-readiness.ts`, distinguishes official SDK namespace missing-module diagnostics and SDK-owned missing declarations; project-relative missing inputs retain their existing reasons |
| `skipLibCheck` can hide missing SDK triple-slash declarations | Already parsed explicit `.d.ts`/`.d.ets` directives are checked against actual Program membership; issue has no fabricated compiler diagnostic |
| Adding runtime roots could incorrectly make a runtime-only SDK appear fully qualified | Full qualification still requires a selected component entry; runtime-only timers remain usable under partial |
| Consumers assumed only ready/unprepared/degraded | Contract factory `semanticSdkPartial` and strict Worker decoder `assertSemanticReadinessResponse` support partial; prepared benchmark retains PARTIAL while complete readiness/latency gates still fail/block |

The timer declarations come from the selected SDK, without adding DOM or Node libs.
The component fallback retains loaded-input witnesses and a 256 KiB read bound.
Unknown extension configuration can still produce local 1206; an incomplete SDK
cannot supply semantics for an extension it does not describe. A full SDK remains
the preferred source of accurate grammar options and API types.

Official SDK references used for the distinction between exported APIs and generated
ambient declarations: OpenHarmony's [loader configuration](https://github.com/openharmony/developtools_ace_ets2bundle/blob/master/compiler/tsconfig.json),
[checker declaration loading](https://github.com/openharmony/developtools_ace_ets2bundle/blob/master/compiler/src/ets_checker.ts),
and [timer documentation](https://github.com/openharmony/docs/blob/master/en/application-dev/reference/common/js-apis-timer.md).
Latest upstream sources are explanatory only; actual tests use the installed SDK
and pinned compiler bytes. Context7 resolution was attempted but its transport
failed; local installed source and official sources were used instead.

## Version, SDK and environment

Parent `e35459131366a32c48c10d1d74adef74357cd3dc`, branch
`fix/windows-path-identity-20261022`, dirty working tree including inherited fixes.
Exact final source/test/script/config hashes:
`.bench/sdk-semantics-20261024/final-proof-inputs.json`.

| Artifact | SHA-256 |
| --- | --- |
| Server | `a35159eeb9764d1a9c20fa9834fa6971f99d1a764c675b5c0e0f3e0933ce299d` |
| Semantic Worker | `7d9d8ff20132b443d7cd084fecd1033c8f730f8edf0aebfcd9be3c31907c2e30` |
| Installed compiler `ohos-typescript@4.9.5-r10` | `af9e3c4689e3250de1d869b219abb76081c6ea1d3df81bd6b8f6a74c3174b6bc` |
| Explicit official runtime declaration patch | `0a67bd772c60720891b7ebd4cfbaafbab71213de3c4e8a14b8256433f0fdb98e` |

Both platforms use Node 20.19.5. Photos revision is
`a2c993829c46d965abefc5d2143187fa54fa4604`, 288 original source files plus one
temporary validation source. Source copies are extracted from git archives outside
the language-server repository, preventing its Node type packages contaminating
compiler input. This is public framed-stdio validation, **not a new Zed UI run**.
The daily installed Zed runtime/configuration was not replaced by these experiments.

- Mac SDK: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`,
  API 24 / ETS 6.1.1.125, actual loader options and generated runtime globals.
- Windows SDK: `D:/DevTools/sdk-declarations/openharmony-api24-6.1.1.125`, same
  reported API/component version, declaration-only, no loader config/runtime globals.
- Windows patched control: `D:/code/arkts-sdk-layering-20261025/sdk-runtime-patch/openharmony`.
  This is a separate copy with the above official runtime declaration added; it is
  an explicit controlled patch, not proof of complete SDK equivalence/certification.
- Both SDKs still lack the Photos system API `@ohos.filemanagement.userFileManager`.
  That missing declaration remains an SDK issue; no counterfeit module is installed.

## Actual-project outcomes and timings

Each case uses one fresh LSP session, default product settings and serial operations:
initialize response, initial-preparation terminal, open runtime validation source,
open `feature/editor/src/main/ets/default/view/PcMainMenuBar.ets`, query its `height`
definition/completion, then timer
definition/hover/completion in the order setTimeout, clearTimeout, setInterval,
clearInterval. Every operation's params, result and elapsed time are retained in
`operations.json`, full frames in `wire.ndjson`, logs in `logs/server.log`.

The cases are functional diagnostics, not a controlled latency benchmark: the Mac
also ran repository checks, one session per case gives no multi-round distribution,
and results are not a Mac/Windows performance comparison or a 500 ms acceptance.

All times below are milliseconds from the final component-inclusive run; timer
columns are min–max across four different timer symbols, not repeated-round
median/max. Initialization response and the subsequent preparation wait are
separate intervals. Open-diagnostics measures didOpen through the versioned
publication; request rows measure send through matching response.

| Environment | SDK state | Init response | Preparation wait | height definition / completion | Timer definition | Timer hover | Timer completion | Semantic Worker starts / faults |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mac full SDK | partial | 127.495 | 24,847.312 | 140.312 / 294.232 | 69.911–115.938 | 78.896–129.993 | 215.164–395.412 | 1 / 0 |
| Windows declaration SDK | partial | 74.801 | 30,027.399 | 169.928 / 289.055 | No timer declaration; RPC 325.631–497.412 | No timer declaration | No timer declaration | 1 / 0 |
| Windows explicit runtime patch | partial | 85.322 | 30,380.742 | 176.150 / 295.857 | 112.693–132.799 | 112.378–130.607 | 257.876–462.741 | 1 / 0 |

Both `height` definitions point to the selected SDK's component declarations;
completion contains the actual `height` member. Both validation files publish
empty diagnostics on the Mac/full and Windows/patched controls. In the original
Windows SDK, only the runtime validation source has the expected missing-global
errors; `PcMainMenuBar` diagnostics are empty and its `height` queries succeed.
Do not count empty timer definitions under the unpatched SDK as successful API
navigation merely because the JSON-RPC response has no error.

Other final operations exceeding 500 ms: PcMainMenuBar open-to-diagnostics
601.564 ms (Mac), plus every initial preparation wait above. No internal exclusive phase breakdown
or memory peak was measured in these SDK diagnostics; no attribution is inferred.
`semantic.worker.started` counts the main semantic Worker, not all possible
auxiliary Worker classes. Every case closed with exit code 0, and the final Windows
audit found zero processes belonging to these isolated diagnostic runs.

Final raw cases: `mac-photos-proof/`,
`windows-proof/windows-photos-proof-original/`, and
`windows-proof/windows-photos-proof-patched/` within the evidence root.
Machine-readable summary: `photos-proof-summary.json`; regenerate with
`python3 .bench/sdk-semantics-20261024/summarize-final.py`.

## Checks

| Check | Result / evidence within the evidence root |
| --- | --- |
| Final ten SDK public regressions, Mac | included in 49/49; `78-final-proof-contracts.tap` |
| Same ten regressions, Windows | 10/10; UTF-8 view `windows-public-proof.tap`, original UTF-16 `windows-proof/public-proof.stdout` |
| Readiness/protocol/initialization focused contracts | 49/49; `78-final-proof-contracts.tap` |
| Existing retained source/group/freshness consumers after SDK-state migration | 25/25; `72-sdk-consumer-contracts.tap` |
| Official-layer CLI SDK issue contract | selected case passes; `73-layer-sdk-contract.tap` |
| Real installed SDK acceptance on final product | 11/11; `81-final-proof-real-sdk.tap` |
| Final complete `pnpm check:fast` | 2,028/2,028, exit 0; 0 failed/cancelled/skipped; `80-final-proof-check-fast.log` (3,216.923 s for Node tests) |

Focused counts overlap the full suite; they are not additive unique coverage.
Final check receipt, artifact hashes and frozen-input audit:
`.bench/sdk-semantics-20261024/final-verification.json` (733 files unchanged).
No Rust code was changed by this SDK slice. Inherited path/state-machine changes
are retained. Their earlier Rust/Windows evidence remains separate from this run.
Every source/test/script touched in this slice remains at or below 500 lines;
the inherited over-limit language-service file was not edited by this SDK slice.
The final check includes the migrated retained-source/group/freshness consumers;
their earlier focused 25/25 is characterization evidence, not a different final
release verdict. The 455-file cold-directory 3-second performance gate remains
separately excluded by user authorization; this is not a full release-gate pass.

In the unpatched Windows SDK, timer/console declarations remain absent: the
validation source publishes 2304/2552/2584 as applicable. The component source is
clean, the root stays partial, queries settle without restarting a Worker. Adding
the explicit runtime declaration makes timer/console diagnostics disappear and
definitions resolve to that declaration. The root still stays partial for the
separate missing Photos system API. This is the intended separation.

## Same-session repair and regression evidence

`tests/semantic/sdk-runtime-globals.test.mjs` has ten public regressions, including
typed arguments/returns, no DOM/Node pollution, exact locations/edits, unknown SDK
input with healthy references/rename, local unknown extension diagnostics, explicit
project `.d.ts` repair, and same-path SDK update via configuration refresh. Both
repair cases reach READY with one Worker in the same session. No fresh session is
required by the server for the tested notification sequences.

Project declaration creation uses normal watched-file synchronization followed by
explicit readiness preparation. Same-path SDK replacement uses configuration
refresh followed by preparation; silently mutating witnessed SDK files without a
refresh remains subject to the existing freshness rejection. `prepare: false` is
status admission, not an implicit SDK rescan. Zed initialization-option edits still
require an editor language-server restart to resend those options.

Protocol tests protect null proof fields, exact capability sets and SDK issues;
forged partial/complete reports are rejected. Benchmarks distinguish PARTIAL from
invalid wire data, while preserving failed complete-ready and blocked latency gates.
The one-MiB initialization regression still returns resource-budget-exceeded on a
later ordinary recovery: a partial initialization cannot renew its pressure exemption.

## Reproduction and evidence

Evidence root: `.bench/sdk-semantics-20261024/`.

```sh
pnpm build
node --test --test-concurrency=1 tests/semantic/sdk-runtime-globals.test.mjs
node .bench/sdk-semantics-20261024/validate-photos.mjs /private/tmp/arkts-sdk-photos-evidence ../applications_photos /Applications/DevEco-Studio.app/Contents/sdk/default/openharmony
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony pnpm test:e2e:real-sdk
pnpm check:fast
```

The evidence output directory must not already exist. The runner creates a separate
external temporary workspace; it retains the input tar, exact injected source,
source revision, SDK metadata and product hashes. Real Photos tracked files remain
unchanged; existing Mac untracked `.DS_Store` files were preserved.

Windows setup/run/export commands are saved PowerShell files in the evidence root,
with SSH command receipts. Use `remote.py SCRIPT UNIQUE_LABEL [TIMEOUT_SECONDS]` on
the authorized `windows-pc` host. Unique output names preserve earlier failures.

Failed/harness-correction runs are not passing evidence: initial inside-repository
Mac fixture discovered Node types; first Windows upload missed a builder fixture;
the component-only option object caused a real compiler exception; the first probe
had a wrong anchor; and a new CLI test reused an output filename. Exact causes and
retained evidence are listed in the TDD record. Interrupted checks 23/39/49/60 are
not reported as complete checks. Check 74 was also interrupted after the runtime-only
SDK regression exposed a false full-coverage claim. The final qualification keeps
component-entry coverage mandatory while permitting runtime-only queries. Check 80
starts with fixed product/test inputs after all relevant focused tests pass; exact
before/after manifests and all interrupted-run receipts are retained.

Remaining limits: SDK input issues are not exhaustive; unsupported extension
features need matching SDK options; initialization/other operations can still
exceed 500 ms; scale and cache TODOs remain open; actual Zed UI coverage is not
extended by this controlled LSP run. SDK issue strings are bounded diagnostic data:
spaces while editing an import do not become protocol failures. An oversized module
name can still create an unprovable filesystem witness. The controlled 4,107-character
filename probe returns ENAMETOOLONG on Mac and ENOENT on Windows (`64-mac-long-name.json`,
`65-windows-long-name.stdout`). Identity capture in
`src/project/loaded-configuration-witness.ts` accepts stable absence while other
identity errors remain unprovable. Accordingly the public query returns the
existing exact -32803 freshness error on Mac and the correct SDK definition on
Windows, with one semantic Worker in each. That guard was preserved, not optimized
or reported as repaired. The earlier failed cross-platform assertion is retained
in `63-windows-public-accepted.tap`; the final test checks exact outcomes on both.
This change does not claim the earlier Windows
completion-resolve or rename-capability issues resolved.
