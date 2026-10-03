# References / semantic MoSCoW

## Current priority contract (2026-09-29 semantic-ready)

This is the only active prioritization view. [Ledger](references-feature-ledger.md)
owns current feature state; the [semantic-ready plan](2026-09-29-semantic-ready-execution-plan.md)
owns stage/Issue dependencies. [Product contract](semantic-ready/product-contract.md)
and [ADR 0007–0013](../adr/README.md) document requirements and proposed mechanisms.
S01 now implements the public benchmark harness, not a production optimization.
The [S01 evidence](../reports/2026-09-29-semantic-ready-s01-baseline.md) preserves
READINESS_UNSUPPORTED, a diagnostic observation failure and missing buckets;
fast repeated cache hits do not graduate unseen/edit/eviction performance.

### Must

| Item | Reason and boundary |
| --- | --- |
| R-21/R-02 ready-state 500 ms buckets | Unseen symbols, unopened modules, edits and eviction are normal work; cached answers are a separate bucket. Initial preparation is exempt only from latency, not resources/correctness |
| R-07/R-22 complete answers and valid generation | Candidate-ready/metadata/count equality are not semantic completeness; unknown uses exact fallback, slow fallback still fails SLO |
| R-14 compiler facts feasibility spike | S02 is required before production schema/route investment; non-equivalence stops downstream facts route, not the correctness requirement |
| R-20/R-23 preparation availability | Progress/cancel/time/resources and truthful capability-ready; no hidden background 5 GB, no indefinite reprepare loop |
| R-03/R-13 budgeted reuse and conservative incrementality | Preserve compatible work without stale reuse; ordinary edit waits count. Actual strategies remain experimental/proof-gated |
| R-01/04/05/06/08/12 maintain existing owners | Reuse tracing/cache/coalescing/references lanes/recovery/hysteresis; do not rebuild or stack equivalent frameworks |
| R-24/25/26/27 core capability graduation | Existing definitions/implementations/completion/rename stay available; each capability's exactness and normal buckets are measured separately |
| R-29 diagnostic/editing integrity | Keep normal diagnostics, codes/ranges/version and resource/formatting contracts; background publication freshness is not silently renamed request latency |
| Original memory/correctness gates | >3 GB reproducer, final 50%, DevEco/PSS/scaling/post-eviction remain independent; new SLO cannot close them |

### Should

- R-09 existing default-off full-scope resident path: S05 must qualify real admission, not reimplement it;
  Settings L3 misses remain evidence against graduation under the current budget.
- R-10 implemented opt-in anchor routes: reuse only equal compiler identity/config/snapshot; mismatch falls back.
- R-13 finer dependency invalidation only after complete reverse-impact evidence; unknown remains coarse.
- R-15/R-28 other global routes/call hierarchy: one actual capability/forward-or-reverse direction at a time;
  this priority does not permit deleting existing capabilities or hiding their failed gates.
- Validated persisted restart experience and per-platform optimization after publication correctness.

### Could

- R-11 Worker-shell/bytecode-cache experiments only when same-host attribution identifies real benefit;
  not permanent compiler residency or a claimed 500 ms fix.
- Trusted prebuilt `.d.ets` boundaries only with fidelity/body-reference/source-map proof; no query-time emit.
- CI/remote facts, compression or SQLite-layout tuning only after profiling and validity maturity.

### Won't-now

- R-16 second ArkTS checker, R-17 identity default without proof, R-18 unbudgeted full Programs,
  R-19 file-count-only memory extrapolation.
- Raise heap/budget, truncate Locations/edits, close diagnostics, shrink legal scope or delete failed samples.
- N×full-workspace findReferences as production preparation or pre-query the benchmark target pool as ready.
- Add empty schema/RPC/proof categories or another ProjectGraph/DB/cache/scheduler before actual consumers.
- Change defaults, write Issues or submit/push/merge merely because planning docs now exist.

### Budget and stop lines

Current implementation priority preserves the open S01 coverage/evidence and
advances the independent S05 branch; it does not repeat the failed S02 hypothesis.
S01 is IN_PROGRESS,
not product GREEN. The user-authorized independent
[S02 binding hypothesis](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)
now FAILS the constructor gate: ordinary/alias exact is insufficient.
S03 is BLOCKED; S04 and S06–S12 remain NOT_STARTED. S05 is IN_PROGRESS with
default-off context lifecycle/rebuild reasons and public focus37/37;
[its evidence](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md) records
exact Settings trace-on/off and unchanged dispose/transient defaults.
The later current-build reversed-order 100-operation Settings pairs keep every
Location and diagnostic exact, yet compatible-disk experimental LS reuse has
post-edit definition P95 about 1.6 s in both pairs (off about 0.27 s). This
specific reuse candidate fails the latency gate; variable RSS ratios do not
justify a default, budget, or transient-worker change.
An earlier S05 whole-fast1160/1161 had1 FAIL/exit1 (struct response4 timeout);
original-deadline isolation did not replace that failed run. A 1177/1177 full PASS
preceded the runner safety RED/GREEN (canonical output-parent scope and source-status
fail-closed). A sandboxed macOS `ps` permission-denied rerun stopped/exit1 is
environmentally invalid, not a code failure/PASS. The latest approved process-sampling
`/usr/bin/caffeinate -i pnpm check:fast` now passes **1181/1181**, exit0,
zero fail/cancel/skip/todo (duration 1,195,387.333352 ms). This clears the
current-source whole-fast regression gate, not the unknown timeout cause or S05 graduation.
One post-patch real Settings experimental smoke passed exact definition/references9/9,
normal v1 diagnostics and exit0; it is not another randomized two-arm benchmark.
Observation and default-off compatible-disk local-LS prototype are implemented, not graduated.
One-shot exact revision spans, actually delivered non-overlay changed text and source-version
fingerprints guard against lost deltas/old ranges; missing or unsafe inputs still reset.
Unknown in-root source deletion has a durable revision fence across batch order/consumption;
final focused72/72 PASS, not a whole or resource gate.
100 fixture edits protect correctness; unchanged Settings controls do not prove real edit savings.
The real single-edit Settings/API24 checkpoint uses a private exact checkout, not resized scope:
six trace-off processes preserve shifted exact definitions, 9/9 references and v1 TS2339.
Edited definition medians off/experimental are 1,811/281 ms; references 6,597/6,611 ms
under safe fallback, sampled Node peak RSS medians nearly equal. Initial diagnostic
wait-order FAIL remains historical; the corrected runs keep normal diagnostics.
A separate pinned 100-operation Settings fixed-order A/B has exact 100 edited definitions,
11 complete references, 11 cross-module definitions, diagnostics and Level3 recovery per arm.
Experimental/off Node peak RSS is 2,146,119,680/1,341,296,640 B = **1.600×**:
the ≤1.10 gate FAILS; unpaired experimental repeat peaks at 1,796,046,848 B.
Definition/references medians 311.815/261.549 and 6,698.945/6,007.669 ms do not establish a mixed-workload speedup.
Reuse-off queue-start and verifier batch-start cancellation controls passed, not experimental/all-batch proof.
One fixed-order pair is not randomized multi-session/PSS/P95/500 ms graduation.
Default-off/per-batch verifiers remain; whole-fast GREEN does not explain old timeout.
S02 FAIL blocks production facts/schema and preserves the minimal counterexample; it does not block S05.
One stage/subslice per turn; performance runs are serial. A GREEN harness/document check is not product GREEN.
Full-response P95≤500 ms uses trace-off real LSP and includes normal waits/fallback.
No stage can bypass the [acceptance gates](../benchmarks/semantic-ready-acceptance.md).

