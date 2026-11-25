# Current candidate cost attribution: remaining initialization and hot-query cost

Status: frozen3f full check completed2732/2732PASS, zero skip/fail/cancel.
No product edit occurred during that gate. Remaining performance work IN_PROGRESS. No main integration,deployment or UI/endurance claim.
Current Worker3f9a6af3535725b40941b566fd361f48b9aa5e56741e8ecc0f498d0613ee4463,
parent1e3886df3c4d27755a53c073462f1456b0a3de7e,Node20.19.5,Native800e6628.
Evidence E is primary repository
`.bench/repeated-query-proof-plan-20261117/implementation-20261118/`.

## Observations to explain

Current fixed-closure final series15/15PASS atN128/2048/8192/20000/30000,
actual definition Program16. Hot medians54.11/101.29/250.95/564.56/832.21ms.
Init medians2228.90/3242.06/6320.53/12448.42/17938.71ms. Historical same-source clean
parent initializer1932.97/2946.58/5944.93/11491.77/16159.50ms. Cross-batch observation,
not randomized matched evidence. Do not call all initializers faster because the
separate Photos pair improves91.10→79.09s. Actual30K Photos repeated definition
still2.76–2.87s and undo-repeat tail5.69s; not resolved by passing correctness.

## Ranked falsifiable hypotheses

1. Initial pure role/graph/proof maintenance adds work. Prediction: initial.contexts/
   groups.preparePartialWorkspace/scopes.ensure/role or proof spans account for the
   increased post-first-Program interval; their counts vary withN.
2. Hot total-member growth remains in raw proof and/or derived traversal. Prediction:
   no-change hot commands show nonzero N-scaled member/fact calls despite no new
   Program/checker; diagnostic distinguishes raw leaf I/O from pure repeated work.
3. Initialization and interaction do not prepare the same member range. Prediction:
   initial admitted scripts/actual Program observations differ from queriedP16;
   cannot infer init workload from definition telemetry alone.
4. Batch/OS cache/load differences cause some apparent initialization regression.
   Prediction: same-batch ordinary controls move materially relative to historical
   data,while diagnostic-only spans do not account for the apparent delta.

These are not findings of root cause. Ordinary and instrumented time must remain
separate; child inclusive spans cannot be added to parent spans.

## Existing telemetry narrows the location

`scale-controls/initialization-existing-evidence01.json` extracts original logs,
not a new run. Both30000-source round1 samples admit0 SDK-owner project scripts,
then256 scripts in the later root preparation. Observed command1 cumulative
counters in both are Program1return1/checker1return1/synchronize2return2. Scripts
admitted is not an AST parse count; the last progress sample has terminal0,so
sampled counters alone are not a complete terminal census.

| Boundary (wall timestamp interval,within one run) | Historical parent | Current3f |
|---|---:|---:|
| init start→first observed Program return |6.868s|6.988s|
| that sample→initialization complete |9.864s|10.910s|
| server logged init duration |16.732s|17.897s|

This localizes most of this one-pair increase after the first observed Program
return,not within that initial compiler construction. It neither proves repeated
Program construction nor assigns the interval to one function. Wall timestamps
and sampling precision limit the split; these are disjoint elapsed intervals,not
CPU self-time. Parent/current real Photos scope and synthetic scope remain distinct.

Relevant call chain: project-readiness.ts:prepareProjectReadiness →
DocumentStore.prepareRoot → TypeEngine.prepareInitialGroups →
initial-semantic-contexts.ts:prepareInitialSemanticContexts → SDK owner synchronize →
SemanticGroups.preparePartialWorkspace → ProjectOperationScopes.create/ensure →
role/binding/dependency construction → projectSourceNamespace and
queryWorkspaceReadiness/queryOfficialReadiness → original/final input validation.
Partial SDK means honest available capability reporting,not permission to skip
membership/provenance or synthesize READY. Each candidate hypothesis must be
verified with actual spans before assigning the10.91s balance.

## Diagnostic adapter requalified on actual current artifact

