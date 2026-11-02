# PR112: cold-owner diagnostic precondition

Parent: `e69c7ebfbcbf0a6f015b837559b39201f7fdfd65`.
Main control: `c5577bb11900d7871d8c8e0ee9e1fb87eb1c169b`.
Environment: macOS, Node20.19.5, pnpm8.15.9, installed ohos-typescript4.9.5-r10,
the existing private query-layer SDK and framed-stdio production server/Worker.
This is not a real Zed UI or installed-SDK qualification.

During this review the remote PR independently advanced to `50317e4` with native
streaming/hash-first work. This correction is replayed above that commit without
dropping it. The frozen failure and54-test receipt below predate that integration;
they do not qualify its new native implementation. The combined head requires
its own release build, focused checks and complete CI before merge.

## Original failure and bounded controls

Unmodified `pnpm check:fast` finished2316/2317, one failure, zero
skips/cancellations/todos, exit1,3965256.325988ms. All2185 frozen tracked
inputs still matched before any correction. The failing assertion was
`assertColdOwnerRecovery`: a proof-only miss must precede creation of the
replacement owner after actual level3 eviction. Exact edited-reference results
had already passed for both declaration policies.

Three bounded replays of that same assertion with post-query evidence capture
failed3/3. Freshly built main, same fixture/toolchain and assertion, passed3/3.
Adding only a public initial-diagnostics completion barrier passed3/3 on the PR.
The snapshots are taken after the queried event array is captured; they do not
pause preparation or alter the request sequence.

The existing queue-trace switch supplied a separate causal observation:

| UTC,2026-11-02 | Event |
| --- | --- |
|17:13:37.565|context2 evicted for memory-level3, resident count0|
|17:13:37.567|Worker dispatches `diagnose`|
|17:13:37.573|diagnosis creates context3|
|17:13:37.597|foreground references enqueued|

The first diagnostic had completed; another initial diagnosis remained queued.
PR112's conservative dependent-diagnostic refresh makes that legal interleaving
observable on this Mac. The test cut its `actual` array after context3 creation,
so it found a miss but no subsequent create. This is a test precondition defect,
not evidence that the disposed context2 was reused. The Linux complete CI on
the parent passed2317/2317; that does not make this Mac failure disappear.

## Minimal correction and preserved behavior

Before the cold-query experiment, consume both real version1 diagnostic
notifications and verify they are clean. Then apply level3 pressure and retain
the original bounded eviction-event wait. The original miss-before-create,
no-resident-hit-before-create, complete compiler query, exact locations,
diagnostic and clean-close assertions remain unchanged.

A separate public transcript characterizes the other valid order: settle the
initial diagnostics, evict the owner, edit Use.ets to version2, wait for the
current diagnosis, then query both reference policies. It requires a new owner
before those queries, current exact locations, no reuse of the evicted context
and no replacement Worker. Diagnostic refresh is not disabled to make the cold
test pass. No product code, deadline, RSS policy, recovery budget or assertion
is relaxed; no timing sleep is added to establish the diagnostic boundary.

The new characterization passed before applying the repository test correction.
Its first draft omitted the original eviction-log observation wait and failed
before the scenario; that diagnostic-harness failure is retained separately.
An earlier copied harness accidentally rewrote an import inside fixture text;
its three syntax failures occurred before any server started and are not
counted as product reproductions. Both harness mistakes were corrected outside
the product tree, with their original evidence preserved.

## Verification and reproduction

```sh
pnpm check
node --test --test-concurrency=1 \
  tests/semantic/resident-first-edit-admission.test.mjs \
  tests/semantic/changed-source-read-witness.test.mjs \
  tests/lsp-dependent-diagnostics.test.mjs \
  tests/workspace-configuration-authority.test.mjs \
  tests/semantic/readiness-catalog-ordering.test.mjs
pnpm check:fast
```

Final local Node20 typecheck passed, followed by the five complete files above:
54/54, zero failures/skips/cancellations/todos, exit0,68111.947006ms.
This correction changes only this test file and this evidence record; it does
not change production inputs or the original assertions. The concurrent native
changes named above are separate inputs, not covered by this scoped receipt.
The complete new-head CI receipt is pending at commit time and will be recorded
in the PR review. Scoped success must not replace the original full-gate failure.
Raw maintainer-local evidence is under `.bench/pr112-review-20261103/`:
`check-fast.log`, `candidate-inputs.json`, `pressure-replays.json`,
`pressure-diag-*/`, `pressure-queue-trace.log`, `baseline-identity.json`,
`baseline-pressure-replays.json`, `pressure-drained-replays.json`,
`pressure-characterization.log` and `final-focused.log`.
These ignored files are local evidence identifiers, not repository download links.

This follows ADR0013's retained-failure and public-transcript evidence rules.
It does not change any ADR approval/status, the prior unexplained owner-count
or timeout findings, or open real UI/UNC/30K references/rename/endurance limits.