## Historical prioritization and evidence

Everything below records the preceding plan and its dated builds. Its former
R-13/R-14/R-15 Could and R-11/R-12 Should classifications are historical;
the current priorities above are the explicit successor, not a second active plan.
No failed result, source state or deadline is rewritten as PASS by this transition.

This is the prioritization view of the [Feature Ledger](references-feature-ledger.md),
not a second implementation plan. Current baseline: `911ae43c`, merged PR #91,
with baseline `check:fast` **1103/1103 PASS**. The preceding R-09 source has its
own fresh **1116/1116 whole-fast PASS**. Current literal-root focus38/38 and
dependency strengthening1/1 are GREEN; its fresh frozen whole-fast is
**1133/1133 PASS, exit0**, zero failures/cancellations/skips/todos, unchanged
source/test/build inventory and artifact/SDK/oracle postflight.
The historical combined gate is1124/1125
PASS,1 FAIL; absence-identity recovery focus is 31/31 PASS and the final
replacement whole gate is **1126/1126 PASS, exit 0**, zero failures/
cancellations/skips/todos. Dated evidence below describes historical builds.

### Historical Must

Current [R-07 literal-root slice](../tdd/references-constructor-literal-roots.md)
is default-off and consumes source-local official-parser proof without a new
Program/checker. Pending roots only are removed; original legal scope,
dependencies, overlays and unknown callers remain. Final old-token rechecks
restore complete verification on mutation. Cost RED10->GREEN6 is exact,
including the unknown caller's import of an omitted root. Focus38/38 plus
strengthening1/1 pass; fresh frozen complete gate is1133/1133 PASS/exit0,
with original deadlines and unchanged inputs. [Settings](../reports/2026-09-29-settings-constructor-literal-roots.md)
is11x267 exact/valid, diagnostics/exit0, **0 hits**,14+14 batches,
cold/edit61.205/61.528s and existing cache27-51ms. No real-workload/general
constructor/default graduation follows; R-07 remains Must/open.

Preceding empty-module checkpoint:

R-07's [first consumed constructor exclusion slice](../tdd/references-constructor-empty-scope.md)
is implemented default-off: a same-Program original-cursor search plus two actual
old-token reads can exclude one strictly empty external disk module, never an
unsearched overlay. Public RED6→GREEN2 batches preserves exact legacy sets for
both declaration policies; nine new safety/behavior cases and four manifest
tests pass. The subsequent public unrelated-sibling control fixes needless
resident misses while preserving actual read guards/configuration invalidation;
combined focus is 31/31 PASS; the subsequent complete frozen-input whole gate
passes 1126/1126 at unchanged deadlines, with the first failure retained.
[Settings/API24](../reports/2026-09-29-settings-constructor-empty-scope.md) gives
11×267 exact/valid with diagnostics/exit0, but zero exclusion hits: cold/edit
still need14 batches each at57.375/58.082s. General constructor scope proof
remains Must/open, with no Settings acceleration or default graduation.
Final-artifact Settings is also11×267 exact/valid with diagnostics/exit0, but
still0 hits/14+14 batches and cold/edit57.394/58.108s. Replacement complete
gate passes 1126/1126; no real-workload/default graduation follows.

R-01 tracing and R-02 fixed exact benchmark make latency and memory changes
attributable. R-03 hot context, R-04 complete-result cache, R-05 coalescing and
R-06 interactive/global isolation address repeat and head-of-line latency.
R-07 index trust and R-08 generation recovery preserve complete answers after
edits. All remain subject to exactness, memory and freshness gates; the default
strategy is not changed merely because one optimization lands.

The immediate original-deadline regression recovery is now GREEN:
[awake-host recovery](../reports/2026-09-29-awake-regression-gate-recovery.md)
has focus9/9 and fresh complete fast1093/1093 PASS,exit0,zero failures/
cancellations/skips/todos. Source/artifact pins and deadlines remain unchanged;
the environment recovery is not a code/lifecycle speedup or sole-cause proof.
Fresh gate validation remains Must for the next implementation slice.

Fixed Settings/API24 mode C returns **11 × 267 exact/valid** with normal
version2 diagnostics/exit0. Ready8.076s, insertion7.094s, cold/edit
**59.478/60.195s** and nine hits **25–46ms** still leave cold500ms open.
Sampled product peak **1067745280 bytes** is not PSS or memory graduation.
R-07 constructor admission stays Must/open: the
[ADR0005 exclusion rule](../adr/0005-index-proof-trust-boundary.md) requires
evidence for every unsearched legal source, complete membership and overlays.
Do not relabel correct fallback as a defect or add an unused certificate/RPC.
Original>3GB/final50% memory, DevEco and native Windows remain independent.

The prior [verifier whitespace control](../reports/2026-09-29-verifier-whitespace-control.md)
keeps original 30 s recovery deadlines and gives baseline **2 PASS/1 FAIL**,
compact **1 PASS/2 FAIL**. One failed compact case is sleep-contaminated
(macOS Idle Sleep **1,803 s**), not compiler CPU evidence. Other response-2
timeouts remain. Original bytes are restored, formatting is not enabled,
and neither complete-case counts nor this small control graduate exactness,
latency, RSS or the whole **1,090/1,093 PASS, 3 FAIL** gate. Record awake host
conditions for the next original-deadline regression cycle before admission.

The current R-20 [Settings/API24 mode-C recovery](../reports/2026-09-28-settings-catalog-recovery-identity-sql.md)
uses the unchanged previous binary: ready **9.638 s**, committed insertion
**8.601 s**, **11 exact 267-Location responses**, normal version-2 diagnostics
and exit 0. Cold/edit remain **67.053/77.261 s**, nine cache hits **31–60 ms**;
constructor seed rejection still requires 14 complete-scope batches. The
original constructor regression recovers **1 PASS/0 FAIL** under its unchanged
**30 s** RPC deadline. Prior readiness/constructor/whole-fast failures below
remain evidence, without a sole-cause claim or R-20 first-click graduation.

The subsequent [operation-local identity SQL reuse](../tdd/references-identity-sql-reuse.md)
lazily retains one full **256-row SQL String** until insertion returns, leaving
different-size tails, SQL shape/order, buffering, rows, schema and durability
characterized. Exact MemoryStore candidate/proof and reopen parity pass;
allocation RED **5,341 > 4,598** becomes GREEN **4,289**, **19.7% fewer**
current-thread Rust allocation requests. This is not RSS, CPU or latency proof;
the real recovery above predates the native change. Final Rust workspace
is **182 PASS/0 FAIL/1 existing ignored**, strict Clippy/default-feature release
pass. New-native Settings is **11 × 267 exact/valid**, normal diagnostics/exit 0;
cold/edit **65.491/79.556 s**, hits **31–41 ms**. Sampled product peak
**1,225,367,552 bytes** is 14.3% above the preceding one-run baseline, not a
memory or causal performance win. **Current full `check:fast` is FAIL:
1,090/1,093 PASS, 3 response-2 timeouts, exit 1; zero cancelled/skipped/todo.**
Definition failures cannot identify warm/fresh processes. Cancellation passes,
but recovery times out at its unchanged 30 s deadline. Focus is **2 PASS/1 FAIL**;
old-native recovery also times out. Neither replaces the failed whole gate.
R-20, constructor admission, cold/edit 500 ms, original >3 GB/final
50% memory, PSS/DevEco and native Windows remain Must/open. No phase or gate
promotion, constructor narrowing, `identity` default or Worker lifecycle change.

