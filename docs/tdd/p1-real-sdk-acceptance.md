# P1.4b — real API 24 SDK acceptance

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`.
Owner: P1 real-SDK acceptance worker; production changes owned by the parent agent.
Status: the complete named API 24 acceptance layer passed 10/10 with no skipped,
cancelled, or todo cases; this is not a claim of whole-dialect compatibility.

## Contract and reproducibility

`real-sdk` is a non-fast test layer. Its single executable entry is
`tests/release/real-sdk.acceptance.mjs`. Run it explicitly:

```sh
ARKTS_REAL_SDK_PATH=/absolute/path/to/openharmony pnpm test:e2e:real-sdk
```

The test requires `ARKTS_REAL_SDK_PATH` to be absolute and existing, with
`ets/oh-uni-package.json` declaring `path: ets`, `apiVersion: 24`, and
`version: 6.1.1.125`. SDK files are neither copied into the repository nor
substituted with synthetic declarations. Symbol anchors must exist uniquely;
whole-file hashes are intentionally not required for incidental comment changes.

Each case starts the actual bundled server as a child process over framed stdio.
The temporary project's standard `local.properties` selects the real SDK;
the process fallback points to a nonexistent directory. Definition results are
asserted in full, with exact physical SDK URIs and UTF-16 ranges, not filtered
to hide extra results. Completion assertions cover label, kind, and replacement
edit. Diagnostics are associated with the exact document URI and version. The
gate also keeps an unopened workspace class auto-import visible when the real
SDK contributes hundreds of earlier global completion entries.

Missing configuration, missing files, changed SDK identity, failed semantics,
skips, todos, and cancellations fail this gate. `pnpm check:fast` does not run
the real-SDK entry. `ARKTS_TEST_EVIDENCE_ROOT` retains the existing runner's
bounded failure record under the explicit `node-test-layer/real-sdk` identity.

Verified local SDK input:
`/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`.
CI must provision this exact supported SDK identity through its authorized SDK
distribution mechanism and run the same command. An unprovisioned CI job must
not label this acceptance successful or use `test.skip`; the existing release
script has not been silently changed to require a missing CI SDK.

## RED → GREEN evidence

### Real ArkUI ambient entry

```sh
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  node --test tests/release/real-sdk.acceptance.mjs
```

Initial RED: the valid `Text("Ready").fontColor("#ffffff")` expression returned
`[]` for Text definition instead of the installed declaration. No production
code had been changed by this worker. The parent repaired the SDK ambient entry.

After that repair, the exact legitimate TypeScript definition contract contains
both `Text`'s const declaration and its selected callable interface signature.
The test checks both locations, without discarding either. The first slice then
passed 1/1. Adding fontColor completion/definition passed 2/2.

The util TextEncoder slice initially characterized the existing resolver's
`js/api/@ohos.util.d.ts` location and the one-argument overload selected by the
call. This was not sufficient as the final supported contract: subsequent
official loader inspection established ETS API precedence. The test was corrected
to require `ets/api/@ohos.util.d.ts`, and the resulting URI mismatch was observed
as a distinct resolver-priority RED. Exact ranges remain checked from unique
declaration anchors, and the matching single overload is preserved.

The diagnostics slice passed 4/4: valid util/ArkUI code has no diagnostics;
`encodeInto(123)` has exactly one error 2345 at `123`; repairing the buffer clears
version-3 diagnostics. The production `sdk.selected` log identifies the project
SDK, API 24, and component 6.1.1.125.

The browser-boundary characterization passed 5/5 without production changes:
`const browserDocument = document` reports exactly error 2584 at `document`, and
completion does not advertise that DOM global.

### Official Kit entry

Adding the official `import { hilog } from '@kit.PerformanceAnalysisKit'` style
produced a new production RED: 5 passed, 1 failed. Valid source was expected to
have no diagnostics but received error 2307 over the Kit specifier. The installed
`ets/kits/@kit.PerformanceAnalysisKit.d.ts` imports and re-exports `@ohos.hilog`.
The test also checks hilog.info completion and its exact downstream declaration;
these assertions follow the currently failing clean-diagnostics assertion.

After the parent Kit resolver fix, all 6 cases passed. The original Kit assertion
followed the existing downstream `js/api` resolution; the final SDK contract must
follow the independently verified ETS-first resolver priority instead.

### ETS resolver priority

```sh
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  node --test --test-name-pattern='real util TextEncoder' tests/release/real-sdk.acceptance.mjs
```

Observed RED: the selected util case expected `ets/api/@ohos.util.d.ts` at
zero-based range 917:8–18 but received `js/api/@ohos.util.d.ts` at the same range.
The name filter is a development-only focused command; the final real-SDK gate
runs the complete layer without filters or skips.

After the parent ETS-first fix, the full 6-case real SDK acceptance passed again,
including util and Kit hilog definitions in `ets/api`, with no skips or todos.

### ArkTS declaration namespace

```sh
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  node --test --test-name-pattern='real ArkTS collections' tests/release/real-sdk.acceptance.mjs
```

Observed RED: valid `import collections from '@arkts.collections'` followed by
`new collections.Map<string, number>()` and `get('key')` produced error 2307
over the module specifier (zero-based 0:24–44), instead of clean diagnostics.
The installed declaration is `ets/arkts/@arkts.collections.d.ets`; the case also
requires method completion and the exact Map.get declaration range after the
module becomes resolvable.

After the parent `@arkts.*` mapping fix, this selected case passed, including
Map.get completion and its original `.d.ets` URI/range (1.69 seconds).

### Shipped system namespace

```sh
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  node --test --test-name-pattern='shipped system router' tests/release/real-sdk.acceptance.mjs
```

Observed RED: the SDK still ships `ets/api/@system.router.d.ts`, but a valid
`import router from '@system.router'` followed by `router.clear()` produced
error 2307 over the module specifier (zero-based 0:19–35), instead of clean
diagnostics. This is compatibility coverage of a shipped deprecated API, not a
recommendation to use that API in new applications.

After the parent `@system.*` mapping fix, this selected case passed, including
exact clear completion and `ets/api/@system.router.d.ts` definition (1.49 seconds).

### Dotted-relative SDK type dependencies

```sh
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  node --test --test-name-pattern='dotted relative SDK' tests/release/real-sdk.acceptance.mjs
```

Observed RED: `router.pushUrl({ url: 'pages/Index' }, (err) => { ... err.code })`
had no diagnostics but completion returned no `code` member. The installed router
declaration imports `./@ohos.base`; treating the dotted basename as an already
complete filename lost that transitive type information. The expected replacement
range is zero-based 2:21–25, and definition must land on the original SDK's
`ets/api/@ohos.base.d.ts` `code: number;` declaration.

After the parent known-extension resolution fix, this selected case passed in
2.12 seconds. The completion kind is the server's established `Field` (5)
contract for member variables, rather than the initial test's `Property` (10)
assumption. No production completion-kind behavior was changed for this test.

### Completion fairness under real SDK ambient volume

The first complete `pnpm check:fast` exposed two existing workspace reset tests
only when the installed API 24 SDK was discoverable. Both asked for `Sta` and
expected an unopened workspace `StaleType` auto-import. They passed when SDK
discovery was intentionally pointed at a missing directory, proving this was
not reset-state flakiness.

A deterministic child-stdio regression then gave a synthetic SDK 160 weak
`SdkThingAlpha*` matches before an unopened workspace `StaleType`:

```sh
pnpm build
node --test --test-name-pattern='SDK ambient globals do not crowd out' \
  tests/semantic/project-sdk-selection.test.mjs