The existing m4-current-cost-observer's exact final-union hook predates the
completedFinalMemberships initialization. Static compatibility rejects it before
Worker execution (`current3f-cost-observer-compatibility01.log`). Keep this RED.
A separate m5-final-cost-observer.cjs includes the actual initialization line
inside its measured wrapper,retaining it exactly once. The original observer and
runtime are unchanged. `check-final-observer-compatibility.mjs` verifies transformed
syntax and exactly one completion-state initialization. Compatibility02 PASS;
original hash3f9a6af3,diagnostic transformed hash72b0ec14. This is not product
execution or proof of equivalent performance.

`current3f-cost-observer-calibration01.log`:one public framed-LSP calibration PASS,
zero skips. Initialization+three type definitions return exact GlobalThing range,
one owner closes normally. Span labels include raw membership/configuration,
role/binding/graph,SDK,Registry,Program/checker/synchronize and final union. All
self-times are checked nonnegative within floating precision. This small fixture
ran while final whole check was collecting correctness; its durations are NOT
performance samples. It does not replace a30K diagnostic or query-output checks.

## Next controlled measurement

`post-whole-cost-series01.mjs` waits for actual final check02 PASS and unchanged
source/artifact identity. Then sequentially runs same3f ordinary-before,diagnostic,
ordinary-after on original frozen30K input/SDK and closed warm Native catalog.
Each uses initialization,first andthree identical hot definitions,exact range,
Native terminal,DB60s integrity and process closure. No overlay sequence in this
series; no claim that it retests13overlay actions. Output directories are unique;
failures are retained and halt further load. Normal default product deadlines and
resource protections remain; only earlier testNode2GiB stop waiver is inherited.

The diagnostic emits nested inclusive/self spans and separate API/count summaries;
ordinary neighbors measure probe disturbance rather than subtracting a guessed
percentage. Source/SDK before/after checks retain prior3955 SDK identity paths;
new unrecorded SDK additions are not exhaustively scanned. Full gate FAIL stops
this series for diagnosis. Genuine closure/depth/fanout/SCC and volume/density
experiments plus Windows/UI/endurance remain necessary; no completed goal claim.

## Descriptor and filesystem timing calibration

A sharper public calibration first fails with the previous diagnostic adapter:
`current3f-cost-observer-fd-red01.log` reports no observed descriptor guards.
That is an observer coverage gap,not proof product checks are missing.
The separate m5-filesystem-cost-observer.cjs adds fstatSync/closeSync counts,
tracks intercepted openSync descriptors to their paths until close,and measures
filesystem calls as children of existing proof/compiler/role spans. Unmapped
numeric descriptors remain other,not guessed as project or SDK. It preserves
synchronous return/throw behavior and raw call arguments; no product edit.

`current3f-cost-observer-fd-green01.log`:same exact public query/self-time oracles,
plus descriptor/physical-call span assertions,1PASS/0skip. The four actual commands
observe742fstat calls,420project fstat calls and38filesystem span keys. This is
calibration coverage only,not30K call estimates or a performance comparison.
`current3f-descriptor-observer-identity01.json` pins the adapter/probe hashes.
The waiting cost series was updated before any run started to use this measured
adapter; original observations/red logs remain. It can now distinguish measured
physical-call child time from exclusive proof bookkeeping. Ordinary neighbors
still quantify instrumentation disturbance; nested FS operations must not be
summed twice. Parent Native internal I/O and unwrapped functions remain unmeasured.

For V04,existing density38 generators and exact oracles can be reused instead of
creating another fixture format. `density-fixture-reuse-audit01.json` verifies six
2048-source fixtures:16/64/512KiB single-target volume with3references,and fixed
256KiB target with3/128/2048references. All12288source hashes match original
manifests,including no additional files. Historical97PASS is not current3f evidence.
The one-literal byte axis does not model control-flow complexity; reference density
also changes AST nodes. Current runtime execution/actual Program counts remain open.

## V04 replay queued with existing driver

`post-dependency-density01.mjs` waits for the actual graph matrix COMPLETE,then
reuses density38/session.mjs without changing it. Six previously characterized
cells xthree paired rounds xtwo versions xtwo application-cache states =72serial
sessions,alternating candidate/parent version order. Fixtures remain original and
hash-checked before/after each session. Index caches and logs use new unique
paths; original evidence/caches are untouched. First process uses new application
cache,second process reuses that closed cache; neither means OS page cache cold.