The prior [current-source consumer](../tdd/references-source-availability-consumer.md)
uses explicit availability with bounded fresh text/overlays, not generation-only
SQLite facts. Rust workspace171PASS/1 existing ignored, release/typecheck/build,
Node focus96/96 and framed-LSP17/17 are GREEN. One current
[Settings replay](../reports/2026-09-28-settings-source-availability-consumer.md)
returns 267 exact Locations, diagnostics/exit 0 in **144.399 s** after seed
rejection and 14 complete batches; actual sampling median 212 ms limits the
observed peak claim. The retained whole-fast is FAIL/exit 1: 1,078/1,093 PASS, 15 failures.
Post-failed-run public preflight matches frozen pins, not a passing gate;
the serial original-artifact 15-case recheck finishes 12 PASS/3 FAIL:
installed-package initialize at 5 s, constructor references at 30 s and
scheduling trace lifecycle. Installed-package initialize then passes three
isolated reruns at its unchanged 5 s deadline; constructor references again
times out on response 6 at 30 s, without a semantic diff verdict. A restricted
pre-LSP sampler failure is recorded separately. No prior-source gate is inherited.

Further unchanged-source constructor recheck fails at final `trace-off`
response 7 after a successful 29.104 s response 6. External log-retention
controls fail at `indexed-batched` response 6 with and without RSS sampling.
Full logs prove ready catalog and safe complete-scope retry, not stale-index
legacy; completed Programs have only 2–5 project files and zero SDK declarations.
Startup receipt/Program preparation remain expensive, with startup receipt the
largest observed wall field in these controls; no CPU or sole-host-cause claim
is made. Original deadlines, source/assets and correctness scope remain intact.
This diagnosis does not close the regression gate or enable narrowing.

The [module-cache/CPU follow-up](../reports/2026-09-28-constructor-worker-module-cache-control.md)
preserves one full cache-enabled constructor PASS and two explicit
cache-disabled FAILs under the original 30 s deadline. Thread-local CPU
microprobes distinguish module loading/initialization from Program preparation,
but do not reproduce or explain the failed batch's 20.181 s startup-receipt
outlier. No production cache or Worker reuse is enabled; original regression,
constructor admission, 500 ms and final memory gates remain Must.
The temporary original-verifier prefix probe remains RED at 30 s and records
6.802 s parent startup versus 4.033 s child load wall / 0.727 s thread CPU for
a late retry. It narrows attribution, not semantic scope; do not replace the
regression gate with a small cached-probe pass or infer a sole host cause.

The [OS-wait follow-up](../reports/2026-09-28-constructor-worker-os-wait-control.md)
retains three further original30s failures: sampled Node26, resource-only Node26
and no-preloader Node20.19.5. Wall/CPU and whole-process faults/switches separate
observed waiting from computation, not its exclusive cause. Whole-host paging
and CPU limiting are not wholly attributable to the server; sparse/delayed
native sampling is not a release benchmark. One15.164s Node20 response does
not certify its subsequent timed-out declaration query or final equality.
Regression recovery remains Must before any narrowing/default promotion;
no changed Worker lifetime, diagnostics, SDK policy or request deadline.

The later read-only preflight still observes CPU limits48–55% and swap used
8,378.75–8,453.50MiB; no executable-filtered test process remains. Runtime/test
pins match and no new replay/build/whole-fast is run. Obtaining a lower-pressure
regression environment remains the immediate Must; unrelated helper counts
are not an exclusive-cause proof or permission to stop user applications.

The [initial-CPU100 replay](../reports/2026-09-28-constructor-initial-cpu100-replay.md)
still fails at Direct1:27/no declaration under the original30s deadline; late
server completion at30.155s is not client acceptance or final exact equality.
Target's preceding constructor requests pass, but the remaining profiles do not
run. Preflight100/postflight62 CPU values do not prove a constant environment.
Frozen artifacts remain unchanged. Restore the regression gate, not the
deadline or search scope; admission/default promotion remain blocked.

The [current-build Settings mode-C attempts](../reports/2026-09-28-settings-mode-c-catalog-blocked.md)
both stop at the unchanged180 s catalog-ready gate before didOpen/references,
also with normal OS environment. Restore readiness before evaluating cache,
edit freshness and267 exact tuples; no lower pre-reference RSS substitutes
for a references memory gate. Original regression/whole-fast recovery remains
Must before narrowing. Host pressure is observed, not an exclusive cause;
do not change deadlines, defaults, diagnostics or Worker lifetime.

The [phase/native catalog follow-up](../reports/2026-09-28-settings-catalog-activation-native-profile.md)
keeps two more original180 s ready-gate FAILs before references. A bounded
owned-sidecar sample proves reference-index insertion/cache-spill work during
activation, not commit deadlock; WAL length is not cumulative IO. Real catalog
recovery remains Must alongside original30 s/whole-fast recovery. Cache/edit,
500 ms and memory graduation stay unverified; no durability/scope changes.

The [default-off live-stage observer](../reports/2026-09-28-settings-catalog-live-stage-trace.md)
passes public RED/GREEN, live-flush/error/rollback characterization and177 Rust
tests, but the same real Settings input still fails the original180 s ready
gate before references. Current occurrence/alias/binding input volume equals
history; reference insertion is last observed, not successful commit/readiness.
R-20 activation/storage and original regression recovery remain Must before
R-07/R-10 admission. Do not trade deadline/durability/scope/result completeness
for a GREEN label or claim low pre-query RSS as a references memory improvement.

The [bounded insert observer](../reports/2026-09-28-settings-catalog-insert-progress.md)
has public RED/GREEN,181 Rust PASS/1 existing ignored and release build, but the
unchanged real180s ready gate remains FAIL before any references. In completed
1344/1846 prefix, occurrences64.302s/66.32% and identity21.397s/22.07% dominate;
aliases0.979s/bindings10.275s are secondary. Uncommitted prefix is not complete
catalog/query/5GB/500ms evidence. R-20 readiness and original regression recovery
remain Must; no scope/durability/deadline changes or constructor admission.

The minimal [scheduling test correction](../tdd/references-scheduling.md)
requires exactly `["define", "hover"]` and queue wait <250 ms while references is
active, then audits current definition through `request.completed` after
settlement. Public bypass, ContentModified (-32801), edited exact-result
assertions and deadlines remain. Three independent reruns are GREEN; the
related five-file focus is **51/51 GREEN**, exit 0, zero failures/cancellations/
skips/todos, **55,935.865402 ms** total. There is no fresh whole-fast after
this test change; the retained 1,078/1,093 failure blocks constructor/narrowing
promotion despite isolated GREEN.
Missing-parent capture stays unknown;
caller-owned absence is not a sidecar absence scan. Complete caller scope/overlay
admission and compiler-backed constructor completeness remain Must before
production reference exclusion. Defaults,500ms and memory gates are unchanged.

The prior [caller-owned capture slice](../tdd/references-source-availability-capture.md)
owns supplied query/configuration/overlay copies and managed/stat freshness
fences. Public RED/GREEN catches canonical diskless buffers incorrectly reported
absent; foreign/competing owners are not silently omitted. Missing physical
parents remain unknown. Public focus **95/95** and framed-LSP freshness/search
focus **17/17**, typecheck/build pass. One fresh
[Settings/API24 replay](../reports/2026-09-28-settings-source-availability-capture.md)
retains 267 exact Locations, diagnostics and exit 0 in **60.533 s**, but still
rejects the constructor seed and performs 14 complete batches. Fresh controlled
whole-fast is **1,092/1,092 GREEN**, exit 0, zero failures/cancellations/skips/todos;
post-gate public preflight matches fixed project/SDK/oracle/runtime and frozen
source fingerprints without server launch or output creation. No previous gate
or default-host SDK certification is reused. Presence does not admit stale contents.
Rust consumption and complete production snapshot admission remain Must,
as do compiler-backed constructor scope, 500 ms and final memory gates.
The producer is not an atomic filesystem snapshot or a ProjectGraph authority.