```

Observed RED: the bounded result contained the first 128 SDK globals and no
`StaleType`. Project membership already ordered workspace sources before SDK
declarations; TypeScript instead assigned SDK globals to an earlier `sortText`
tier than module exports, and the server filled its result with weak camel/
subsequence matches before examining the later exact-prefix auto-import.

Minimal GREEN: when module-export completion is enabled, match quality is ranked
across TypeScript sort tiers. Prefix, camel and subsequence share a fixed pool of
at most 128 retained candidates; a later stronger match replaces the weakest
retained tail. A full 128-item prefix bucket still stops immediately, preserving
the guarded 129th-entry performance contract. Otherwise at most 4096 raw provider
entries are inspected with cooperative cancellation, and the response contains
at most 128 items. A quality-first synthetic LSP `sortText` makes the server's
ranking survive client-side sorting while keeping ArkUI resource completions in
their established earlier lane. Reaching the raw-scan boundary or omitting
matching entries sets `isIncomplete=true`.

The deterministic stdio case passed, the two original installed-SDK reset cases
passed without disabling SDK discovery, and all 21 completion boundary/
cancellation cases plus all 17 semantic characterization cases passed. A tenth
real-SDK acceptance now verifies exact `StaleType` kind, source detail and edit
range against API 24 while keeping the 128-item output bound and truthful
`isIncomplete` flag.

The 4096-entry scan is an explicit Phase 1 safety boundary, not a completeness
claim for arbitrarily large export sets. An exact auto-import after that boundary
may be absent even though the response is incomplete. A later phase must use a
workspace/export index or a version-guarded continuation path; unbounded scanning
or dependence on TypeScript's private entry-order implementation is not accepted.

### Non-fast layer and evidence identity

```sh
node --test tests/test-layer-manifest.test.mjs
```

Observed manifest RED before wiring: the discovered real-SDK acceptance had no
layer. The new contract also failed because the explicit non-fast layer was
absent. Adding the manifest entry and package command made this contract GREEN.

Observed evidence RED before changing the target allowlist: the public runner
reported `node-test-layer/custom` rather than `node-test-layer/real-sdk`.
Adding that explicit safe target made all 4 manifest/command/evidence tests GREEN.

`node --test tests/test-layer-manifest.test.mjs tests/test-layer-runner.test.mjs`
then passed 32/32, with no skipped/cancelled/todo cases at the outer test level.
An explicit `env -u ARKTS_REAL_SDK_PATH node scripts/run-node-test-layer.mjs
--layer real-sdk` exited 1 with mandatory-prerequisite assertion failures, not
skipped acceptance cases.

## Final complete gate

```sh
ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony \
  pnpm test:e2e:real-sdk
```

GREEN: the package command rebuilt the production bundle once and ran the full
`real-sdk` layer through the canonical runtime-policy runner. All 10 acceptance
cases passed; 0 failed, 0 skipped, 0 cancelled, 0 todo; 19.54 seconds for the test
layer. Test-layer classification remains exhaustive: 88 executable files, with
the single real-SDK acceptance assigned only to the non-fast `real-sdk` layer.

These cases certify only the named API 24 declaration and language-service
scenarios. They do not establish compatibility with every ArkTS dialect,
the official compiler, all SDK APIs, installed artifacts, Zed UI, or large-project
latency and memory budgets.
They also do not certify the Stage project model: these fixtures do not create a
`build-profile.json5`; the Stage configuration subset is independently covered
by the project-model, target-membership, and module-resource test layers.
