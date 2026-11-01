# SDK environment and export-index evidence

Parent: `2972148759194fb12b9c2c05b49fa3801ccde203`.
Branch: `feat/sdk-environment-20261101`. Target/export slices were developed in
`.bench/sdk-target-context-20261101` while the earlier root gate stayed frozen,
then copied as regular source files into this branch. No unrelated worktrees or
main-branch history were changed.

## RED and minimal implementation

- Initial public RED: `pnpm build && node --test tests/semantic/hms-kit-resolution.test.mjs`.
  `@kit.PushKit` could not navigate to the HMS `getToken` declaration. Components,
  selected API paths and relative source boundaries restore compiler navigation.
- Target model RED: `node --test tests/project-sdk-target.test.mjs` failed on the
  absent `sdkTarget` method. Project-model implementation then passed 3 new and
  27 existing characterization cases. Public compile-API99/API24 mismatch RED
  subsequently drove SDK qualification and diagnostics. See the
  [target-context record](sdk-target-context-20261101.md).
- Export RED: `pnpm build && node --test --test-name-pattern='unimported HMS' tests/semantic/hms-kit-resolution.test.mjs`.
  Unimported `pushService` had no SDK completion. The native SDK-only provider
  restores compiler-issued candidates and details/actions. A 5000-ambient-entry
  case protects the independent recovery path without raising generic bounds.
- Freshness RED: the old Kit completion handle could be resolved after changing
  facade bytes; ordinary refresh still returned pinned old ASTs. The public
  regression drove balanced `acquireDocumentWithKey` leases, separate SDK index
  proof, revocation and final publication fencing. Refresh now sees the new
  export and the old handle emits no stale edit.
- Component-contract REDs: metadata-declared `@vendor` namespaces did not resolve,
  API25 HMS declarations were admitted alongside API24, and discovered component
  arrays/metadata were mutable. Public namespace/API regressions and discovery
  immutability regression pass after the bounded fixes.
- Transport RED: `node --test tests/lsp-process-write-error.test.mjs` used a real
  child that closes stdin but sends a valid framed readiness response. A pending
  request caused uncaught EPIPE. The helper now routes stdin errors through its
  existing bounded transport failure, rejecting pending requests.

All LSP behavior cases use actual child processes and Content-Length stdio. The
initial two-root regression used an unsupported workspace-change notification;
it was corrected to use supported initial `workspaceFolders`. Its final result
covers two roots in one process, rather than assuming dynamic root support.

## GREEN evidence

- Type check and build on integrated production code: PASS.
- `node --test tests/semantic/hms-kit-resolution.test.mjs tests/sdk-discovery.test.mjs tests/project-sdk-target.test.mjs tests/test-layer-manifest.test.mjs tests/lsp-process-write-error.test.mjs`:
  41/41 PASS, zero skipped/cancelled; `/tmp/sdk-integrated-focused-20261101.log`.
- Final pre-integration HMS plus discovery checks: 33/33 PASS;
  `/tmp/sdk-final-component-focused-20261101.log`. The HMS-only suite is 21/21,
  including independent SDK export indexes in one process.
- SDK request-input validation: all 9 PASS after full observation reuse restored
  the existing 96-file/two-stat validation budget; `/tmp/sdk-gate-repairs-20261101.log`.
  The expected budget was retained, not relaxed.
- SDK export/request-input/transport/manifest combined checks: 32/32 PASS;
  `/tmp/sdk-index-current-focused-20261101.log`.
- Existing macOS interrupted-workflow test: focused PASS with native observation
  allowed, `/tmp/sdk-interrupted-fixed-20261101.log`. EPIPE is independently
  reproduced; the old interrupted report had no stderr, so its exact original
  race is not claimed as proven. Future null reports include stderr.

The first sandboxed full gate failed native process probes (`spawn EPERM`) and
was explicitly terminated. Its log is `/tmp/sdk-check-fast-20261101.log`.
The next complete native gate, before target/export integration, finished
2168/2171, zero skipped, exit1. Its three failures were transport interruption,
duplicate SDK witness facts and the explicit test-manifest count. Focused fixes
are above; the failed gate is retained at `/tmp/sdk-check-fast-native-20261101.log`.

## Installed SDK acceptance

Input: `/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony`, API24,
component version `6.1.1.125`, with the installed sibling HMS component.

The original 12-case installed acceptance passed before export-index integration.
The first 13-case integrated run finished 12/13: the DOM-isolation test rejected
any completion named `document`, although the SDK legitimately exports the
`@ohos.document` module. Its missing-global diagnostic remained code2584. The
acceptance now additionally resolves every such candidate and requires an
`@ohos.document` import edit, preserving both SDK discovery and DOM isolation.
Original failure: `/tmp/sdk-integrated-real-20261101.log`.

Final installed acceptance: 13/13 PASS, zero skipped/cancelled, exit0,
120333ms; `/tmp/sdk-final-real-20261101.log`. Command:
`ARKTS_REAL_SDK_PATH=/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony node --test tests/release/real-sdk.acceptance.mjs`.

## Final gate and delivery

Production source-tree SHA256 (sorted paths plus bytes):
`0a29091d84c5e51032b6e8f2b3ba780a557f588100af963bc63d0286d8ba2e3d`.
The integrated production code is frozen for native-permission `pnpm check:fast`,
currently running at `/tmp/sdk-final-check-fast-20261101.log`. The only later
executable edit corrects the excluded real-SDK acceptance assertion above; fast
source/test entries remain unchanged. Final full PASS is not claimed yet.

`git diff --check`: PASS. Every changed/new handwritten source, script and test
is <=500 lines except existing `typescript-language-service.ts`: 3072 -> 2985.
Cohesive SDK setup and completion ranking/import responsibilities were extracted;
the remaining over-limit file is explicit migration debt.

No Rust changes. Build invokes the existing release sidecar build. No SDK files,
missing vendor stubs, plugin execution, new Workers or test skips were added.
The SDK slice does not certify the independent 500ms/memory or editor UI targets.