The prior [availability transport slice](../tdd/references-source-availability-transport.md)
adds bounded, copied/rebased tri-state evidence and rejects malformed,
duplicate/unrequested and absent/open-overlay inputs before IO. Rust protocol
13/13, workspace 159 PASS/1 existing ignored, release build and Node 98/98
pass. One fresh [Settings/API24 replay](../reports/2026-09-28-settings-source-availability-transport.md)
retains 267 exact Locations, diagnostics/exit 0, but needs 58.759 s after seed
rejection and 14 complete batches. Fresh controlled whole-fast completes
**1,081/1,081 PASS**, exit 0, zero failures/cancellations/skips/todos; post-gate
public preflight confirms frozen project/SDK/oracle/runtime fingerprints without
launching a server or writing output. This is not a default-host SDK certificate.
This prerequisite does not probe disk or activate evidence in the resolver: even all eight
extensionless candidates remain unknown. Physical source capture/freshness,
compiler-backed constructor scope, 500 ms and final memory gates remain Must;
no production candidate exclusion follows from transport GREEN.

The preceding [open-source presence repair](../tdd/references-open-source-presence.md)
closes another R-07 prerequisite: a diskless open target is visible to Node
source resolution, and an observed alias identity change cannot be swallowed
into positive disk proof. Public 13/13, final focused 95/95 and fresh controlled
whole-fast **1,062/1,062**, exit 0, pass. Runtime hashes match the fixed replay;
this is not inherited from the earlier source or default-host SDK certification.
One [Settings/API24 replay](../reports/2026-09-28-settings-open-source-presence.md)
retains 267 exact Locations, diagnostics and exit 0 but takes **60.696 s**;
constructor rejection still triggers 14 complete batches. Source absence,
complete overlay admission, constructor coverage, 500 ms and final memory
gates remain blocking. Presence proof does not promote binding-RPC narrowing.

The 2026-09-28 [controlled recovery](../reports/2026-09-28-regression-gate-recovery.md)
restores the unchanged-source 1,058/1,058 fast gate without extending deadlines.
The subsequent [project selection ownership fix](../tdd/references-project-configuration-ownership.md)
reproduces caller-only target mutation twice and keeps Node source proof aligned
with the real Worker; 61/61 focused tests and the fresh controlled whole-fast
gate **1,060/1,060** pass. This closes one R-07 prerequisite, not complete binding/source
admission. [Settings/API24](../reports/2026-09-28-settings-project-configuration-ownership.md)
still needs 58.636 s for 267 exact constructor Locations after a rejected seed
and 14 conservative batches. The 500 ms, constructor search completeness and final
memory gates remain blocking; no default or Worker lifetime changes follow.

R-20 is the separate initial-index first-click gate: post-mutation generation
recovery does not solve a request that precedes the first catalog or sidecar
`open`. Its current bounded wait is an opt-in causal experiment, not a default
navigation policy.
R-02 now prioritizes the real Settings checkout. Its declared compile 23 and
selected API 24 are separately pinned: API 24 is accepted for the same-SDK
performance/differential track, without claiming matched-23 or diagnostic
equivalence. Three independent cold processes per strategy all returned the
same 248 Locations. A missing API-23 installation does not block further
Settings performance work.
R-04 is implemented before candidate selection. The earlier three
Settings/API-24 mode-C processes had a 61 ms cached median but three
1.96–1.99 s outliers when automatic diagnostic quiescence was active. F6b
added a real-LSP RED/GREEN gate: only an already-proven complete cache hit
bypasses that wait; misses retain it, and normal diagnostics still publish.
Three new independent same-build processes returned all 33 responses with
248 exact Locations each. Their 27 cached repeats had 67 ms median, 96 ms
observed nearest-rank P95 and 100 ms maximum. This clears the 500 ms target
for this **cached** Settings sample, not for cold/post-edit misses or release
P95. Those F6b runs published 18 errors. A subsequent real-LSP RED/GREEN
showed that the bundle lacked adjacent `ohos-typescript` standard-library
declarations. A second RED found that the default full library introduced a
DOM `Text` collision; production now selects non-DOM ES2022. Focused portable
installed-artifact acceptance passed 9/9. Two fresh Settings/API-24 no-DOM
replays retained 248/248 exact references each and published only TS 2307, which
still requires validation. Asset and Worker-bundle digest recording with
optional manifest mismatch preflight passed the full replay CLI suite (10/10);
the refreshed `MenuController` manifest and one fresh pinned indexed-batched
replay also passed with 248 exact Locations. That cold request took 6,226 ms,
so it does not satisfy the user's ≤500 ms navigation target. Larger paired
samples and Windows execution remain open; this is not an API-23 or
DevEco-equivalence claim
([standard-library report](../reports/2026-09-21-settings-api24-standard-library.md)).
The [current-build default mode-C check](../reports/2026-09-26-settings-default-mode-c.md)
extends R-04 smoke to the `HomeInitData` usage symbol: three independent
processes return 33 exact nine-Location responses, normal version-2 empty
target diagnostics, nine hits/two misses each. The 27 cached requests are
2–4 ms; first/edit medians remain 7,247/5,673 ms. Anchor reuse and trace are off.
This clears only the repeated-cache smoke target; cold/edit 500 ms, PSS and
release gates stay open. Do not pool this short burst with the older symbol/build.

