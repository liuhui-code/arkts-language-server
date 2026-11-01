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

The first integrated gate at `/tmp/sdk-final-check-fast-20261101.log` was
superseded and explicitly interrupted (exit1), not a completed acceptance run.
It reported one diagnostic-barrier failure. Its six isolated repetitions passed.
The harness pins both `serverRevision` and `serverInputSha256`; root commit
`9353449` at 05:11:35 UTC overlaps the failed test's approximate completion.
The exact failing assertion was not retained by the interrupted spec reporter,
so revision drift is a supported diagnosis, not a claimed complete reproduction
of that assertion. No timing threshold or correctness assertion was relaxed.
Root source/build changes later also invalidated this round's frozen input.
Final verification therefore uses a detached worktree at the final implementation
commit; root documentation commits cannot change its pinned HEAD or sources.

### Nested SDK boundary follow-up

RED parent: `93534495a36cd4f31229da008e3e0867d214531a`.
Command: `node --test --test-name-pattern='SDK nested' tests/semantic/hms-kit-resolution.test.mjs`.
An SDK installed inside its workspace resolved a relative declaration outside
its own component into `workspace/service.d.ts`. Log:
`/tmp/sdk-nested-boundary-red-20261101.log`.

The relative-boundary selector now checks selected SDK lexical/physical roots
before workspace roots, including physical aliases. Lexical SDK escapes fail
closed. Public transcripts protect both rejection and a healthy dependency
inside the nested component. The native Kit auto-import transcript also covers
a `.d.ets` source explicitly.

- Type check/build: PASS.
- HMS plus changed-source witness and SDK reference cache: 36/36 PASS;
  `/tmp/sdk-nested-inputs-20261101.log`.
- Final HMS suite including `.d.ets` auto-import: 24/24 PASS;
  `/tmp/sdk-boundary-final-hms-20261101.log`.
- Installed SDK after the boundary fix: 13/13 PASS, zero skipped/cancelled,
  exit0; `/tmp/sdk-boundary-real-20261101.log`.
### Declaration-closure follow-up

RED parent: `a6f7a265d5d8ae6100425d9f0dd90200815a5ece`.
`node --test --test-name-pattern='missing HMS declaration-relative' tests/semantic/hms-kit-resolution.test.mjs`
reported READY with `dependenciesComplete:true` although an HMS declaration's
relative import had no source. `/tmp/sdk-relative-missing-audit-20261101.log`.
`skipLibCheck` hides these declaration diagnostics; namespace missing imports
and type-reference directives require the same input treatment.

The pinned compiler adapter now reads its completed module/type-reference
resolution tables and actual Program membership. It checks parsed file
references as well. Modules without a physical resolution are accepted only
when the compiler binds that SDK import literal. A literal-name ambient lookup
was insufficient for wildcard modules: the public wildcard ambient regression
was RED at `/tmp/sdk-ambient-binding-red-20261101.log`, then GREEN using the
compiler's actual binding. This does not introduce a second resolver/binder or
prequery user positions.

Both project-readiness qualification and the SDK-only export index consume this
check. Stable missing SDK declarations remain partial with all six local
capabilities; local navigation stays healthy. Known Kit exports survive an
incomplete optional SDK index, whose completion result is marked incomplete.
No fake compiler diagnostic is manufactured.

- Type check/build: PASS.
- Final HMS, SDK runtime globals and input-validation suite: 49/49 PASS,
  zero skipped/cancelled; `/tmp/sdk-closure-all-focused-20261101.log`.
  The HMS suite contains 30 cases, including exact/wildcard ambient binding,
  three missing-dependency forms and SDK-only optional-closure failure.
- Final installed API24 acceptance after the closure fix: 13/13 PASS, zero
  skipped/cancelled, exit0; `/tmp/sdk-closure-real-20261101.log`.

The detached a6f7a26 candidate round was explicitly interrupted after the new
closure regression disproved its completeness. Its diagnostic-barrier test
passed with an immutable HEAD. It also exposed a worktree shell selecting
Node21.6.2: three GC-launch tests failed because `--expose-gc` is forbidden in
that version's NODE_OPTIONS. `/tmp/sdk-immutable-check-fast-20261101.log`.
No GC assertion was relaxed. The replacement full round explicitly pins the
same Node26.3.0 toolchain used by the root focused/real-SDK runs and uses the
clean detached worktree's independent build outputs.