Runtime-main clean parent and current3f use the same Native800e and SDK root. All
runtime asset hashes are checked by the existing session at entry/exit; exact
completion/definition/reference/import-local+origin rename/edit/undo/reopen oracles,
DB60s integrity,process closure and existing resource stops stay unchanged. Any
non-PASS/error/guard stops new load and retains the failed sample. Actual
semantic.definition.complete Program counts are required; static closure2 is not
asserted as actualP2. This older standalone fixture may use a different project
scope from Harmony Photos; reports must preserve that distinction. Its original
45s external response/90s preparation observation remain driver-specific,not new
product deadlines. Other current series retain their own documented driver scope.

The replay has NOT executed at this update. Do not add its72 planned sessions or
the historical97passes to current acceptance counts. Profile/audit mode is disabled
for these ordinary comparisons; queue telemetry remains exactly as in the reused
session. Current root,code,SDK,actual Program,cache state,raw operations and resource
results are retained separately per run. Node RSS stop waiver remains; no default
RSS budget/V8 policy/product timeout changed. Existing fixed-closure15PASS and
current full-check logs remain independent evidence.

## Final observer coverage and corrected calibration seams

The waiting cost probe now pins m5-cache-cost-observer-v4.cjs in
`current3f-final-observer-identity03.json`. Static syntax/final-state verification
and public type-definition calibration PASS; actual service callback measurement
first RED,then GREEN (`current3f-cost-observer-finder-{red,green}01.log`). Callback
wrapping is at TypeScriptLanguageServiceEngine.definitionCandidates' actual passed
function,not by mutating a recoverable LS Proxy's methods. Its inclusive time
includes service synchronization; nested synchronize/FS children remain separate.
Small hot callback0.63/0.33ms is calibration only,not a30K estimate.

Plain fs.realpathSync was missing from the old native-only adapter. Source-boundary
fallback uses that public API. `realpath-api-red01.log` proves the gap in a real
Node Worker; green01 observes both default/native API calls,identical resolved
paths,and preserved native property. These are Node API invocation counts and
elapsed times,not counts of OS syscalls or physical disk waiting. Final public LSP
calibration03 and finder-green01 retain exact locations and nonnegative nested
exclusive elapsed spans. selfMs is not CPU-sampling self time; GC remains unmeasured.

Metadata cache probes now distinguish sourceIdentity entry/known/borrowed/read
callbacks,configurationIdentity entry/known/read,reservation accept/overflow,and
provisional regular observations offered/retained plus current/final consumers'
hit/ineligibility reasons. Logical accounting bytes and pending/value entry peaks
are observed at reserve/retain/consume boundaries,not actual heap/RSS. Provisional
retention before owner completion does not establish authority. Wrong-phase
ineligibility deliberately preserves independent final guards and is not an error.

The first cache calibration attempt used definitions but asserted a references-only
consumer. `current3f-cost-observer-cache-green01.log` remains FAIL:the seam did not
invoke requestFileIdentity; configuration/cache gauges were present. It is a
calibration-coverage mistake,not a product cache defect or grounds to loosen checks.
A real resident-reference seam then retains exact3locations and clean closure:
`cache-reference-calibration-{red,green}01.log`,followed by alternate-consumer RED/
GREEN `cache-regular-calibration-{red,green}01.log` and final-v4 reference GREEN02.
That small reference records current54source identity entries (53callbacks+1borrow),
final54callbacks; alternate final numerical borrowing succeeds once and refuses
53missing observations. Actual final raw checks remain. In the100-source partial
SDK type-definition calibration,current numerical borrowing succeeds3times per
hot request despite requestFileIdentity never being called. Therefore a zero count
on one interface does not establish absent cache reuse. Do not extrapolate counts,
timing or unused-observation cost to30K before the queued measurement.

## Density driver correction before any workload

Historical density ordinary logs have zero semantic.definition.complete records.
The original waiting controller01 was stopped with SIGTERM only after matching its
exact command,WAITING state,zero sessions andzero children; actual session exit143
retained. This is a proven observer gap,not an observation timeout/product failure.
`density-program-observability-red01.log` returns the exact definition but fails
missing Program statistics; green01 on the same public request with statistics
enabled observes project4/total57/roots4. No static import count substitutes forP.