R-02 now has two real Settings symbols, each with pinned oracles for both
declaration policies. A [new matrix](../reports/2026-09-21-settings-api24-reference-matrix.md)
ran `HomeInitData` without declaration in three independent fresh processes
per `legacy`, `batched` and `indexed-batched` strategy: all nine responses were
the same exact nine Locations, with zero target-file diagnostics. The observed
request medians were 8,905 / 93,179 / 5,019 ms respectively; pure batching
therefore remains unsuitable as the default for this case despite a modest
median peak-RSS reduction. Single fresh legacy/indexed pairs also passed
`HomeInitData` with declaration 10/10 and `MenuController` without declaration
247/247; the latter still reported TS 2307. Three cold runs are not a stable
P95, those opposite-policy pairs initially had only one run per strategy, and all cold
requests missed the 500 ms navigation target. F2, matched-API-23/DevEco,
native Windows, original >3 GB and final memory gates remain open.
The [follow-up with-declaration matrix](../reports/2026-09-21-settings-with-declaration-matrix.md)
expanded `HomeInitData`'s opposite policy to three fresh processes per
strategy. All nine returned the same ten exact Locations and zero target-file
diagnostics; observed request medians were 9,030 ms legacy, 90,894 ms pure
batched and 5,107 ms indexed-batched. This strengthens the fixed Settings
smoke differential but is still not a release sample, API-23 equivalence or
evidence that cold navigation meets 500 ms.
Three independent warmed mode-B `HomeInitData` processes also retained 9/9
exact references. Their observed completion, definition and references medians
were 8,613, 37 and 4,404 ms; the full-run peak product RSS median was
1,136,500,736 bytes, about 2.04× the mode-A indexed median under a different
workflow. This is a memory-warning signal, not proof that references alone
caused the increase: the warmup may retain compiler state and its result
contents had no golden. One repeat/edit mode-C process returned 11/11 exact
responses, with nine unchanged repeats at 2–3 ms and a 3,855 ms post-edit
request. Only one version-2 diagnostic publication was captured, not a full
versioned diagnostic sequence. These runs do not graduate F2, establish a
stable P95 or meet the cold 500 ms target.
R-03 now has an opt-in `budget-aware` profile with a real-LSP retention test;
the safe `dispose` profile remains default. A controlled
[three-versus-three Settings mode-B comparison](../reports/2026-09-21-settings-api24-reference-matrix.md)
returned 9/9 exact `HomeInitData` Locations on every run and observed
resident 1→1 under retention versus 1→0 under disposal. References medians
were 4,072 versus 4,404 ms; full-run product RSS peaks were 1,129,537,536
versus 1,136,500,736 bytes. These small sample differences do not support a
default flip or graduation: both workflows still peak around 1.13 GB, the
1,024 MiB semantic budget is not a hard RSS cap, first references remain
above 500 ms, and post-eviction PSS evidence is missing.
R-08 is now implemented: watched source/project changes start a new catalog,
legacy remains authoritative while its generation is stale, and indexed
batching resumes only after a ready generation advances. The public transcript
keeps exact Locations across fallback and recovery; it does not weaken R-07.
Initial catalog warming is a separate open Must gate: a
[pinned Settings first-click replay](../reports/2026-09-21-settings-immediate-catalog-replay.md)
timed out after 120 seconds on the indexed-batched path, which kept its
23-batch conservative plan even after catalog readiness. Completed legacy
controls were exact but took 31–38 seconds and used about 875–910 MB peak
product-tree RSS. Neither path meets the cold navigation target, and the
timed-out indexed peak cannot establish completed-query memory safety.
Do not promote an initial-index fallback policy without snapshot/cancellation,
exactness, diagnostics and RSS gates.
The [opt-in wait experiment](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md)
now passes the narrow snapshot/cancellation/exactness transcript and returns
9/9 in three index-cold Settings runs with 537–560 MB completed peaks, but
39.8–50.5 second requests and delayed diagnostics leave this Must gate RED.
The same-build legacy median is 8.7 seconds/953 MB; one default indexed-first
run took 90.8 seconds and 23 batches. Neither is a general low-memory fix or
500 ms navigation. The wait remains default-off. Initial-index readiness must
move off the user click/diagnostic suspension path before graduation review.
The [fresh Settings catalog phase profile](../reports/2026-09-22-settings-catalog-phase-profile.md)
records roughly 0.8–1.0 seconds before activation and 10.2–11.9 seconds
from activation to ready for 1,846 files. A concurrent macOS stack sample
points to reference-row writes inside SQLite replacement. This justified a
bounded write-path A/B with exact generation/query and memory checks, not a
parser change or default strategy switch.
The [96-row insert A/B](../reports/2026-09-22-settings-sqlite-batch-rejected.md)
passed exactness but regressed median activation from 11.07 to 11.60 seconds;
it was removed. The [default-off SQL stage trace](../reports/2026-09-22-settings-sqlite-stage-profile.md)
then measured median 6.12 seconds in reference-related insertion and 3.08
seconds in commit, with all three real LSP runs still exact 9/9. Another
optimization attempt needs finer write-amplification evidence; the wait
remains default-off and the 500 ms navigation gate remains RED.
The next [default-off reference subphase trace](../reports/2026-09-22-settings-reference-insert-subphases.md)
kept SQL and transaction boundaries unchanged. Three fresh Settings replays
again returned 9/9 exact Locations; median occurrence and identity work were
3.69 and 1.75 seconds within 6.06 seconds of reference insertion, and commit
was 3.13 seconds. A separate single-run stack sample places automatic WAL
checkpointing inside commit, but does not establish that moving it will shorten
activation. Record row volumes and compare complete ready-transition time
before any SQL or durability change. This observation does not graduate R-20.
The [row-volume slice](../reports/2026-09-26-settings-reference-row-volumes.md)
now measures 836,501 reference-related rows for the fixed 1,846-document
Settings catalog, stable across three exact 9/9 replays. Most rows are
occurrences and per-document identities. The Mac's measured CPU speed limit
was 22%, so new wall times are excluded from latency graduation. Table/page
and WAL amplification remain the next controlled investigation; R-20 stays
Must and ungraduated.
The [read-only storage profile](../reports/2026-09-26-settings-catalog-storage-profile.md)
then recorded the same 305.719 MiB B-tree distribution in three exact 9/9 runs:
95.60% reference storage and 52.43% reference indexes. This motivates a
single controlled duplicate-primary-key layout experiment, not dropping rows
or covering indexes. The heavy default-off scan and drifting machine/cache
state disqualify its wall times; WAL file length is not an I/O amplification
measurement. R-20 and the 500 ms gate remain open.
The [occurrence layout experiment](../reports/2026-09-26-settings-occurrence-layout-experiment.md)
is isolated by an opt-in Cargo feature and fresh-only schema 109. It preserves
all rows and exact Settings results while reducing disk B-tree allocation;
cold references remain seconds and measured RSS does not improve. Keep this
candidate experimental, with production migration/rollback and wider gates
still open. R-20 remains Must/ungraduated, not a shipped optimization.
R-07 now also rejects candidates if the sidecar changes from ready to warming
between candidate search and acceptance, even when the committed generation
number is unchanged. Direct and definition-anchor real-LSP transcripts both
fall back to complete semantics and retain the known cross-file reference;
the wider trust matrix remains an open gate.
R-06 is now implemented for references. Only classified interactive methods
may bypass one detached references request; diagnostics and other global work
remain serialized, and any mutation makes the old references snapshot fail
ContentModified. The real LSP interference test records definition/hover queue
waits below 250 ms and a fresh post-edit definition. Detached scheduling is
not yet generalized to other global methods.
Its [lifecycle follow-up](../tdd/references-reopen-mutations.md) preserves queued
close/open ordering: collapsing close into a reopened version-1 snapshot had
crashed the semantic Worker and timed out references. The exact public replay
and 54 focused regressions pass after the bounded correction. This is Must
snapshot correctness, not graduation of R-10 or the 500 ms performance target.
R-05 is now implemented as a version-bound shared operation in the LSP request
runner. Identical references share semantic work, but each client keeps an
independent cancellation handle; workspace mutation cancels every old-snapshot
waiter and prevents a new version from joining the old operation.

### Historical Should

R-09 is now an actual default-off implementation slice, not only research:
`ARKTS_REFERENCES_RESIDENT_FAST_PATH=1` reuses an unchanged, fully covering
compiler Program before transient verification. Original-cursor exactness,
no new Worker/Program on a hit, partial-scope rejection, source/overlay
invalidation and L3 disposal have public framed-LSP guards. An unnotified
package-main retarget exposed stale configuration; it and absent-owner,
installation-link and implicit type-directive REDs are now repaired. Full
public stdio coverage is 17/17 GREEN. The
[fixed six-run Settings A/B](../reports/2026-09-29-settings-resident-fast-path.md)
is exact (267 each), but all enabled queries miss at L3 and still run 24
batches: real reuse admission/graduation is not qualified. Keep the flag off,
not a larger budget or weaker scope proof. The
[TDD record](../tdd/references-resident-fast-path.md) closes the implementation
and fresh **1116/1116** full regression gate, not the real-workload graduation.
Defaults,
budget, diagnostics and per-batch verifier lifecycle remain unchanged.