Superseded full candidate: `af891668354a595655c20379ab78f836c1b24d92`, clean detached
`.bench/sdk-final-verification-20261101`, Node26.3.0, pnpm8.3.1 (the installed
CLI used by both root and verification runs; packageManager declaration remains
unchanged). Command: `PATH=/Users/liuhui/.nvm/versions/node/v26.3.0/bin:$PATH pnpm check:fast`.
Log: `/tmp/sdk-final-node26-check-fast-20261101.log`. This round has observed
failures and is retained as diagnosis evidence; it is not final acceptance.
At launch, root and verification production source-tree SHA256 (sorted paths plus bytes):
`0dc0eeda232ca1e47c93d832194b2f460cb881efb6bb9482fba8b2fa1787e430`. The verification HEAD, sources and build inputs remain frozen. Subsequent
SDK/harness fixes are made in the root checkout and require a replacement gate.

Delivery: [draft PR #111](https://github.com/liuhui-code/arkts-language-server/pull/111).
Root evidence-document updates are outside the immutable verification checkout.

### Multi-root replacement completion audit

The original plan named HMS-specific multi-root SDK replacement. Independent
static SDK isolation and single-root replacement were not sufficient evidence.
The public two-root transcript now also rewrites the first HMS Kit facade at the
same SDK path, performs ordinary selected-product configuration refresh, and
requires the new first-root Kit export while the second root still completes
and resolves its original public Kit import. Focused PASS:
`/tmp/sdk-multi-root-replacement-20261101.log` (1/1, zero skipped/cancelled).
No production source changed after af89166; the immutable integration gate's
source snapshot remains valid. The strengthened full HMS characterization passed 30/30 separately at
`/tmp/sdk-multi-root-final-hms-20261101.log`, zero skipped/cancelled, exit0.

### Full-gate repairs after af89166

- Real intermittent macOS RED: the second repeated interrupted workflow lost its
  report with `ENOTEMPTY` at `run-macos-e2e.mjs:87`, inside final cache cleanup.
  `/tmp/sdk-macos-interrupted-repeat-20261101.log`. This proves a separate cause
  from the independently fixed EPIPE case. A deterministic private cleanup fault
  reproduced the lost admitted report at `/tmp/sdk-workflow-cleanup-red-20261101.log`.
  The CLI now uses asynchronous recursive removal with maxRetries5/retryDelay100
  and retains cleanupFailure separately from the original request failure. The
  original and permanent cleanup-fault cases passed 2/2; the original interrupted
  case then passed 20/20 serial repetitions. Logs:
  `/tmp/sdk-workflow-cleanup-green-20261101.log`,
  `/tmp/sdk-macos-interrupted-stable-20261101.log`.
  Node's [documented recursive removal retry](https://nodejs.org/docs/latest-v26.x/api/fs.html#fspromisesrmpath-options)
  covers ENOTEMPTY/EBUSY/EPERM; no correctness threshold or deadline was relaxed.
- The old project-build fault observer counted the SDK-only Program as a project
  attempt and could consume a project fault in the wrong owner. The actual root
  list now selects the intended owner. All original 17 project recovery cases
  pass with their original attempt/lease assertions. New SDK before/after/checker
  faults preserve local service, mark completion incomplete, release all leases
  except the two intentional syntax pins, and recover SDK exports on refresh.
  A native incomplete-completion hint is not an index availability certificate:
  the pinned compiler sets it for unresolved auto-import specifiers too. Recovery
  is proved by the newly offered SDK symbol, not by clearing that unrelated hint.
- SDK release-after-effect RED: a real SDK index failure followed by an actual
  Registry release and injected exception never retired the uncertain Worker;
  `/tmp/sdk-index-cleanup-ownership-red-20261101.log`. The index now reuses
  ownedDocumentRegistry and quarantineCompilerOwner. Project recovery, optional
  SDK recovery, shared ownership faults and capability boundary checks pass
  27/27; `/tmp/sdk-owner-quarantine-green-20261101.log`.
- The static compiler gate now permits exactly one direct Program factory in the
  compiler-owned SDK index and still exactly one LanguageService factory. It
  continues rejecting unproven semantic rule providers and SDK index Workers.
- Existing public overlap cases were RED: an SDK ancestor widened a project
  boundary, and a workspace symlink inherited an external SDK boundary;
  `/tmp/sdk-boundary-overlap-red-20261101.log`. The selector now chooses the
  narrower physical owner while rejecting lexical workspace escapes. Selection,
  HMS and native input-proof cases pass 52/52;
  `/tmp/sdk-boundary-owner-final-20261101.log`.
- SDK regressions after owned-lease integration: 49/49 PASS;
  `/tmp/sdk-owned-index-focused-20261101.log`. Real SDK after that integration:
  13/13 PASS; `/tmp/sdk-owned-index-real-20261101.log`.
- The final af89166 report finished 2184/2198, exit1, with 14 failed cases:
  macOS cleanup1, compiler boundary1, project recovery observation7, overlapping
  source boundaries2, native-hash witness1, pre-Program deadline observation1 and
  target-switch completion completeness1. Duration4843785ms includes the stalled
  test-file process and targeted cleanup described above. This failed run is
  diagnosis evidence, not acceptance.
- Its native-hash error was `Unexpected end of JSON input` in waitForJson:
  the witness filename appeared before writeFileSync finished its payload. A
  private 150ms create-before-write delay reproduces that exact RED at
  `/tmp/sdk-native-hash-publication-red-20261101.log`. The writer now prepares a
  complete per-thread temporary file and atomically publishes it with an
  exclusive hard link. Readers never see a partial record; competing observers
  cannot overwrite the winner. Session cleanup is registered before directory
  cleanup. ContentModified -32801 and exact 5/6-location assertions are unchanged.
- SDK index construction previously inherited implicit @types/node discovery
  from the repository. Its rejected file produced compiler diagnostic2688 and
  incorrectly marked a complete ordinary target completion incomplete. The
  SDK-only Program now sets types/typeRoots to empty, while explicit SDK file
  and type references remain checked. Temporary diagnostic probes were removed.
- The index now shares the effective Host passed to the actual LanguageService,
  including Host wrappers, and its construction uses existing synchronize-phase
  observation. The original pre-Program watchdog assertions remain unchanged:
  execution-deadline, synchronize phase, zero Program starts and unchanged-input
  recovery. No timeout, recovery budget or initial exemption was relaxed.
- Converged public regressions for all repaired areas passed71/71, zero skipped
  or cancelled: SDK/HMS, original project and SDK fault recovery, native input
  publication, pre-Program deadlines and versioned target/overlay behavior.
  `/tmp/sdk-converged-regressions-20261101.log`.
- A positive member-completion characterization also confirms that an unrelated
  optional SDK export gap does not mark an already known member list incomplete.

Final implementation checks:

- SDK contracts, HMS31, globals, input validation, compiler boundary, manifest and
  EPIPE:57/57 PASS; `/tmp/sdk-final-contracts-20261101.log`.
- Actual installed API24 SDK:13/13 PASS, zero skipped/cancelled, exit0;
  `/tmp/sdk-final-owned-host-real-20261101.log`.
- Interrupted and permanent-cleanup-fault workflows:2/2 PASS;
  `/tmp/sdk-final-cleanup-20261101.log`.
- Type check/build:PASS. No temporary SDK diagnostic probes remain.

The replacement immutable full check starts only after this implementation/test
snapshot is committed. The old failed full run is terminal, not restarted under
the same log identity.

`git diff --check`: PASS. Every changed/new handwritten source, script and test
is <=500 lines except existing `typescript-language-service.ts`: 3072 -> 2985.
Cohesive SDK setup and completion ranking/import responsibilities were extracted;
the remaining over-limit file is explicit migration debt.

No Rust changes. Build invokes the existing release sidecar build. No SDK files,
missing vendor stubs, plugin execution, new Workers or test skips were added.
The SDK slice does not certify the independent 500ms/memory or editor UI targets.
