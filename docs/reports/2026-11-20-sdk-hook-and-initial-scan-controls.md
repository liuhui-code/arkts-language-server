# SDK fault-hook compatibility and initial-scan registration-gap controls

Status: targeted validation GREEN; overall A plan remains IN_PROGRESS. No merge,
push, deployment or UI/endurance claim. Product Worker remains
`7b7b8584e9396c1635b8e002385d077633c0f9a6ee9a3254611c5ea4e269da77`.
Evidence E is primary repository
`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.

## NAV-TEST-HOOK-001: fixture startup fails before its SDK scenario

The frozen original whole run reports seven failed scenarios in
`changed-source-read-witness.test.mjs`: diagnostic-discovered source changes,
source-forced replacement, and unnotified namespace recovery. Each waits for
initial preparation, while Workers exit/recover up to the existing bounded
restart budget. These are not seven independent SDK defects.

The private preload `sdk-diagnostic-source-mutation.cjs` searched for the exact
five-argument createOfficialSemanticService declaration. The shared official
factory now accepts an optional language-service mode to serve the actual owned
syntactic service. The old literal occurs zero times, so the preload throws
`unique SDK replacement constructor hook required` before executing the Worker
module. No source-mutation arm has been written yet and the intended SDK scenario
has not started. The bounded recovery events alone are not evidence of OOM.

` sdk-constructor-hook-red01.json` replays the actual private preload's compile
adapter in a real Node Worker against the frozen artifact text and reproduces
that exact throw. The product body is intentionally not executed by this adapter
probe; it cannot substitute for the public semantic scenario. The proposed hook
matches the uniquely named function header independently of its argument count,
then inserts the same fault at the same constructor entry. Zero or duplicate
headers still fail closed. Current six-argument mode header, legacy five-argument
header, absent and duplicate controls are retained in
`sdk-constructor-hook-green01.json`/`sdk-constructor-hook-controls01.json`.
No product error is swallowed, no freshness assertion or timeout changed.

## Isolated fixture-only candidate and public regression

To keep the original whole run frozen, its complete current diff and untracked
inputs were copied to `/private/tmp/arkts-hook-fixed-candidate-20261120`, detached
at the same parent `1e3886df3c4d27755a53c073462f1456b0a3de7e`.
`sdk-hook-fixed-worktree-identity.json` proves1020 source/test/script inputs equal
before the fix, and ONLY the fixture file differs immediately afterward. Runtime
artifacts were copied unchanged, no product rebuild. Fixture SHA
8708a6a3→55c4ba29. The old worktree and original failures remain untouched.

From the new worktree, Node20.19.5:

```sh
node --test --test-concurrency=1 tests/semantic/changed-source-read-witness.test.mjs
```

`sdk-hook-fixed-public01.log`:24/24PASS,0skip/cancel,33131.37ms. This is the full
file, including its context-evidence helper tests, not24 separate SDK scenarios.
All seven formerly failing public LSP scenarios now really execute their original
source/SDK mutation, constructor-window failure, unchanged rejection/recovery and
completion oracles. The old whole run was concurrently still collecting results;
this is functional regression evidence, NOT an isolated performance sample.

## Actual initial strong scan versus late/rejected registration

The prior M5 tests changed source only after initialization and a warm query.
A new private gate pauses the first actual complete strong membership scan after
capture and before publication. While client/registerCapability is still pending,
the parent edits Global.ets or moves it to MovedGlobal.ets and prepends a newline,
without a watch event. It then accepts/rejects the actual registration and releases
the scan. The gate is bounded10s for fixture safety, not a product deadline change.
No compiler answer, stat or readiness report is fabricated.

External characterization `watch-initial-scan-gap-direct01.log`:4/4PASS. The new
fixture and four cases are now in repository
`tests/fixtures/watch-initial-scan-gap.cjs` and the already registered
`tests/semantic/watch-registration-input-lifetime.test.mjs`.

Repository test plus layer manifest:12/12PASS,0skip/cancel in
`watch-initial-scan-gap-repository01.log`. Its first collector import still pointed
to the prior worktree's LspSession, so wire capture for that run is absent; public
assertions remain valid. A collector copy bound to the actual new support module
was then used to rerun the eight public watcher cases:
`watch-initial-scan-gap-repository02.log`:8/8PASS,0skip/cancel,11318.90ms;
8 retained sessions/124 parsed framed messages, four captured/released original
scan event pairs in `watch-initial-scan-gap-repository-capture02/` and its summary.
`capture-readiness-hook-fixed-identity.json` records the collector's only import
path change; no protocol observation behavior changed.

Every controlled initial scan case asserts no stale location, exact new line1
range, new URI after move, subsequent exact query, one semantic Worker and clean
shutdown. READY in these100-source numericAPI24 fixtures is actual minimal-SDK
coverage, not real Photos SDK completeness. Capture/program counts are raw logs;
no cross-process clock subtraction or standalone latency benefit is inferred.
The old whole run overlapped, so recorded request durations are not performance
acceptance. Successful controls do not justify a new blind root reset at ACK.

## Limits and next verification

No native watch provider/overflow signal was invented. OS event loss, remount,
Windows junction/case and real UI/reconnect still require their own evidence.
No source/configuration freshness contract changed; current/final disk fences
remain necessary. The new cases characterize recovery, not proof all watcher
failures are handled. The final SDK/Photos/API20 gaps remain separately open.

The old full check is still running with the seven old-hook failures at this
update; it is NOT green and the test changes are NOT covered by it. Let it finish
collecting other failures. Reconcile unexpected failures, then run remaining
serial performance/scale controls before the final complete check on the final
new-worktree snapshot. This avoids presenting the prior full run as a gate for
new tests or repeatedly running whole gates before further planned tests land.

## All five consumers of the SDK fixture requalified

The old whole run later exposed additional startup failures in readiness catalog
call hierarchy, cancellation, input-window and ordering tests. Each also loads the
same SDK preload; they are additional affected records, not automatically new
product defects. A repository search found exactly five semantic files using it.
All five were rerun, unchanged, in the fixture-fixed worktree:

```sh
node --test --test-concurrency=1 \
 tests/semantic/changed-source-read-witness.test.mjs \
 tests/semantic/readiness-catalog-call-hierarchy.test.mjs \
 tests/semantic/readiness-catalog-cancellation.test.mjs \
 tests/semantic/readiness-catalog-input-windows.test.mjs \
 tests/semantic/readiness-catalog-ordering.test.mjs
```

`sdk-hook-all-callers01.log`:38/38PASS,0skip/cancel,65167.57ms. This includes the
helper tests already counted in the24-case file; do not add24+38 as independent
coverage. Real SDK/source mutations, actual entered-scan cancellation, original
catalog authority windows and exact unopened call-hierarchy targets all retain
their original assertions. Full framed sessions/logs/mutation evidence are retained
in `sdk-hook-all-callers-capture01/` through the collector bound to the actual new
worktree. The old whole run overlapped; none of these durations is a performance
comparison. There is still no final whole-check PASS on the new test snapshot.