R-09 full-scope resident fast-path and R-10 anchor fusion may remove redundant
compiler preparation, but only after trace and coverage proof. R-11 Worker-shell
reuse is a flagged experiment because earlier same-isolate retention regressed.
R-10 now has that first trace baseline for a real Settings **usage** position:
three indexed cold runs all required a separate ~2.05 s anchor Program before
one verifier batch and returned the same nine exact Locations as three legacy
runs. It remains a Should experiment, not a correctness-approved shortcut
([evidence](../reports/2026-09-21-settings-usage-anchor-baseline.md)).
An [opt-in definition-to-anchor reuse slice](../tdd/references-anchor-reuse.md)
now avoids a standalone anchor Program after a compiler definition at the same
position and snapshot. This is not cold first-batch fusion or a full-scope hot
references fast-path. Default isolation and final transient verification remain
unchanged. The [fixed Settings A/B](../reports/2026-09-26-settings-anchor-reuse-experiment.md)
must show no memory/freshness regression before this Should experiment can
graduate; do not enable the flag by default on latency improvement alone.
The latest source-freshness RED/GREEN covers unwatched disk changes and moved
declarations; 63 focused tests pass. Its separate Settings pair is exact 9/9,
but reuse peak RSS is 12.6% higher even though references take 4,423 versus
6,292 ms. R-10 stays an experimental Should, with prepared-source coverage
not equated to complete compiler dependency coverage. No 500 ms gate passes.
Two additional characterization tests confirm the reused-anchor route still
honors Must cancellation/freshness contracts: no partial answer on cancellation
or edit, then exact retry including the new overlay reference. They pass without
production changes; real-project interruption latency remains unmeasured.
Current-worktree full `check:fast` passes **970/970**, with no failed, cancelled,
skipped or todo cases. This verifies the experimental route's regressions, not
graduation: memory/no-regression and 500 ms evidence still block default-on.
The [isolated-anchor trace follow-up](../reports/2026-09-26-settings-anchor-compiler-phases.md)
fills the anchor compiler-phase observation gap under the existing opt-in
trace flag. Check/build and 43 focused regressions pass; three Settings
processes preserve all 33 exact responses. First anchor/final preparation
medians are 1,714/2,623 ms, versus 12/49 ms actual queries. This advances
Must observability, not Should cold fusion or the 500 ms target. The prior
970-test full verification applies to the earlier source-snapshot build.
The [document-attribution slice](../reports/2026-09-26-settings-anchor-document-preparation.md)
further separates document preparation from isolated semantic resolution:
873/14 ms first/edit document medians, with both misses still rebuilding
anchor/final Programs. All 33 real Settings responses and 37 focused tests
pass. R-10 remains Should and default-off; resolving the remaining candidate
RPC/source-resolution attribution does not permit removing semantic proof.
The [candidate-phase slice](../reports/2026-09-26-settings-candidate-phases.md)
now separates admission, usage/declaration RPC and source proof. Forty focused
tests and all 33 real responses pass. First declaration RPC/source medians
485/290 ms are material but do not explain the ~4.4 s combined compiler
preparation. Must observability advances; Should cold reduction remains open
and must preserve index/binding/anchor proof. No latency/memory graduation.
R-10 now includes a default-off
[cold local-export seed slice](../reports/2026-09-26-settings-local-export-anchor-seed.md).
Index supplies discovery only; original-cursor identity must be proven in each
final compiler batch. Public shadow/alias/overlay/cancel transcripts pass, and
all 66 six-process Settings responses are exact. Removing the separate anchor
Program reduces observed first/edit medians 37.7%/29.8%, but final preparation
still costs seconds. This is a partial implemented Should, not graduation of
R-10, default use or the 500 ms and final memory gates.

Broader [constructor-position coverage](../reports/2026-09-26-settings-constructor-anchor-boundary.md)
blocks graduation: seed is not accepted for Settings `new MenuController`,
23 conservative batches take 139–146 seconds and diagnostic waiting times out.
Same-position legacy/batched results are exactly equal (267); the different
247-location class-declaration oracle must not be reused. Multi-batch and
declaration-policy characterization pass. Resolve the anchor/proof boundary
with public RED/GREEN before any promotion; R-10 stays Should and default-off.

The [follow-up](../reports/2026-09-26-settings-constructor-conservative-units.md)
has 38 GREEN regressions and default-off all-unit grouping without exclusion.
Real Settings graph is unavailable on omitted targets with default/ohosTest;
94/119-second misses and diagnostic timeout are not optimization success.
Its separate constructor oracle passes legacy. Next: safe public selection
RED/repair and refreshed scope/oracle, then real grouping measurement.

That target-selection RED/repair is now GREEN (38 model/target/unit tests).
Membership restores 30 files; graph remains incomplete on the undeclared local
feature/suggestion dependency. The next Should slice must preserve its closure
without inventing modules. Default-off and real performance gates remain.

That metadata closure is now implemented and measured on Settings:
[report](../reports/2026-09-27-settings-local-package-closure.md). All 32 modules
remain genuine; packages are separate roots. Fourteen active batches return
all eleven exact responses plus normal diagnostics, but 51/55-second misses
and a full-scope closure block graduation. R-10 remains experimental Should;
do not confuse complete graph metadata with general non-module package refs
or a hard 64-file compiler bound.

The same-build file-batch control now passes exactness/diagnostics in 104.5 s.
Grouping improves that to 51.0 s, but raises first-request tree RSS peak by
24.1% (717→890 MB decimal). This single-run trade-off fails no-regression and
500 ms gates; keep the feature experimental rather than changing its priority
or default. Large dependency-closure preparation remains the next bottleneck.
Focused model/LSP/package/target/budget checks pass 99/99; release and real
500 ms gates remain open independently of fixture correctness.

R-11 [startup attribution](../reports/2026-09-27-settings-worker-startup-attribution.md)
now has default-off observation and 41 passing public/focused tests, not
Worker reuse. Three short Settings queries pass exactness/diagnostics; the
constructor probe fails diagnostic timeout despite exact references. Startup
receipt is secondary (6.6% constructor, 7.5–8.4% controls) to Program readiness.
Observed CPU limiting 35→28 prevents release timing comparison. Keep Should
priority and per-batch default; prioritize R-10's compiler-backed constructor
coverage/identity proof rather than claiming shell reuse will reach 500 ms.
The expanded multi-level implicit inheritance and aliased construction
oracle is now GREEN across all three real-LSP profiles and both declaration
policies. R-10 candidate completeness/narrowing is still unimplemented for
this constructor anchor; do not mistake this characterization for optimization.

R-12 pressure hysteresis is implemented: L3 remains active until RSS falls
below the configured recovery target. The committed ratios remain tunable
policy values and still require real-project benchmark review.

### Historical Could

R-13 finer invalidation, R-14 compiler-derived persistence and R-15 reuse by
other global capabilities depend on proven validity and references scheduler
behavior. They cannot be used as shortcuts to the current 500 ms navigation or
original >3 GB memory goals.

### Historical Won't

R-16 a second ArkTS TypeChecker, R-17 identity as today's default, R-18
multiple full-Program Workers and R-19 file-count-only memory extrapolation.
These contradict known correctness or memory evidence. Reconsider only through
a new ADR and independent real-project evidence.

## Direct-import proof safety (2026-09-27)

Must: [actual-cursor compiler agreement](../tdd/references-direct-import-anchor-proof.md)
before accepting a direct index declaration scope. The inherited constructor
false negative and post-export-RPC warming race are reproduced and repaired;
never equate class and constructor proof. Missing proof remains conservative.
Real Settings smoke is exact with normal diagnostics, but first/edit still
exceed 500 ms. Keep constructor completeness and final performance/memory
graduation open; do not promote identity or Worker reuse from this safety fix.
Verification: final authorized `pnpm check:fast` 993/993 PASS, zero skips.

