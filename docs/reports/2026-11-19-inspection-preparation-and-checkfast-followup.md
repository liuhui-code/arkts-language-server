# Inspection preparation handoff and complete-check follow-up

Status: IN_PROGRESS A-plan; no merge/deploy/UI claim. Extends NAV-PREP-001.
Worktree `/private/tmp/arkts-binding-input-delta-20261119`, parent1e3886df.
EvidenceE: main repository `.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.

## Completed whole check on prior0f564c80

`synchronous-preparation-checkfast.log`, session92248 terminal exit1:
2682tests/2681PASS/1FAIL/0skip/cancel/todo,4075582.121337ms. Original20K completion
and full references case passes unchanged; prior path/group/proof failures do not
recur in this check. This is not a GREEN complete check.

Only failure: prepared-suite-restart-cli.test.mjs:249 expected wrong-request-process
REQUEST_BINDING rejection, but obtained PROCESS_SEGMENT_REPORT_IDENTITY_INVALID.
Validator compares canonical schema/PID, inputIdentity, targetPool and environment;
environment includes current serverWorktreeStatus. New untracked reports were
created after whole check started. This can contaminate that comparison despite
unchanged310product source hashes. No more worktree mutations occurred after the
inflight audit; the exact earlier reports were already cleaned by fixture cleanup.

Frozen selected recheck with generated evidence retention passes original
assertions:1PASS/8not-selected. Both canonical reports' environment, inputIdentity
and targetPool match the composite. On isolated copies, original report PASS,
wrong process ID alone gives REQUEST_BINDING_INVALID, and changing only one
canonical serverWorktreeStatus (updating artifact bytes/hash honestly) plus that
wrong ID reproduces REPORT_IDENTITY_INVALID. Query row retained. This proves a
mechanism/rejection-order counterexample, not the exact historical differing
field. Original complete-check failure remains FAIL, not relabeled as a product
fix or a whole GREEN. Next complete run must freeze the entire worktree, including
new report filenames, until terminal. Validator/assertions were not modified.

Evidence: `prepared-restart-frozen-recheck01.log`, archived generated canonical
reports in same directory, `prepared-restart-environment-control01/control-summary.json`,
reproducible scripts `capture-prepared-restart-evidence.cjs` and
`check-prepared-environment-control.mjs`. Retention only copies generated temporary
fixture top-level files; no user project data or installed processes touched.

## Hover and signature help: independent public REDs

Both legacy methods synchronized and prepared outside the existing synchronous
operation scope, like the earlier diagnosis/details gap.400noise sources:
actual hover/signature result correct, but member raw passes outside2/query1/final1
and noise lstat1600. Direct framed child-process regressions require exact class
information and two distinct current/final raw passes. Formal RED logs:
`hover-preparation-formal-red01.log`, `signature-preparation-formal-red01.log`.

Each synchronous method now uses withSynchronousInputPreparation around its
sync/prepare/compiler operation. No await is inside. Existing lease final union
clears observations and checks original inputs independently; source byte-load
guards remain raw. No new cache, metadata authority, priority or timeout policy.
Hover expanded39/39PASS; final hover/signature/cancellation/final-member/fairness
expanded41/41PASS,0skip/cancel; typecheck/build PASS. Existing final-member tests
include whole-group READY and projected SDKpartial, weak IDs and late source/SDK
changes; no reduced assertions.

## Cohesive completion extraction while GREEN

List/detail planning, namespace early return and compiler branch now live in the
existing completion-operation.ts. One CompletionPorts factory supplies the same
Legacy Store/group/profile callbacks. Actual resolver ownership and preResolved
admission order are preserved; cached admission remains outside compiler scope.
Characterization GREEN before refactor;32/32 after, including lifecycle, namespace,
real cancellation, candidate batches, auto-import completeness and arbitration.
Typecheck/build PASS. Legacy613lines versus631parent, remaining migration debt;
completion module137lines. DocumentStore1520unchanged remains migration debt.
No Rust changes; Native800e6628 unchanged.

## Ordinary Photos30K method comparison

New driver `inspection-photos-probe.mjs` adds three unchanged hover and signature
queries on original picker target ScreenManager.getInstance after four exact
definitions, before the unchanged edit/undo/close/reopen sequence. Method-specific
positions and full responses retained; actual getInstance signature required,
not just a non-error or null. Original product deadlines/guards and60s SQLite
postflight retained. This is protocol, NOT real UI or formal endurance.

Control runtime0f564c80 (diagnostic/details repair already present) versus new
041bd03ad1e69cb237c77e4f615e2d27390617e08721f1cd974c92a65e346743:

| Operation | Control raw ms | Candidate raw ms | Median control -> candidate ms |
| --- | --- | --- | --- |
|hover|8268.85/7333.50/8132.65|3053.60/2862.77/2614.98|8132.65 ->2862.77|
|signatureHelp|7328.25/7375.71/7556.55|2747.43/2626.11/2914.72|7375.71 ->2747.43|
|hot definition|2603.71/2600.93/2641.23|2584.87/2649.23/2637.40|2603.71 ->2637.40|

One serial process per version, three within-session samples per method, not
three independent cold starts or a latency guarantee. First definitions4679.24
vs4714.83ms; initialization71093vs70590ms. No claim of improving initialization or
the already-shared definition path. Remaining~2.6s disk/proof work is not solved.

Each run28LSP request rows (includes initialize/shutdown),17exact definitions,
6actual inspection results plus original completion/details and indexed class
verification. All30000 source files' combined hash unchanged before/after:
abbc3d8681ee75ddb8220f73d4bfeb4ebcd9db76998d60bc5c5a0b442a4eb393.
SDK path/API24/project20 unchanged; remains partial29995semantic members, full
reference/rename qualification not tested successful. Prior3955SDK path hashes
were verified separately, not actual parsed count or per-request SDK hashing.

Candidate Native30000 READY, SQLite integrity PASS, owned processes CLOSED, no
resource incident. Baseline FAIL original SQLite60s timeout is preserved; series
COMPLETED_WITH_FAILURES. `inspection-preparation-photos-pair-summary.json`, per-run
result/full requests/wire/queue/worker/resource logs and reproducible controller
retain this distinction. No memory thresholds reinstated or product limits changed.

## Remaining

No complete check yet on new041bd03a. Other synchronous semantic entry points
(document symbols/highlights/inlay/call-hierarchy/actions/global operations) need
actual cost/ordering audit, not an assumption that all share now. Formatting and
folding do not automatically need compiler preparation. M4 remainder, M5 watch
registration/recovery, larger actual dependency controls, initialization/hot
latency and Windows/UI/endurance remain. Windows read-only SSH still timed out.
No overall completion or release/merge gate acceptance claimed.
