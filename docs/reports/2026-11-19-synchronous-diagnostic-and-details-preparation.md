# NAV-PREP-001: diagnostic and completion-details preparation proof handoff

Status: two implementation slices verified locally; overall A-plan IN_PROGRESS.
No merge, release, daily Zed deployment or real UI claim. Parent1e3886df.
Evidence rootE: `.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.
Node20.19.5; compiler4.9.5-r10. Native800e6628 unchanged, including rebuild hash.

## Observed failure, hypotheses and causal boundary

Original isolated Photos30K replay returns exact results, but unchanged post-undo
definition10491ms and completion10106ms wait about7.4s before Worker send.
Epoch1 Worker diagnose9/18 had just started. Background requests are not bypassed
once running: ADR0027 deliberately preserves serialized checker ownership.

Ranked hypotheses: (1) preparation checks repeated outside shared operation scope;
(2) a new/larger Program is built for diagnosis; (3) foreground arrives after a
diagnosis starts and must wait. Queue trace proves(3). Existing progress counters
for diagnose9/18 remain Program/checker starts/returns4/4 throughout; this excludes
a new Program/checker creation in those commands, not semantic checking with an
existing checker or its CPU cost. Public controlled counts establish(1).
Do not attribute the entire wait to compiler work from a generic request phase.

## RED/GREEN: diagnostics

`LegacySemanticEngine.diagnose -> prepareInteractiveContext ->
ProjectOperationScopes.ensure -> ScopeDependencyGraph.update/currentNodes`, then
`SemanticTypeEngineRegistry.prepare -> diagnostics -> runPreparedSemanticQuery`.
Unlike existing navigation/completion-list entry points, diagnose did not establish
withSynchronousInputPreparation. Preparation helpers therefore could not hand
original observations into the actual query's validation union.

New child-process LSP test opens Main with an unsaved missing identifier, waits
for that exact version's2304, repairs it and edits again, checking diagnostics
clear.400 unrelated files make cost visible. Original public RED: membership raw
passes outside2/query1/final1, noise lstat1600. GREEN: prepare1/final1, noise
lstat800. No proof is valid across requests or across current/final phases.
Logs: `diagnostic-preparation-red01.log`, `diagnostic-preparation-green01.log`.

Implementation: `src/semantic/diagnostic-operation.ts` wraps only synchronous
sync/prepare/diagnostics/result mapping in existing preparation scope. Actual query
lease still owns independent final union. SDK/config/source authority and compiler
provenance remain unchanged. No scheduling, cancellation deadline, memory or
completeness threshold changed. Legacy engine delegates this cohesive operation;
631 baseline lines ->628 after both slices, remaining over500 migration debt.
DocumentStore1520 unchanged physical count is separate remaining migration debt.

## RED/GREEN: completion details

After diagnostic-only repair, details still7579.54ms with0.40ms supervisor wait: a
separate synchronous path, not diagnostic queue delay. Public local-class detail
requests confirm same outside2/query1/final1 -> prepare1/final1 and1600 ->800
noise lstat. Both repeated details return the actual class. RED
`completion-details-preparation-red01.log`; initial GREEN launch01 failed before
any test because of a mistyped test filename, not a product RED. Corrected
GREEN02 passes24/24.

`LegacySemanticEngine.resolveCompletion` now scopes its actual compiler branch.
Original reusable/preResolved namespace admission remains outside and unchanged;
this avoids memoizing an early-return path without a real query final fence.
No broad async Worker/Promise scope or generic scheduler was introduced.

Expanded final51/51PASS,0skip/cancel in
`completion-details-preparation-expanded01.log`. Includes public missing-error
appearance/disappearance, post-compiler final source change refusal and fresh
edit/list recovery, SDK-partial and READY, old handles/cancel/reopen, actual
Worker recovery, namespace rejection and finite diagnostic fairness. The prior
expanded37 attempt had36PASS/1manifest-countFAIL due to the newly added test entry;
manifest now explicitly includes it and exact entry/layer counts362/187. Recheck
37/37PASS. No correctness assertion or deadline was loosened.

Post-compiler races use test-only fixture arming after actual engine diagnostics
or resolveCompletion returns, then mutate a real unreferenced source at final
entry. The stale diagnosis publishes no version1 list; stale details return-32803
with no result. Fresh version2 inputs recover in the same Worker.

## Ordinary original Photos30K replay

All runs same isolated original source topology, SDK path, targetpicker53:20 ->
ScreenManager81:9-20, default closure, process cold / existing closed Native cache
warm. Each executes17 exact definition results, unsaved edit/undo, repeated undo,
close/reopen version1, cross-module navigation, member completion/details, and
actual indexed ScreenManager class/range verification. NOT UI/endurance.

| Stage ms | Controlc63ffd20 | Diagnostic-onlyf029887e | Diagnostic+details0f564c80 |
| --- | ---: | ---: | ---: |
|Initialization|86948|70991|70481|
|First definition|5354.90|4777.09|4865.09|
|Hot three-repeat median|2711.08|2631.72|2659.80|
|Post-undo unchanged definition|10439.97|5305.03|5361.54|
|Member completion|10492.55|5320.12|5429.68|
|Completion details|7456.97|7579.54|2777.47|

Control -> diagnostic-only pre-send definition wait7432.18 ->2655.54ms; completion
7581.49 ->2616.60ms. Details waits0.39/0.40ms. This supports reduced diagnostic
service time as the pre-send benefit, not a priority-policy change. Details then
benefits from its own preparation repair. One session per version, serial order,
OS cache not flushed, not a latency guarantee or a multiple-cold-start statistic.
The patched diagnostic operation does not execute during unopened initialization:
do not attribute the initialization difference to this change. Existing hot
navigation itself remains~2.6s; not solved by shrinking preceding diagnosis.

Control whole-run FAIL due to original60s SQLite postflight timeout, preserved.
Diagnostic-only and final runs both Native READY, SQLite integrity PASS and owned
processes CLOSED, while final semantic qualification remains partialSDK24/project20.
Full references/rename are not qualified or counted successful by this replay.
No OOM/guard incident. No default RSS budget or test stop limit reinstated.

Exact raw paths: `diag-preparation-{control,candidate}01/`,
`synchronous-preparation-photos01/`; summaries
`diagnostic-preparation-photos-pair-summary.json`, input pre/post manifest in
`diagnostic-preparation-photos-pair.json`. Driver initial hashing failure occurred
before server launch; failed script/log retained as harness-failure01.

Postflight full30000 source hash matches pair-start
abbc3d8681ee75ddb8220f73d4bfeb4ebcd9db76998d60bc5c5a0b442a4eb393.
3955 prior SDK declaration/metadata path hashes unchanged from Nov17 snapshot;
not3955 actual parsed files or exhaustive discovery of newly added SDK paths.
`synchronous-preparation-input-postflight.json` records scope and timestamps.
Final Worker0f564c805ce65e2e8cf2c393f162b16b1fd14a7ec881e8258ff54803e3c10da2;
310product source hashes verified; Native unchanged800e6628.

## Remaining verification and work

Latest whole pnpm check:fast RUNNING, evidence
`synchronous-preparation-checkfast.log`, session92248. Typecheck/build completed;
normal runner also performed native release build17.89s, same800e hash, no Rust
source changes. No complete-check success claimed. Current/final proof cost,
20K original5s references failure, M4/M5 remainder, larger complete-SDK axes,
Photos initialization and hot latency, Windows/UI/endurance remain open.
Other synchronous semantic entry points still need evidence-based audit; do not
assume all now share preparation or wrap asynchronous work as a shortcut.


Terminal update: session92248 ended FAIL2681/2682,0skip/cancel. Only prepared
restart report identity assertion failed; source310hashes unchanged, possible
git-status contamination investigated on preserved frozen recheck and isolated
report copies. Original fullcheck remains FAIL. Subsequent hover/signature/
completion extraction candidate041bd03a has targeted41/41 and32/32, not that whole
check. [Follow-up](2026-11-19-inspection-preparation-and-checkfast-followup.md).
