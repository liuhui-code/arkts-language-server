# L01 legacy references Program trace — real-LSP TDD

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
Scope: default-off observation only. Production references routing, compiler working
set, context retention, worker count, memory thresholds, diagnostics and result
semantics are unchanged.

Public RED command:

```sh
node --test --test-name-pattern='legacy references trace post-query Program identity' tests/semantic/semantic-context-lifecycle.test.mjs
```

The first test attempt failed for a test-only comparison error: two independent
temporary workspace URIs were compared without normalization. After fixing that
comparison, RED was genuine: two complete exact `textDocument/references`
responses and normal diagnostics succeeded, but the expected
`semantic.references.complete` events were absent (`0 !== 2`, exit 1).

Minimal GREEN: the existing compiler timing collector now wraps the legacy
references query only when `ARKTS_REFERENCES_TRACE=1`; the Program/source-file
statistics probe runs **after** the query. The same real child-process test is
1/1 PASS. It checks the original class's three exact Locations, a previously
unqueried `value` symbol's one exact Location, trace-on/off result equality,
trace-off event absence, and same post-query Program sequence for the two
unmodified-snapshot requests. Full lifecycle file: 17/17 PASS.
An exception in the optional post-query stats/logging observer is isolated
from the already-completed compiler result; a compiler query exception is not
swallowed.

`durationMs` measures the compiler references callback, not complete LSP
latency. `createProgramEvents` counts grouped fork trace records, not exact
Program constructions. `programSequence` identifies a Program object only
within one worker isolate. The post-query stats probe calls the Language
Service's `getProgram()` and may perturb later **trace-on** timing. Product
latency and RSS gates therefore remain trace-off/external-sampler measurements;
this instrumentation alone does not prove a 500 ms result or safe residency.

## Optional collector failure isolation

After the first L01 replay was frozen, review found a narrower safety hole:
`PerformanceDotting.getEventData()` could throw **after** a successful query
and convert its complete LSP response into an error. The same source module's
collector is fault-injected in the closest test; no production fault-injection
flag is added. Initial RED command:

```sh
node --test --test-name-pattern='compiler trace collector failure' tests/semantic/semantic-context-lifecycle.test.mjs
```

RED exit 1 exposed `collector failed after query` instead of the completed
`"exact"` value. Minimal GREEN isolates optional setup, collection and cleanup
from query execution: a failed collector leaves `durationMs` measurable but
marks `collectorAvailable=false` and compiler phase fields `null`, never zero.
A compiler query exception still propagates unchanged. Fault-injection 1/1,
real-LSP legacy two-symbol trace 1/1, full lifecycle 18/18, `pnpm build`,
`pnpm check` and `git diff --check` pass. The real-LSP transcript verifies
normal compiler operation; synthetic collector failure is tested at the helper
because forcing that failure through stdio would require a production test hook.
The earlier Settings L01 artifacts are pinned to their pre-fix server build;
do not relabel their timing or memory measurements as results of this build.

Validation of the final source: `pnpm build`, `pnpm check`, and the focused
public trace test pass. One sandboxed `pnpm check:fast` attempt was stopped
after multiple unrelated process-sampling/replay failures (exit 130), so it is
**not GREEN**. Three focused read-only reruns with macOS process inspection
available pass: repository bundle/CLI 3/3, prepared-suite catalog-ready 1/1,
and declaration-façade external RSS 1/1. The whole fast gate remains NOT_RUN
for the final post-query observer-isolation edit; these focused reruns do not
replace it.

## Post-query checker identity (2026-10-06 follow-up)

Parent HEAD remains `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`;
the preceding L01 trace changes were already in the working tree. A public
real-LSP assertion first required two previously unqueried exact reference
responses to expose the same positive `checkerSequence` alongside their
`programSequence`. The focused command above with
`--test-name-pattern='legacy references trace post-query Program identity'`
failed (`exit 1`): `checkerSequence` was absent, not a Location mismatch.

Minimal GREEN adds a trace-only WeakMap identity for the `TypeChecker` returned
by the **already observed, post-query** Program. No getter is called when
`ARKTS_REFERENCES_TRACE` is off; an observer getter error reports sequence 0
without replacing the completed response. The same focused real-LSP test is
1/1 PASS; the full lifecycle file is 18/18, `pnpm build` and `pnpm check`
PASS. `programSequence` and `checkerSequence` are isolate-local observations
after each query, not zero-interference proof of the objects used *inside* the
query. The extra getter can perturb later trace-on timing and memory; release
latency/RSS remains trace-off with external sampling. Existing pinned A/B/C
measurements before this change must not be mixed with the new build.

The current Settings/API24 [unsaved-edit trace](../reports/2026-10-06-resident-l01-unsaved-reference-edit.md)
falsifies the small fixture's extra assumption that a post-query Checker object
must stay identical whenever the Program object does: before editing,
`programSequence` stayed 1 while `checkerSequence` changed 1→2. The real
request remained exact. The test therefore retains only the positive,
trace-only field contract; it no longer asserts Checker equality. This is a
measurement-boundary correction, not a change to ArkTS query behavior.
The corrected real-LSP trace test passes 1/1 after `pnpm build`; `pnpm check`
passes. The focused public safety command below passes 3/3, but its L3 and
cancellation cases use a small fixture and opt-in batched resident path, not
the current Settings/legacy L01 session:

```sh
node --test --test-concurrency=1 \
  --test-name-pattern='level3 disposal invalidates resident reuse|a cancelled resident request publishes no partial result|legacy references trace post-query Program identity' \
  tests/semantic/references-batch-search-coverage.test.mjs \
  tests/semantic/semantic-context-lifecycle.test.mjs
```

The first two cases cannot close L01's real-Settings cancellation/L3 gates;
queue-start cancellation also does not prove a synchronous compiler call can
be interrupted. The trace-on Settings run remains an immutable diagnostic
artifact from before this correction.

## Public replay tests in the fast layer

The new implementation-discovery and L3-recovery CLI tests were initially
unclassified. On parent HEAD `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`,
`node --test --test-name-pattern='classifies every executable test entry exactly once' tests/test-layer-manifest.test.mjs`
failed with both discovered test paths lacking a layer (exit 1). The minimal
GREEN adds both to `unit-contract` and updates the explicit 147→149 total and
75→77 unit count, without changing test selection rules. The same focused
manifest test is 1/1 PASS; full `check:fast` remains unclaimed.

## Current-tree regression gate (2026-10-06)

After the L01 prepared-suite, oracle-discovery and cancellation-control CLI
changes were included in the explicit fast test manifest, the current dirty
worktree ran `pnpm check:fast` to completion: **1,291/1,291 PASS**, exit 0,
zero failure/cancellation/skip/todo. The six-file focused public command for
those CLIs, the manifest and the semantic lifecycle passed **58/58** before
the full run. `git diff --check` passed. This supersedes the earlier
`NOT_RUN` statement for the current tree only; it is not a real Settings
500 ms, semantic-ready, long-run RSS/PSS or release gate.