Should R-10 fallback fusion: [complete retry](../reports/2026-09-27-settings-seed-complete-retry.md)
removes redundant standalone anchoring without retaining rejected candidates.
Must correctness/cancellation guards pass; real constructor Locations remain
exact. It does not satisfy Must cold ≤500 ms or constructor candidate proof:
Settings still takes 52.121 s. Keep experimental flags opt-in and memory gates
unchanged. Rejected-batch trace attribution remains a Must observation follow-up.
Fallback-fusion full regression gate: 995/995 PASS, zero failures/skips.

Must observation follow-up is now closed by
[rejected-verifier phase tracing](../reports/2026-09-27-settings-rejected-batch-trace.md):
metrics already captured in failed attempts are retained, trace-off is protected
and unsuccessful attempts are not counted as completed batches. Settings still
needs 52.584 s for exact 267 constructor results, with 43.934 s in compiler
readiness. Must constructor completeness/cold ≤500 ms and final memory gates
remain open; do not promote experiments from an observation-only change.

Must correctness before R-10 constructor narrowing:
[static factory and explicit-constructor barrier guards](../tdd/references-constructor-search-boundaries.md)
pass across the existing public profiles and both declaration policies. These
extend the supported search-scope oracle without changing production semantics.
Constructor candidate implementation/graduation and 500 ms remain open.
Final authorized full gate is now **996/996 PASS**, zero failures/skips,
908,988.667 ms; final-build Settings manifest preflight passes. This completes
regression verification only, not Must product latency/memory graduation.

Should R-09/R-10: [single full-search proof](../tdd/references-full-search-coverage.md)
is implemented to avoid repeating an already complete compiler search. Must
scope integrity requires one Program's actual search to include every original
member and overlay; a disconnected inherited call keeps the remaining batches.
New public 4/4 plus existing 7/7 regression pass. This is not constructor index
completeness, a new default, Worker reuse or a Settings 500 ms graduation.

The [Settings coverage replay](../reports/2026-09-27-settings-full-search-coverage.md)
is exact (267) with normal diagnostics, but no whole-scope proof fires and the
cold request remains 54.306 s. Must constructor completeness and ≤500 ms are
not closed; the Should prerequisite cannot stand in for those gates.

Fresh full regression of this implementation is **1,000/1,000 PASS**, exit 0,
zero failures/cancellations/skips/todos (932,570.833 ms). This closes the Should
slice's regression gate, not the remaining Must latency/memory requirements.

Should R-10 lexical prerequisite is now implemented as a standalone public core
API: [TDD evidence](../tdd/references-class-heritage-facts.md). Must fail-conservative
guards cover unsupported heritage/templates/expressions/escaped identifiers;
the API's completeness is explicitly not semantic constructor proof. Rust
workspace 96 PASS/1 existing ignored, release build and public stdio 9/9 pass.
Four fixed Settings files remain incomplete; no index admission/default change.
Must persistence/generation/reopen, binding resolution, constructor exactness,
cold/edit ≤500 ms and final memory graduation remain open. Prior 1,000-test
fast gate is not relabeled a fresh gate for this new slice.

Must R-10 persistence/generation/reopen is now **closed as a prerequisite** by
[heritage storage](../tdd/references-class-heritage-storage.md): MemoryStore/
SQLite preserve facts and uncertainty, old caches retain unknown markers,
cleanup/rollback are atomic, and concurrent migrations are serialized safely.
Workspace 105 PASS/1 existing ignored, experimental 10/10, public stdio 9/9,
release/check/build pass. This does not close Must constructor semantics:
binding/alias/re-export and compiler-backed inheritance/factory search remain
unproven for narrowing. Fixed Settings/API24, cold/edit ≤500 ms, original
>3 GB reproduction and final memory graduation remain the required gates.
No Worker reuse/default promotion or new whole-fast-suite claim.

Storage slice's [fixed Settings replay](../reports/2026-09-27-settings-class-heritage-storage.md)
is exact (267) with normal diagnostics, but cold remains **56.953 s**. Must
≤500 ms is explicitly FAIL; storage completion does not graduate narrowing.
Node sampled peak 748,716,032 bytes is one smoke observation, not a passed
memory reduction or retention gate.

Should R-10 [unique base discovery](../tdd/references-class-base-bindings.md)
is GREEN as a standalone fresh-source API (12/12; workspace 117 PASS/1 ignored;
stdio 9/9). Must correctness guard rejects duplicate snapshots, binding
collisions, dropped numeric syntax/quoted modifiers, unsupported aliases and
cycles. This is not a second TypeChecker and has no production narrowing
consumer. Generation-bound validated binding integration and compiler-backed
constructor coverage remain Must prerequisites before R-10 promotion.
Settings/API24 and ≤500-file-line limits stay fixed; cold/edit ≤500 ms and
original pressure/memory gates remain open. No new whole-fast gate claimed.

Must R-10 **source-validated binding persistence/single-generation read** is
GREEN as a prerequisite: [snapshot TDD](../tdd/references-class-binding-snapshot.md).
Old/unsupported bindings stay unknown and cannot exclude files. MemoryStore/
SQLite snapshots agree after reopen and concurrent generation changes; schema
11/111 migration is isolated and atomic. Workspace128 PASS/1 ignored,
experimental19/19, public stdio9/9 and release/check/build pass.

Must current-overlay admission, consuming the snapshot in binding discovery,
compiler-backed constructor completeness, exact public differential and
Settings/API24 ≤500 ms remain open. This is not constructor narrowing or a
second TypeChecker. No Worker/default/SDK change, performance graduation or
new whole-fast-suite claim. [Regression evidence](../reports/2026-09-27-settings-class-binding-snapshot.md)
is tracked separately from semantic proof.

Must R-10 **standalone captured-snapshot/current-source discovery** is GREEN:
[overlay TDD](../tdd/references-class-binding-overlay.md). Source replaces disk
facts without persistence; malformed traversed source cannot revive old success.
Admission/unknown/cycle/generation guards and public SQLite reopen pass.
Workspace146 PASS/1 ignored, experimental24/24, real stdio9/9 and release/
check/build GREEN. Shared-kernel extraction preserves existing source behavior;
new handwritten modules/tests≤500 and touched core parent shrinks.

Must production snapshot/DocumentAuthority admission and authoritative
extensionless availability remain open. A bounded unknown/missing row is not
an absence certificate; every relevant active overlay requires one fenced
workspace/document revision. Must compiler-backed constructor completeness,
exact differential, fixed Settings/API24 ≤500 ms and final memory graduation
are **not closed**. [Regression evidence](../reports/2026-09-27-settings-class-binding-overlay.md)
is separate. No constructor exclusion, default/SDK/Worker/schema change,
new whole-fast claim or commit/push/merge.

Must R-10 **bounded discovery transport** is implemented through the existing
sidecar plus Node port: [protocol TDD](../tdd/references-class-binding-protocol.md).
Identity/readiness/generation guards, bounded unique URI/overlay inputs and
canonical result mapping preserve unknown/error instead of unsafe success.
No persisted overlay, new schema/database, production references RPC or
constructor narrowing is introduced.

Must production authoritative snapshot capture (including every relevant open
buffer), source-availability proof and final revision recheck remain open.
Compiler-backed constructor coverage and exact public differential must pass
before exclusions. Settings/API24 ≤500 ms, original >3 GB and final memory
graduation remain unfulfilled; transport completion is not performance proof.

Transport slice validation is GREEN: Rust155/1existing ignored, experimental24,
Node75 (realrelease included), full fast **1,047 PASS /0 skipped/cancelled/todo**,
release/runtime builds and format/diff. New source/tests≤500; large touched
parents shrink. [Same-build evidence](../reports/2026-09-27-settings-class-binding-protocol.md)
does not close production snapshot/constructor coverage or latency/memory.