Adapter density-observed-session01.mjs preserves the old session body exactly
when absolute imports and the one explicit statistics flag are normalized away;
`density-program-observability-identity01.json` records hashes. Both runtime versions use that same light statistics
setting; native audit/profile remains disabled. These timings must be labeled
statistics-enabled rather than uninstrumented production. Controller02 is queued,
not executed. All original exact results,DB/closure/resources and failure stops
remain; zero prior sessions are relabeled as passes.

## Cyclic graph controls

DAG experiments do not cover cycles. generate-cycle-axis.mjs first emitted the
seed DAG and failed actual import/SCC assertions; then generates one controlled
back edge on a fixed reachable chain. AtN256/P128 tests independently reconstruct
SCCs and condensed DAGs:K1/4/16/64,edges128,fanout2,every file512bytes. Condensed
depth126/123/111/63 changes inherently with SCC size and is explicitly measured,
not falsely called fixed depth. All four generator tests pass in
`graph-axis-tools-green-final01.log`; no runtime performance claim. Queued24serial
runtime sessions useN2048/P128 and retain actual Program expansion if conservative
analysis grows scope; they cannot then claim constant actualP.

Windows readonly hostname attempt again times out before SSH handshake,exit255,
192.168.31.14:22 (`windows-connectivity-readonly02.json`). No deployment/process/UI
action occurred. This blocks that platform only,not independent Mac work.

## Input-scope caveat

Prior ordinary controls cryptographically check30000source files and3955original
SDK paths; they did not separately archive all project JSON configuration hashes.
They intentionally made no configuration edits,but this is not a bit-for-bit
configuration proof. Before the queued cost series,59candidate JSON/JSON5 files in
the copied root are now independently hashed (`photos-config-inputs-before-cost01.json`),
withzero symlinks. Recheck after the series. This snapshot is not the actual compiler
readset and does not exhaust externally referenced manifests or new SDK additions.


## Completed M0 and independent postflight diagnosis

post-whole-cost-series01.json completed with failures, not PASS: ordinary-before
77.091s init/5.209s first/2.752,2.780,2.717s hot; diagnostic85.295s/6.978s/
4.480,4.696,5.004s; ordinary-after76.294s/5.211s/2.772,2.797,2.915s.
Diagnostic overhead is substantial; its exclusive elapsed values/counts cannot
be assigned as percentages of ordinary2.8s. Same Program on hot queries, no new
Program/parser/checker; large binding proofs and retained-fact comparisons persist.
See current3f-m0-diagnostic-exclusive-summary01.json. Node/native timelines and
full wire results remain separate; native/Worker phase overlap is not summed.

The ordinary-before data DB integrity check exceeded its existing60s limit;
control DB passed. Diagnostic/after data DB checks passed27.93s/28.21s. DB inode
and bytes stayed the same across sessions, but mtime changed: identical DB content
across service sessions is not established. No corruption/OOM inference.
SQLite3.51.0 actually uses cache_size2000 positive4096-byte pages, mmap0; no
product or checker settings/deadlines were changed. Missing original SQL CPU/IO
trajectory prevents retrospective attribution of that timeout.

Diagnostic01's process handle disappeared while its result still said RUNNING.
Its late finish listener has a reproducible missed-event race: diagnostic-stream-
finish-red01.log; stream/promises finished correction GREEN01. Original result
and raw SQL output left untouched; terminal-audit marks incomplete driver
observation, not product failure. Independent diagnostic02 keeps identical SQL,
default pager and60s: two exit0 runs28.045s/27.917s, inputs unchanged. CPU near
one core and detailed SQLite counters apply to these successful runs only; they
do not prove the prior timeout's cause or replace its FAIL.

Original59 JSON/JSON5 configuration records rechecked after M0:59 same,zero
added/removed/changed/links (photos-config-inputs-after-cost01.json). Not proof of
external compiler readset/new SDK paths. Queued graph/density/SCC controllers
stopped without executing sessions because predecessor retained failures. Do not
report them running or count planned points as results. New shared-binding slice
and its separate validation are documented in2026-11-20-binding-proof-composition.md.