Must R-07/R-10 **managed candidate-stage freshness** is implemented with
[actual public RED/GREEN](../tdd/references-candidate-snapshot.md). Cancellation
before synchronization, frozen entrance query values and managed root/config
revisions prevent old discovery from overwriting new document truth or mixing
SDK states. Physical aliases and overlapping roots share revision/cache
invalidation; proven disjoint sibling scopes remain independent. The real LSP
nested transcript maps semantic stale input to ContentModified, preserves normal
diagnostics and recovers exact results. Seven observed gaps were repaired without
changing compiler scope, defaults or memory budgets.

Must complete authoritative overlay/source-availability admission and compiler
constructor search coverage are **still open**. Ready sidecar generation and a
managed mutation fence do not prove unobserved disk changes, extensionless source
absence or inherited constructor identity. Do not exclude constructor candidates
or promote R-10 from these correctness passes. Fixed Settings/API24 remains the
real-project regression; ≤500ms, original>3GB and final memory gates are unchanged.

Latest candidate-snapshot Settings/API24 same-build smoke:267 exact, normal
diagnostics,55.479s, Node sampled peak759,275,520 bytes. Constructor seed still
falls back to14 conservative batches; ≤500ms FAIL and memory no-regression
remains unproven. [Raw evidence/report](../reports/2026-09-27-settings-candidate-snapshot.md).
No original>3GB reproduction, default promotion or commit/push/merge.

Must current-source whole-fast gate remains **unpassed**. Authorized rerun was
stopped with759 passing/5 failing log lines under machine load298.77 and
4,143.75MiB swap use; targeted retry-edit failure overlapped that suite.
Neither an idle independent reproduction nor a root cause is established.
Require idle targeted recheck and a complete fresh whole gate before progress
or merge, retaining all assertions. [Failure report](../reports/2026-09-27-settings-candidate-snapshot.md).

Idle targeted recheck now passes the same five cases, **5/5** in12.030s without
source, timeout or assertion changes. This does not close the Must whole-fast
gate: the independent full rerun completes RED, **997/1,056 PASS;59 FAIL**, with
zero cancelled/skipped/todo, including other short
production LSP cases. Default API24 SDK discovery is observed, but does not
explain the missing-SDK logging failure. Independent same-build default/missing
SDK controls, logging and403-file exact references pass with unchanged deadlines.
A separately explicit fixture-controlled whole gate is running, not yet GREEN.
Keep the failed host-default gate; do not disable real Settings/API24 tests or
promote a production default from these targeted passes.

The complete separate fixture-controlled whole gate now passes **1,056/1,056**,
exit0,2,012,515.851ms; zero failures/cancelled/skipped/todo. It uses a verified
absent `ARKLINE_HARMONY_SDK_PATH` only for inherited fixture fallback; explicit
SDK configurations and real Settings/API24 stay unchanged. Deadlines,
assertions, source and artifact hashes were not altered. The earlier59
default-host failures remain an open integration/timing problem; controlled
GREEN does not certify cold≤500ms, final memory gates or constructor narrowing.

Must SDK configuration ownership now has
[actual repeated RED/minimal GREEN](../tdd/references-sdk-configuration-ownership.md):
capture one owned clone before revision/cache mutation and send the same value
to the Worker. The original SDK terminal and five exact Locations survive
caller-object mutation. Do not reinterpret invalid explicit configuration as
fallback or claim arbitrary non-JSON input compatibility.

Must current-source validation is still RED: combined15/43 with28 timeout
failures, followed by sequential post-extraction port6/9 withthree timeouts.
Independent new SDK-owner test passes; neither it nor the previous version's
1,056 GREEN replaces a fresh gate. No relaxed deadlines or default change.
Must project-selection ownership needs a separate public self-package/target
mutation RED before implementation. Complete source admission, constructor
narrowing and Settings/API24 ≤500ms/final memory gates remain open.

Must fixed Settings/API24 compatibility replay now completes **FAIL**:
references and enabled normal diagnostics time out at180s. Only three of14
conservative batches complete; no exact final Locations and no partial result.
An exit0 shutdown is not successful navigation. Coarse/incomplete RSS evidence
cannot graduate memory. [Current evidence and command](../reports/2026-09-27-settings-sdk-configuration-ownership.md).
Must validation remains RED: do not start the next narrowing/admission change
or relax any timeout/SDK/diagnostic/default. Host pressure is measured, not
proven as the sole cause; the new SDK-only ownership fixture remains GREEN.

Must unchanged-source revalidation now records43/43 original focused tests
and one267-exact Settings/API24 constructor replay with normal diagnostics.
The98.039s cold response still fails500ms. Fresh whole-fast completes RED:
1,015/1,058 PASS,43 FAIL,exit1; the bounded independent recheck is1/6 PASS,
5 FAIL. Project-object ownership and source/constructor admission must not
advance yet. The catalog case passes five exact Locations before failing a
whole-request elapsed budget, not an index-only measurement. Keep prior failures and unchanged
deadlines/defaults; [chronological evidence](../reports/2026-09-27-settings-timeout-revalidation.md)
does not establish a sole environmental cause or graduate release memory.

Must timeout investigation now includes
[protocol/startup controls](../reports/2026-09-27-settings-timeout-boundary-controls.md):
3/3 and5/5 isolated PASS coexist with an interrupted/non-PASS whole attempt and
an original2s CLI timeout. Later startup controls all pass unchanged. One small
framed-LSP fixture completes at4,298ms cold/39.7ms warm with matching labels and
normal diagnostics; SDK is null, so these failures cannot be attributed solely
to full SDK preparation. Root cause remains unproven. Keep current whole gate
RED and subsequent ownership/admission work unpromoted; no deadline relaxation
or substitution for Settings/API24 validation.

Should R-10 [2026-10-03 re-export anchor seed](../reports/2026-10-03-settings-reexport-anchor-seed.md):
the Settings/API24 `HomeInitData` named re-export is direct-index `unsupported`,
so the control pays a separate compiler anchor before its exact final batch.
A **default-off** single-line unaliased discovery seed removes that duplicate
preparation while retaining original-cursor compiler proof. Six fresh real
replays preserve the nine exact Locations; request medians are 7.184/4.456 s
off/on, product RSS peak medians 617.2/605.6 MB. Public tests reject aliased
and wrong same-name seeds with complete fallback; additional public tests
pass declaration inclusion, unsaved-reference edit cancellation/retry and
explicit cancellation. One Settings mode-C pair passes 11/11 exact in each
arm, including an unsaved comment edit, but is not a statistical gate. This
is a narrow Should experiment, not a Must correctness-gate change, default
promotion, 500 ms
attainment, full memory/PSS graduation or approval of Worker residency.

The next Should-level control used the same real cursor with
`includeDeclaration=true`: seed-off/on returned identical ten-Location sets,
including the declaration, in 7.491/4.506 s (one pair). A separately pinned
trace-only build passed the ten-Location oracle and attributed 1.139 s to
document preparation, 2.991 s to final verification and only 49 ms to the
compiler reference query. The sub-costs inside document preparation are not
yet separated. No preload/closure reduction or production default is approved
from this one run; S05's 1.10 resource gate and the 500 ms target remain open.

The separately pinned six-phase Settings control shifts the Should R-10
investigation away from speculative preload removal: cold membership costs
987–1,010 ms, preload 21–54 ms, and an edit-warm miss still spends 2.157 s
in compiler `createProgram` after membership is reused. No new Must/default
implementation is approved by this trace. S05 resource graduation remains
the gate for any compiler-state retention.
