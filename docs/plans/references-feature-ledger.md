# References / semantic Feature Ledger

Current governance: [semantic-ready execution plan](2026-09-29-semantic-ready-execution-plan.md),
[product contract](semantic-ready/product-contract.md), [MoSCoW](references-moscow.md)
and [ADR 0007–0013](../adr/README.md). This remains the **only active Ledger**.
S00 documentation is integrated. S01 harness and candidate-ready controls are
implemented but not graduated: semantic readiness FAIL, incomplete bucket coverage;
S02's public-checker binding projection hypothesis is FAIL at the mandatory
constructor gate; S03 is BLOCKED. S05 is IN_PROGRESS: default-off context
lifecycle/rebuild reasons and compatible-disk local-LS prototype implemented, default off; graduation open;
S04 and S06–S12 remain NOT_STARTED.
See the [single S01 report](../reports/2026-09-29-semantic-ready-s01-baseline.md)
and [S02 counterexample](../reports/2026-09-29-semantic-ready-s02-facts-spike.md).
The [single S05 report](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
records public focus37/37 and same-build Settings trace-on/off, 9/9 exact each.
Trace-off warmed definition48ms and references4,647ms are single observations,
not P95 or reuse graduation. LS sequence is not compiler Program identity;
no retention, SDK scope, worker lifecycle or budget policy changed.
The S05 prototype admits only fully delivered ordinary disk deltas with exact revision spans;
100 fixture disk edits, fresh normal type diagnostics and alias/undelivered-source guards protect
the prototype. Host versions include existing source fingerprints against counter collisions.
Unedited Settings off/experimental replays are regression controls, not disk reuse or SLO evidence.
Latest delivered-disk source focused72/72 PASS/exit0 includes both alias policies and
four deletion order/consumption cases; unknown in-root deletion now durably advances revision.
This shared freshness fix and source-version composite also execute with reuse off;
turning off reuse is not reverting the old build. The original whole failure remains
historical and its timeout cause is still unproven; a later current-source whole gate passes below.
Latest same-build Settings off/experimental (one unedited ModeB run each) are9/9 exact,
normal diagnostics0/exit0; warmed definition33ms, references3,473/3,578ms.
This is a regression control, not real edit savings or ready-state P95/500ms graduation.
The single-edit Settings/API24 checkpoint has three fresh trace-off processes per arm:
definitions and shifted 9/9 references exact, normal v1 TS2339 and clean source;
post-edit definition medians off/experimental 1,811/281 ms, references 6,597/6,611 ms
via safe `workspace-changed` fallback, Node RSS peak medians essentially equal.
This is narrow local-LS evidence, not Program identity or P95/500 ms graduation.
The pinned 100-operation Settings mixed replay then completed one fixed-order A/B:
each arm exact 100 edited definitions, 11 full references, 11 cross-module definitions,
normal exact diagnostics, Level3 ack at 50 and exact recovery at 51. Experimental/off
sampled Node peak RSS was 2,146,119,680/1,341,296,640 B = **1.600×**, failing
the ≤1.10 gate; an unpaired experimental-only repeat peaked at 1,796,046,848 B.
Primary-definition/references medians were 311.815/261.549 and 6,698.945/6,007.669 ms; default stays off, S05 IN_PROGRESS.
The current-build two reversed-order Settings 100-operation pairs are again exact,
but experimental/off post-edit definition P95 is 1,657/278 and 1,608/272 ms.
RSS peak ratios 1.079×/0.929× do not establish a stable memory benefit; the
compatible-disk LS candidate **fails latency graduation** and remains default-off.
[S05 report](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md) retains raw curves; reuse-off queue-start and verifier batch-start cancellation controls pass, not experimental/all-batch proof.
An earlier S05 whole-fast was1160/1161 PASS,1 FAIL/exit1: original-deadline struct
response4 timeout; isolated replays did not supersede that run. The initial
current-worktree 1177/1177 full PASS preceded a CLI safety patch that rejects report
destinations inside original Settings/SDK (including symlink aliases) and unavailable
source git status. An intervening sandboxed `ps` permission-denied run was stopped/exit1
and is environmentally invalid, not a code regression or PASS. The latest approved
macOS process-sampling `/usr/bin/caffeinate -i pnpm check:fast` is
**1181/1181 PASS, exit0**, zero fail/cancel/skip/todo (duration 1,195,387.333352 ms).
One post-patch real Settings experimental smoke also passed exact before/after definitions,
9/9 references, normal v1 TS2339 and exit0; it is not a repeated A/B/P95 sample.
The prior failure remains historical, but current source no longer has an unpassed
whole-fast gate. This does not identify the original 20 s timeout cause or graduate S05.
S01 focused29/29 and fresh whole-fast1147/1147 PASS/exit0 at unchanged frozen
inputs certify tooling/regressions, not semantic readiness or 500 ms product graduation.
D-01–D-09 are local
Issue drafts, not GitHub numbers; no Issue was created or closed.
Requirement documented / Planned / Spike-required / Implemented / Experimental
and Graduated are distinct: existing implementation tests do not prove the new
ready-state SLO. R-04/05/06/08/12 are reused, not newly implemented here.

Explicit priority changes: R-13 conservative incremental maintenance and R-14
feasibility spike are now Must; fine-grained invalidation remains proof-gated
Should. R-15 global capability reuse is Should, R-11 shell reuse is Could, and
R-12 pressure response is Must. S02 FAIL blocks production facts/schema;
S05 remains independent after S01. R-09 is already implemented default-off,
not reset to the attachment's older Research state. R-20 is reframed as
initial preparation availability, not a candidate-ready shortcut.

Current implementation baseline: `911ae43c` (PR #91 merged; baseline fast
**1103/1103 PASS**). The preceding R-09 source has its own
**1116/1116 whole-fast PASS**. The current literal-root source has focus38/38
plus dependency strengthening1/1 GREEN; its fresh frozen whole gate is
**1133/1133 PASS, exit0**, zero failures/cancellations/skips/todos, with unchanged
source/test/build byte inventory and artifact/SDK/oracle postflight.
The historical combined gate is1124/1125 PASS,
1 FAIL; negative-lookup recovery focus is 31/31 PASS and the final replacement
whole-fast is **1126/1126 PASS, exit 0**, zero failures/cancellations/skips/todos.
No focused rerun supersedes a whole gate. Dated checkpoints below are historical evidence; their
old FAILs and counts are not the current baseline. Priority is product priority, not a claim of
completion. An item is complete only after its linked gate passes; see the
[current execution plan](2026-09-29-semantic-ready-execution-plan.md).
The [preceding plan](2026-09-20-references-latency-execution-plan.md) and dated
checkpoints below retain their original build evidence and previous priorities.
Historical cold/didOpen timings are not semantic-ready bucket measurements;
the new initial-preparation exemption neither graduates nor rewrites them.

| ID | Priority | Feature | State | Dependency and observable exit |
| --- | --- | --- | --- | --- |
| R-01 | Must | Phase-level semantic tracing | Implemented: batch timeline, queue/candidate/anchor correlation and opt-in compiler `getProgram` / `createProgram` / `getTypeChecker` split | Real-LSP exactness GREEN; external trace-off RSS and fixed real-project benchmark belong to R-02 |
| R-02 | Must | Fixed manifests and exact oracle | In progress: Settings declares compile API 23; selected API 24 is pinned for same-SDK compatibility A/B/C, not SDK equivalence. Standard-library delivery and runtime-asset preflight passed. `HomeInitData` now has three fresh process/index-cold runs per strategy for both declaration settings: all 9/9 without declaration and 10/10 with declaration were exact, with zero target-file diagnostics. With-declaration request medians: legacy 9,030 ms, pure batched 90,894 ms, indexed-batched 5,107 ms; product RSS peak medians: 788,803,584, 743,411,712 and 554,479,616 bytes. `MenuController` has pinned 248/247-location oracles for both settings but only single-run opposite-policy evidence and one unresolved TS 2307 diagnostic. No cold result met 500 ms | [Original Settings matrix](../reports/2026-09-21-settings-api24-reference-matrix.md), [with-declaration matrix](../reports/2026-09-21-settings-with-declaration-matrix.md), [standard-library report](../reports/2026-09-21-settings-api24-standard-library.md): expand randomized/mode-C samples, edit diagnostic/freshness coverage, native Windows, diagnostic triage, original >3 GB and final 50%/PSS release gates. Retain separate matched-API-23/DevEco gate |
| R-03 | Must | Budget-aware hot context retention | Feature-gated experiment and three-versus-three real Settings mode-B A/B GREEN for exactness, not graduated; `dispose` remains default. New trace-gated batch-start RSS/heap instrumentation passed its public LSP test | `HomeInitData` 9/9 each run; retained events 1→1/`removed=false` versus dispose 1→0. Observed reference medians 4,072 versus 4,404 ms, full-run product peak medians 1,129,537,536 versus 1,136,500,736 bytes: small differences, both near 1.13 GB. One warmed trace-on `dispose` run still had 733,794,304 B Node RSS before verifier admission after resident 1→0. A subsequent isolated three-control/three-probe replay found no Node RSS decrease during any one-second no-forced-GC pause after disposal. This does not prove live double Program, a leak, or retention benefit. Next: larger randomized sample, post-eviction PSS and ≤500 ms progress. The 1,024 MiB budget is not a hard process cap. [Matrix](../reports/2026-09-21-settings-api24-reference-matrix.md), [phase report](../reports/2026-09-21-settings-post-retention-memory-trace.md), [idle probe](../reports/2026-09-21-settings-disposal-idle-probe.md) |
| R-04 | Must | Complete-result cache v1 | Implemented: pre-index bounded cache, complete results only, conservative overlay/config/workspace invalidation; F6b moves proven hits ahead of diagnostic quiescence | Real LSP RED/GREEN and three same-build Settings/API-24 mode-C runs: 27 hits, median 67 ms, observed P95 96 ms, max 100 ms, all exact. Larger release samples and mutation/SDK matrix remain open; [F6b report](../reports/2026-09-21-settings-api24-diagnostic-cache.md) |
| R-05 | Must | In-flight coalescing | Implemented | Real LSP proves one verification, independent client cancellation, shared ContentModified invalidation, and no cross-version join |
| R-06 | Must | Interactive/global lanes | Implemented for references; F6b lets complete cache hits bypass diagnostic quiescence, not misses | Real LSP proves definition/hover bypass delayed references and correct mutation freshness; F6b RED/GREEN proves cached references finish before a held diagnostic settles while versioned diagnostics still publish. Cold/miss latency and wider release sampling remain open |
| R-07 | Must | Index trust/fallback integrity | Partial: current-source consumer plus default-off empty/literal module exclusion consumed; general constructor scope proof open | [Literal-root RED/GREEN](../tdd/references-constructor-literal-roots.md): 10->6 actual batches, exact sets with unknown inherited caller and omitted-root dependency; focus38/38 plus strengthening1/1 and fresh whole-fast1133/1133 PASS/exit0. Worker/owner old-token current reads and final recheck preserve membership/dependencies/overlays; changed proof restores complete work. [Settings](../reports/2026-09-29-settings-constructor-literal-roots.md) is11x267 exact/valid but0 rule hits,14+14 batches and61.205/61.528s; nine existing hits27-51ms. No Settings/500ms/default graduation. The preceding empty-module/freshness build has its own1126/1126 historical gate |
| R-08 | Must | Index resync recovery | Implemented | Real LSP proves mutation → safe legacy fallback → committed generation advance → indexed recovery with exact Locations |
| R-09 | Should | Resident full-scope references fast-path | Implemented default-off; current 18-case public coverage and final whole-fast 1126/1126 GREEN after absence-identity recovery | [TDD](../tdd/references-resident-fast-path.md): unchanged full Program and original cursor; unrelated sibling mutation no longer evicts negative evidence, actual load/configuration guards retained. [Six fixed Settings runs](../reports/2026-09-29-settings-resident-fast-path.md) each give 267 exact Locations, but all enabled queries miss at L3 and retain 24 batches; medians refs101,011/97,490 ms and warmup28,696/33,257 ms. Settings admission/graduation unqualified; no real reuse saving, budget increase or default promotion |
| R-10 | Should | Anchor reuse/fusion | Default-off warm memo, local-export and unaliased re-export cold seeds implemented; graduation open | [Warm RED/GREEN](../tdd/references-anchor-reuse.md), [local-export RED/GREEN](../tdd/references-local-export-anchor-seed.md), [re-export RED/GREEN](../tdd/references-reexport-anchor-seed.md) and [Settings A/B plus mode C](../reports/2026-10-03-settings-reexport-anchor-seed.md) preserve compiler authority and exact results. Fixture include-declaration/edit/cancel and Settings 11-query comment-edit replay pass; the single mode-C pair is not a distribution. Cold seeds require proof plus original-cursor validation in each final batch; mismatch discards/retries. All flags stay off. No verifier residency change; broader symbol/SDK, distribution, memory/freshness/500 ms gates remain blocking |
| R-11 | Could | Worker-shell reuse spike | Startup attribution measured; reuse not implemented/graduated | [Default-off trace and four real probes](../reports/2026-09-27-settings-worker-startup-attribution.md): constructor diagnostics FAIL; three short-query controls exact/diagnostic PASS. Startup secondary at 6.6% / 7.5–8.4% there, not a universal ratio or 500 ms solution. Later [original-deadline small-fixture controls](../reports/2026-09-28-settings-source-availability-consumer.md) fail with/without RSS sampling; startup receipt is their largest wall field, not pure creation CPU. S05 may test this separately; no default promotion without meaningful latency gain and peak ≤ per-batch ×1.10 |
| R-12 | Must | Memory hysteresis | Implemented | L3 remains active until RSS falls below the configured target; coordinator and production-worker regressions GREEN; reused by S05/S12, not recreated |
| R-13 | Must | Conservative incremental facts/overlay maintenance | Planned; NOT_STARTED; finer dependency invalidation remains proof-gated Should | S07 after S04/S06; existing DocumentAuthority/ProjectGraph own changes; new file facts replace old, public/global changes expand invalidation, unknown goes coarse; ordinary edit waits still count toward 500 ms |
| R-14 | Must | Compiler-derived facts feasibility, then conditional persistence | S02 tested public-checker-binding-projection-v1 FAIL; production/schema blocked | [S02](../reports/2026-09-29-semantic-ready-s02-facts-spike.md): 8 ordinary/alias + class-control exact; constructor false/true miss2/3. Extraction0 references and independent facts consumer; focused41/41 GREEN certifies tooling, not projection. Other mandatory kinds/Settings NOT_RUN. New compiler-hook hypothesis or independent S05 needed; no N×full-workspace preparation and no S03 until complete proof |
| R-15 | Should | Reuse proven global lifecycle for other capabilities | Planned; existing LSP capabilities unchanged; new routes NOT_STARTED | S08/S10/S11 one capability or direction per slice; reuse lanes/freshness, independently prove implementation/rename/call semantics; no empty universal framework |
| R-16 | Won't | Second ArkTS TypeChecker | Rejected | Rust index must not become semantic truth |
| R-17 | Won't | Identity as production default now | Rejected pending proof | Known SDK-import false negative |
| R-18 | Won't | Multiple full-Program Workers | Rejected | Duplicates SDK/Program memory; global concurrency stays one |
| R-19 | Won't | File-count-only memory model | Rejected | Use measured RSS/PSS and Program closure, not linear extrapolation |
| R-20 | Must | Initial preparation availability (reframed) | S04 preparation/progress/semantic readiness planned, NOT_STARTED; preceding opt-in wait/SQL reuse not graduated | Three Settings index-cold runs are exact/one-batch at 537–560 MB but take 39.8–50.5 s and delay diagnostics; legacy takes 8.6–9.6 s at 838–964 MB. Fresh-catalog SQL trace localized activation to reference inserts and commit; a second exact 9/9 three-run trace split median 6.06 s reference work into 3.69 s occurrences, 1.75 s identity work, 0.42 s bindings and 0.10 s aliases, with 3.13 s commit. A one-run stack sample implicates automatic WAL checkpointing but not an end-to-end saving. A 96-row insert A/B regressed activation and was removed. Default wait stays off. Current [recovery/SQL reuse](../reports/2026-09-28-settings-catalog-recovery-identity-sql.md) restores the old-binary real baseline and reduces fixture Rust allocation requests, not proven latency/RSS/CPU. S04 must prove semantic readiness; initial-preparation exemption does not turn historical slow/failing samples into PASS. Exit still requires current full validation, ready-state navigation/diagnostic gate, randomized strategy samples and original >3 GB pressure case; [wait](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md), [rejected A/B](../reports/2026-09-22-settings-sqlite-batch-rejected.md), [SQL stages](../reports/2026-09-22-settings-sqlite-stage-profile.md), [subphases](../reports/2026-09-22-settings-reference-insert-subphases.md) |
| R-21 | Must | Ready-state full-response 500 ms contract | S01 public suite/control implemented; no product graduation. 56 exact references, 50 repeated cache hits; first-query/body-edit controls slow, READINESS_UNSUPPORTED and missing buckets retained | S00/S01/S12; each capability/bucket P95≤500 ms; preparation separate, normal edit/new symbol/module/eviction waits included; [contract](semantic-ready/product-contract.md), [S01 evidence](../reports/2026-09-29-semantic-ready-s01-baseline.md) |
| R-22 | Must | Versioned semantic readiness | Planned; NOT_STARTED | S03/S04/S07; semantic owner consumes valid compiler-derived generation/input/coverage; candidate committedGeneration keeps its original meaning |
| R-23 | Must | Bounded first preparation and progress/cancellation | Planned; NOT_STARTED | S04 after S02/S03; existing supervisor/Coordinator and standard progress; valid capability-ready only; whole lifecycle memory measured |
| R-24 | Must | Definition/typeDefinition ready-state graduation | Existing capability; new path/graduation NOT_STARTED | S05/S09a/S12; compatible hot LS or proven projection; exact URI/UTF-16 sets and each normal bucket ≤500 ms; no unnecessary cold rebuild after references |
| R-25 | Must | Implementations ready-state graduation | Existing capability; independent projection NOT_STARTED | S02/S08/S12; interfaces/override/generic/aliases/new implementations exact; references/lexical heritage are not implementation proof |
| R-26 | Must | Completion/auto-import/hover/signature graduation | Existing capabilities; new reuse/graduation NOT_STARTED | S05/S09b/S12; official hot LS, current overlay, existing completion edit/sort/snippet/isIncomplete contracts; discovery not another whole-workspace Program |
| R-27 | Must | Safe prepareRename/rename fast path | Existing capability; new path NOT_STARTED | S10a/b after S06/S07/S09; conflict/legality and complete versioned WorkspaceEdit; temporary-copy application validates result; positions alone are insufficient |
| R-28 | Should | Call hierarchy ready-state routing | Existing capability; new path NOT_STARTED | S11a/b/c after S06/S07/S08; separately proven call projection, direction/fromRanges/item freshness; preserve old capability while ungraduated |
| R-29 | Must | Diagnostics and resource/formatting coexistence | Existing capabilities; new readiness regression NOT_STARTED | S09c/S12; normal diagnostics codes/ranges/versions and background freshness separate from request SLO; optimize only measured gaps, no second linter LS |

## Historical implementation checkpoints

The following preserves earlier states and prioritization as dated evidence,
not a second active status table. Current R-13/R-14/R-15 priority is defined above.

Preceding empty-module checkpoint (2026-09-29): R-07's first safe, default-off exclusion actually
removes redundant transient verification in its public fixture (6→2, exact).
Settings has no matching proof: 11×267 exact, cold/edit still14+14 batches.
General inherited-constructor coverage stays open. The first whole-fast is
1124/1125 PASS,1 FAIL; negative-lookup recovery passes31/31 focus, not a whole
gate. Final-artifact Settings is11×267 exact/valid, normal diagnostics/exit0;
0 rule hits/14+14 batches, cold/edit57.394/58.108s, nine existing hits25–32ms.
Replacement whole-fast is **1126/1126 PASS, exit 0**, zero failures/
cancellations/skips/todos. No real-workload graduation follows.

Prior R-09 checkpoint (2026-09-29): the production-consumed R-09 path and its
freshness guards pass full public coverage. Six fixed Settings/API24 replays
are exact, but none qualifies for reuse under the original budget; fresh
complete fast regression is **1116/1116 PASS, exit0**, zero failures/
cancellations/skips/todos at unchanged deadlines and runtime pins.
This removes redundant compiler preparation when complete hot state already
exists; it is not another observation-only round. R-07 constructor-specific
exclusion, R-11 Worker reuse and the independent release gates remain open.
Could R-13–R-15 remain deferred, not silently marked done.

Prior checkpoint 2026-09-29:
[awake-host recovery and fixed Settings](../reports/2026-09-29-awake-regression-gate-recovery.md)
has focus9/9 and complete `check:fast` **1093/1093 PASS,exit0**, zero failures,
cancellations/skips/todos at unchanged deadlines and artifact pins. Prior
FAILs remain historical; no lifecycle/formatting fix is claimed. Settings
mode C is **11 × 267 exact/valid**, normal version2 diagnostics/exit0;
ready8.076s/committed insertion7.094s, cold/edit **59.478/60.195s**, nine hits
**25–46ms**, sampled product peak **1067745280 bytes**. One same-build run
does not graduate R-02/R-03/R-10/R-11/R-20, cold500ms or memory/PSS gates.
R-07's next production-admission step still needs constructor-specific
evidence for every excluded legal source plus complete overlays, as specified
in [ADR0005](../adr/0005-index-proof-trust-boundary.md). No unused certification
port or binding RPC is added; class/base provenance alone cannot prove scope.

Prior regression checkpoint 2026-09-29: [temporary verifier formatting control](../reports/2026-09-29-verifier-whitespace-control.md)
has baseline **2 PASS/1 FAIL**, whitespace **1 PASS/2 FAIL** at the original
30 s recovery deadline. A compact failed sample overlaps **1,803 s Idle Sleep**;
keep its failure, exclude it from latency comparison. Three complete cases
preserve 43-result/21-batch assertions, not independent tuple-oracle equality.
Baseline bytes are restored/hash-checked; no production/build or lifecycle change,
formatting promotion, causal speed/RSS claim or fresh whole-fast GREEN follows.
Whole-fast remains **1,090/1,093 PASS, 3 FAIL, exit 1**. R-11 and regression
recovery remain open; recorded awake conditions precede another performance gate.

Latest R-20 checkpoint 2026-09-28:
[unchanged-binary Settings/API24 mode-C recovery](../reports/2026-09-28-settings-catalog-recovery-identity-sql.md)
is ready in **9.638 s**, with **8.601 s** committed insertion, **11 exact
267-Location responses**, normal version-2 diagnostics and exit 0. Cold/edit
requests remain **67.053/77.261 s**; nine cache hits are **31–60 ms**. Rejected
constructor seeds still lead to 14 complete-scope batches. The original public
constructor regression recovers **1 PASS/0 FAIL** at its unchanged **30 s** RPC
deadline. Prior readiness/constructor/whole-fast failures are retained below;
recovery neither proves a sole cause nor graduates first-click readiness.

Subsequent [public identity SQL reuse RED/GREEN](../tdd/references-identity-sql-reuse.md)
retains one lazy full **256-row SQL String per insertion operation**, with
existing tail construction and disposal at return. Exact MemoryStore candidate/
proof and reopen parity stay GREEN; cost RED **5,341 > 4,598** becomes GREEN
**4,289**, **19.7% fewer** current-thread Rust allocation requests. SQL shape,
order, row counts, cross-document buffering, schema and durability are unchanged.
This is not RSS, CPU or latency proof; the real recovery uses the old native
artifact. No constructor narrowing, `identity` default or Worker lifecycle
change follows. Final Rust workspace is **182 PASS/0 FAIL/1 existing ignored**;
strict Clippy/default-feature release pass. New-native Settings is **11 × 267
exact/valid**, normal diagnostics/exit 0, cold/edit **65.491/79.556 s**, hits
**31–41 ms**. Sampled product peak **1,225,367,552 bytes** is 14.3% above the
preceding single baseline, not a memory or causal performance win. **Current
full `check:fast` is FAIL: 1,090/1,093 PASS, 3 response-2 timeouts, exit 1,
zero cancelled/skipped/todo.** Definition failures have warm/fresh-process
ambiguity; cancellation passes but the third case's 30 s recovery times out.
Unchanged-deadline isolated rechecks are **2 PASS/1 FAIL**; old-native recovery
also times out. They are separate evidence, not whole/performance PASS.
No phase or gate promotion;
cold/edit 500 ms, original >3 GB/final 50% memory, PSS/DevEco and native Windows
remain open.

Prior consumer checkpoint 2026-09-28: [current-source consumer](../tdd/references-source-availability-consumer.md)
has actual public safety/success REDs and 171 Rust PASS/1 existing ignored,
release/typecheck/build GREEN, public Node focus96/96 and framed-LSP17/17 GREEN.
Required fresh texts/overlays replace persisted facts, even at unchanged
generation; unknown alternatives remain unknown. One fixed
[Settings replay](../reports/2026-09-28-settings-source-availability-consumer.md)
returns 267 exact Locations, diagnostics/exit 0 in **144.399 s** after seed
rejection and 14 complete batches. Sampled Node/tree peaks are
696,737,792/700,014,592 bytes; actual sampling median 212 ms, not nominal 50 ms.
The retained whole-fast is FAIL/exit 1: 1,078/1,093 PASS, 15 failures. Post-failed-run
public preflight matches frozen pins, not a passing suite. The serial original-
artifact 15-case recheck finishes 12 PASS/3 FAIL: installed-package initialize
at 5 s, constructor references at 30 s and scheduling trace lifecycle.
Installed-package initialize then passes three isolated reruns with its unchanged
5 s deadline; constructor references still times out on response 6 at 30 s,
without a semantic diff verdict. Restricted sampler failure is retained separately.

Further original constructor recheck fails at response 7 in `trace-off` after
the no-declaration query succeeds in 29.104 s. Two external log-retention
controls fail at response 6 in `indexed-batched`, with and without RSS sampling,
without changing the 30 s deadline or any source/asset. Catalog is ready; class
seed rejection correctly retries all 16 legal members in 15 batches. Completed
Programs contain 2–5 project files, 52 library files and no SDK declarations.
Startup receipt is the largest observed wall field in these controls; it and
Program readiness cannot be summed as disjoint CPU. Sampled server PID peak
226,635,776 bytes is small-fixture evidence, not Settings or >3 GB graduation.
The regression gate remains RED; R-07/R-10 cannot advance on these controls.

The [module-cache/CPU follow-up](../reports/2026-09-28-constructor-worker-module-cache-control.md)
records one complete cache-enabled constructor PASS and two cache-disabled
FAILs at unchanged deadlines. A disabled batch's startup receipt is 20.181 s
versus 0.974 s Program readiness. Tiny canonical probes measure about 311/187 ms
mean pre-ready thread CPU for off/warm configurations, not a cause of that
outlier or a graduated optimization. R-11 stays experimental; production
bundles/defaults and the whole-fast/constructor admission gates stay unchanged.
The temporary original-verifier prefix probe also times out at 30 s; one late
retry records parent startup 6.802 s, child load wall 4.033 s and thread CPU
0.727 s. This is wall/CPU attribution, not a sole IO/scheduler/GC cause or a
default-path fix. No returned partial scope substitutes for a complete result.

The [OS-wait follow-up](../reports/2026-09-28-constructor-worker-os-wait-control.md)
retains original30s failures with and without native sampling; process-resource
observation records pre-ready5.788s wall/1.031s thread CPU alongside whole-PID
major faults1,835/involuntary switches28,756. An explicit Node20.19.5/no-preloader
control also fails the with-declaration request after a15.164s successful
no-declaration query. No final cross-profile equality or fresh whole-fast is
reached. Delayed whole-PID stack samples and whole-host swap/CPU pressure do
not identify a sole cause or prove a speed/memory fix. R-07/R-10 admission and
R-11 graduation remain blocked by the same regression gate; no defaults change.

Subsequent read-only host preflight retains CPU limits48–55% and swap used
8,378.75–8,453.50MiB, with no executable-filtered test process remaining. Six
runtime/test pins still match. No new replay/build/whole-fast runs under that
pressure; R-07/R-10 require a lower-pressure original-deadline regression cycle
before admission. Application helper counts are not a proven timeout cause
and do not authorize closing applications or changing production policy.

The [initial-CPU100 replay](../reports/2026-09-28-constructor-initial-cpu100-replay.md)
still fails the original30s gate at Direct's no-declaration query, after both
Target constructor queries pass. Server logs retain all14 complete retries and
late10-location completion at30.155s, not client acceptance/final exact equality.
Preflight100/postflight62 CPU readings are not a constant controlled condition.
No source/default/Worker/deadline change or fresh whole-fast follows; R-07/R-10
admission and R-11 graduation remain blocked by regression recovery.

The [current-build Settings mode-C attempts](../reports/2026-09-28-settings-mode-c-catalog-blocked.md)
add two catalog-ready FAILs at the unchanged180 s deadline, including normal
OS environment. They stop before didOpen/references; R-04/R-02 cache/edit and
exactness verification are not evaluated. Low pre-reference RSS is not memory
graduation. Catalog recovery joins the existing original-regression/whole-fast
gate before R-07/R-10 admission; artifacts/defaults/diagnostics remain unchanged.

The [phase/native catalog diagnosis](../reports/2026-09-28-settings-catalog-activation-native-profile.md)
adds two pre-reference180 s FAILs. All1846 files reach activation; a bounded
owned Rust sample shows reference insertion/cache-spill writes, not COMMIT.
WAL grows to294,073,272 bytes; neither catalog is ready. R-20 recovery and
R-02/R-04 validation remain open; no low pre-query RSS or scripted trace-test
GREEN substitutes for real readiness, original regression or whole-fast.

R-01/R-20 [live catalog stage observation](../reports/2026-09-28-settings-catalog-live-stage-trace.md)
is implemented/default-off with public RED/GREEN and177 Rust PASS/1 existing
ignored; best-effort file IO does not change transaction results. Current
Settings mode-C is still pre-reference180 s FAIL. Captured1846 inputs and
637203/3662/20516 occurrence/alias/binding rows match history; no insertion
end/index/commit/ready is observed. R-02/R-04 verification, R-20 recovery and
original regression/whole-fast remain open; this is not a memory/default or
constructor-narrowing graduation.

R-01/R-20 [bounded insertion progress](../reports/2026-09-28-settings-catalog-insert-progress.md)
is default-off/public RED→GREEN,181 Rust PASS/1 existing ignored, release built.
Same real replay remains180s ready-gate FAIL before didOpen/references. Prefix
1344/1846: occurrence64.302s/66.32%, identity21.397s/22.07%, bindings10.275s,
aliases0.979s. Executed/buffered counts differ and are uncommitted; no full-run
or compiler/peak proof. R-20 and original regression/whole-fast remain open;
R-07/R-10,500ms and memory/default promotion cannot advance from this slice.

The minimal [scheduling test correction](../tdd/references-scheduling.md)
checks exactly `["define", "hover"]` and queue wait <250 ms during active references,
then audits current definition with `request.completed` after settlement.
All public bypass, ContentModified (-32801), edited exact-result assertions
and deadlines remain. Three independent reruns are GREEN; the related five-file
focus is **51/51 GREEN**, exit 0, zero failures/cancellations/skips/todos,
**55,935.865402 ms** total. No new whole-fast follows this test change, so the
retained 1,078/1,093 failure remains open and constructor/narrowing cannot advance.
No production references consumer, constructor exclusion,500ms or memory
graduation follows. Complete caller admission and compiler-backed search scope
remain R-07/R-10 gates.

Prior capture checkpoint 2026-09-28: [caller-owned capture](../tdd/references-source-availability-capture.md)
closes managed parent-root, producer API, unwatched-change and alias false-absence
REDs. Capture/port/Worker focus **95/95** and existing framed-LSP freshness/search
focus **17/17** pass; typecheck/build GREEN. One fixed
[Settings/API24 replay](../reports/2026-09-28-settings-source-availability-capture.md)
returns 267 exact Locations, diagnostics/exit 0 in **60.533 s**; sampled
Node/tree peaks 763,441,152/766,730,240 bytes. Seed rejection and 14 complete
batches remain. Fresh controlled whole-fast is **1,092/1,092 GREEN**, exit 0,
zero failures/cancellations/skips/todos; post-gate public preflight matches the
fixed project/SDK/oracle/runtime and frozen-source fingerprints without server
launch or output creation. No prior-source/default-host gate is inherited.
This producer neither admits stale persisted source contents nor guarantees
caller enumeration completeness nor enables Rust consumption or constructor
exclusion. R-07 consumer admission, R-10 coverage, 500 ms and memory gates remain open.

Prior transport checkpoint 2026-09-28: [source-availability transport](../tdd/references-source-availability-transport.md)
has actual Node/NDJSON REDs and final public GREEN: Rust 13/13, workspace
159 PASS/1 existing ignored, release build, Node 98/98. It does not capture
physical absence or enable extensionless/constructor narrowing. One fresh
[Settings/API24 replay](../reports/2026-09-28-settings-source-availability-transport.md)
returns 267 exact Locations with diagnostics/exit 0 in 58.759 s; sampled
Node/tree peaks 738,242,560/741,486,592 bytes. Rejected seed and 14 complete
batches remain. Fresh controlled whole-fast is **1,081/1,081 GREEN**, exit 0,
with zero failures/cancellations/skips/todos. Post-gate public preflight matches
the frozen project/SDK/oracle/runtime fingerprints, without a server launch or
output creation. No prior-source gate or default-host SDK certification is inherited.
R-07 physical availability/freshness and R-10 compiler constructor coverage
remain open, as do 500 ms and original/final memory graduation.

Prior presence checkpoint 2026-09-28: open-source presence and physical-drift public
RED/GREEN pass **13/13**, final focused regression **95/95**. Proxy 631→614
lines retains migration debt. Fresh final-source controlled whole-fast is
**1,062/1,062 GREEN**, exit 0 with zero failures/cancellations/skips/todos;
runtime hashes match the replay, not inherited from the previous source. One fixed
[Settings/API24 replay](../reports/2026-09-28-settings-open-source-presence.md)
returns 267 exact Locations with diagnostics/exit 0 at **60,696 ms**, sampled
Node/tree peaks 745,988,096/748,888,064 bytes. Seed rejection still invokes 14
complete batches; R-07 full availability/absence, R-10 constructor coverage,
500 ms and final memory gates remain open. No default promotion follows.

Prior project checkpoint 2026-09-28: the unchanged-source controlled whole gate is
**1,058/1,058 GREEN** ([recovery](../reports/2026-09-28-regression-gate-recovery.md));
preceding failures/interruption remain historical evidence. The next project
ownership repair has actual independent REDs and 61/61 focused GREEN. Its fresh
controlled whole-fast run is **1,060/1,060 GREEN**, exit 0 with no failure,
cancellation, skip or todo; this is not inherited from the prior build. One fixed
[Settings/API24 replay](../reports/2026-09-28-settings-project-configuration-ownership.md)
is 267 exact/normal diagnostics, 58,636 ms RPC and 755,515,392-byte product peak.
The constructor still rejects the class seed then checks 14 complete-scope
batches; this is not a latency or constructor-narrowing graduation. Proxy 631
lines remains migration debt. R-07 source/overlay admission, R-10 compiler
search coverage and 500 ms/final-memory gates remain open; defaults unchanged.

R-06/R-10 [lifecycle follow-up](../tdd/references-reopen-mutations.md): two
public close/reopen replays reproduce a fatal Worker error and 30-second
references timeout. Preserve the queued close instead of coalescing it into
the next open; 54 focused tests and the fresh full `check:fast` **966/966** pass
with eight anchor transcripts. Defaults,
diagnostics, residency and result completeness remain unchanged; this does
not graduate the Settings latency or memory gates.

R-10 source-freshness follow-up: disk edits before watcher delivery now reject
memo reuse using bounded prepared-source fingerprints; a moved declaration is
verified at its new exact position. **63/63 focused tests** pass, including ten
anchor transcripts. Separate same-build Settings control/reuse observations
are 6,292/4,423 ms and 894,902,272/1,007,587,328 peak RSS bytes, both exact 9/9.
One pair does not establish a distribution. Memory regression keeps the flag
off; no complete compiler dependency-coverage or release graduation claim.

R-06/R-10 interruption characterization: two further public transcripts pass
after a validated-anchor hit, proving cancellation/no partial result and edit
ContentModified with exact same-process recovery including a new unsaved
reference. Twelve anchor cases now exist. No production change or Settings
cancellation-latency graduation is implied.
The fresh current-worktree **970/970 `check:fast`** run is GREEN, with no
failures/cancellations/skips/todos and unchanged source-snapshot runtime pins.
The real Settings memory/no-regression and 500 ms gates remain open.

R-02/R-04 [current-build default mode-C follow-up](../reports/2026-09-26-settings-default-mode-c.md):
three independent Settings processes, trace off and anchor reuse disabled,
return all 33 responses exact 9/9, with normal version-2 empty target diagnostics.
Each records nine cache hits and two misses. The 27 cached hits have median
2 ms, observed P95 3 ms and max 4 ms; first/edit medians remain 7,247/5,673 ms.
Product-tree peak RSS is 530,329,600–577,314,816 bytes, without a paired legacy
control or PSS comparison. This extends cache/freshness smoke to the usage-site
symbol; cold/edit 500 ms and broader release gates stay open. Do not pool with
older/different-build symbols or infer a retention plateau from the short burst.

R-02/R-07 startup follow-up: the new
[real Settings immediate-catalog replay](../reports/2026-09-21-settings-immediate-catalog-replay.md)
reproduced a first-request failure under the pinned API-24 compatibility
configuration. With generation 0 stale, indexed-batched planned 23 complete
scope batches and timed out after 120 seconds with 11 complete; the catalog
became ready during that query without causing a replan. Two legacy controls
returned all nine exact Locations but took 31.6–38.1 seconds and peaked at
about 875–910 MB product-tree RSS. This does not graduate R-02, prove a
safe legacy default, or close the broader R-07 trust matrix. F5/R-08's
post-mutation catch-up does not cover initial catalog warming. The runner's
new immediate/ready switch and [public protocol test](../tdd/references-immediate-catalog-replay.md)
make the first-click state measurable without changing production semantics.

R-20 [row-volume evidence](../reports/2026-09-26-settings-reference-row-volumes.md):
three fresh Settings processes each returned exact 9/9 and inserted the same
836,501 reference rows (637,203 occurrences; 175,120 distinct per-document
identities; 3,662 aliases; 20,516 bindings). Full-batch/remainder counters are
public-test GREEN. A measured 22% CPU speed limit excludes the new timings
from graduation and cross-date comparisons; first-click/500 ms and final
memory gates remain open. Next quantify storage/WAL amplification.

R-20 [page/WAL follow-up](../reports/2026-09-26-settings-catalog-storage-profile.md):
three fresh exact 9/9 runs have identical 305.719 MiB B-tree allocation; 95.60%
is reference storage and 52.43% is reference indexes. The independent opt-in
read-only scan costs 5.4–27.8 seconds and is not a release performance mode.
Physical WAL length is not cumulative I/O amplification. Next test one
duplicate-primary-key layout candidate with row/query/migration/rollback
equivalence and trace-off ready/RSS comparisons. Production SQL remains unchanged.

R-20 [fresh-only layout candidate](../reports/2026-09-26-settings-occurrence-layout-experiment.md):
compile-time opt-in schema 109 retains all reference rows and exact Settings
Locations, reducing B-tree allocation 29.59%. Default schema 9 migrations stay
GREEN. Trace-off references still take seconds and product RSS is not lower;
no promotion or memory-graduation claim. Experimental/production cache profiles
are mutually rejected; production migration and rollback are not implemented.

An [opt-in initial-catalog wait slice](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md)
now has public-LSP RED/GREEN for generation-zero warming, not-yet-open sidecar,
cancel and held-status deadline. Three independent real Settings/API-24
index-cold requests returned 9/9 exact references in one batch, with 39.8–50.5
seconds request latency and 537–560 MB observed product-tree RSS peaks. This
eliminates the fixed 23-batch timeout only when enabled; it is **not a default
fix**. Diagnostics were delayed until after references, so R-02 latency,
R-07 broader trust and the final memory gate stay open.

R-03 follow-up: an [isolated explicit-GC diagnostic](../reports/2026-09-21-settings-disposal-gc-probe.md)
replayed three fresh Settings processes per arm after the no-forced-GC idle
check. All six returned the same nine exact references. A GC call in the
copied semantic Worker reclaimed roughly 0.51 GB of its used heap after
logical disposal, while whole-Node RSS immediately fell only ~21 MB; later
product peak RSS medians were 1,100,734,464 B without the call and
832,151,552 B with it. This is evidence of collectible post-disposal heap,
**not** a passed release gate or authorization to force GC in production.
R-03 remains feature-gated with `dispose` default.

R-01/R-10 [isolated-anchor phase follow-up](../reports/2026-09-26-settings-anchor-compiler-phases.md):
the existing default-off trace now separates anchor Program preparation and
definition lookup. Public RED/GREEN, check/build and 43 focused regressions
pass on the new pinned build (not a new full-suite claim). Three Settings
processes give 33 exact responses; first anchor/final preparation medians are
1,714/2,623 ms, queries 12/49 ms. Cold fusion and candidate-preparation
attribution remain open; no verifier lifecycle/default change or 500 ms pass.

R-01/R-10 [document attribution](../reports/2026-09-26-settings-anchor-document-preparation.md):
37 focused tests and three fresh Settings processes pass; all 33 responses
remain exact with normal diagnostics. Documents take median 873/14 ms
first/edit, but two cold Programs remain. New trace is default-off and the
legacy engine shrinks six lines through cohesive extraction (1,080 lines
remaining debt). The next measurement is index RPC/source-resolution cost;
0.55–1.22 s candidate remainder is not assigned to Rust. No 500 ms or memory
graduation, cold fusion, Worker retention or default change.

R-01/R-10 [candidate-phase follow-up](../reports/2026-09-26-settings-candidate-phases.md):
public RED/GREEN and 40 focused regressions pass. Three pinned Settings
processes return 33 exact responses. First declaration RPC/source proof
medians 485/290 ms and edit 306/310 ms now separate index-port costs from
compiler cold preparation. Source proof contains an index retry; no pure
SQLite attribution is claimed. Proxy shrinks nine lines (975 remaining debt).
R-10 cold reduction is still open; no default change or 500 ms/memory pass.

The first implementation checkpoint is R-01. Settings/API-24 compatibility
runs are valid for pinned, same-SDK strategy comparisons and performance
investigation; they cannot mark a matched API-23 or diagnostic-equivalence
gate complete. Three cold samples do not yield a stable P95 or graduate F2.
Three independent warmed mode-B `HomeInitData` runs also passed 9/9 exact
references: completion/definition/references medians 8,613/37/4,404 ms and
full-run product peak median 1,136,500,736 bytes, about 2.04× the mode-A
indexed median under a different workflow. Completion/definition contents were
not oracle-checked, and warmed state may explain part of the RSS peak. A
single mode-C run returned 11/11 exact responses, with nine unchanged repeats
at 2–3 ms and a 3,855 ms post-edit request; only one version-2 diagnostic
publication was captured. These are smoke observations, not release proof.
Do not pause this track solely because API 23 is unavailable.

R-10 follow-up: multi-batch seed/declaration-policy characterization plus
transport tests pass **25/25**, with production unchanged. The
[real Settings constructor-position probe](../reports/2026-09-26-settings-constructor-anchor-boundary.md)
is a negative gate: seed not accepted, 23 conservative batches per miss,
139/146-second requests and automatic diagnostic timeout. Same-position fresh
legacy returns exactly the same 267 Locations in 10.7 seconds. The 247-location
class-declaration oracle is not validated for this query; the new manifest is
unverified and both raw runner FAIL statuses are preserved. Next R-10/R-07
slice must characterize compiler constructor/class identity and isolate the
proof-rejection predicate before fixing performance. Neither default promotion
nor 500 ms/correctness/release graduation is justified by this probe.

R-10/R-07 [follow-up](../reports/2026-09-26-settings-constructor-conservative-units.md):
38 public/transport regressions pass. Rejection is incomplete identity at
matching ready generation; class/constructor equality is not assumed.
Default-off all-unit grouping preserves complete candidates, but Settings graph
is unavailable on native/network omitted targets with default/ohosTest.
Eleven exact 267-location results still take 94/119 seconds on misses with
diagnostic timeout; same-build legacy passes in 9.2 seconds. Next selection
RED/repair must refresh scope/oracle before another performance claim.

Target selection repair subsequently passes its RED/GREEN and 38 model/target/
unit tests. Native/network scopes are ready; 30 files are restored. Graph is
still incomplete on phone's existing undeclared local feature/suggestion edge.
Safe local-package closure is next; no invented module or default promotion.

Fresh post-fix full-scope legacy explicitly matches the 267-location comparator
in 9,500 ms, with normal diagnostics and 748,560,384-byte process-tree peak.
This validates the restored-scope query, not indexed grouping or 500 ms.

R-07/R-10 [package closure](../reports/2026-09-27-settings-local-package-closure.md):
real graph ready/complete with separate package metadata roots, no invented
module. Opt-in grouping is active: 14 batches/miss, eleven exact responses,
version-2 diagnostics. First/edit 51/55 seconds and largest closure 1,496 files
still fail latency and small-Program expectations. Full mode-C tree peak
972,840,960 bytes is not compared to mode-A as a paired memory win. General
non-module package-reference support remains fail-closed; default unchanged.

Same-build flag-off comparison completes exact/diagnostic PASS: 24 batches,
104,540 ms. Grouping takes 50,991 ms but raises equivalent first-request tree
peak from 716,783,616 to 889,757,696 bytes. R-10 is not graduated: fewer Programs
are useful evidence, not a memory/500 ms gate. Next target is repeated large
closure preparation; retain all legal candidates and compiler authority.
Post-fix focused verification is 99/99 across three commands, plus typecheck;
this does not substitute for full check:fast, release or platform gates.

R-01/R-11 [startup attribution](../reports/2026-09-27-settings-worker-startup-attribution.md)
is default-off and public-TDD GREEN (41 focused tests). Constructor probe
returns exact 267 but times out diagnostics; do not relabel FAIL. Three
independent HomeInitData controls are exact 9/9 with normal diagnostics.
CPU_Speed_Limit snapshots 35→28 prohibit performance graduation. Worker
startup is secondary to compiler preparation; no new residency/reuse flag or
default is introduced. The next R-10 multi-level inherited-constructor
alias/super characterization is now GREEN across three real-LSP profiles;
it expands/reruns one of the existing tests. Compiler-backed constructor
candidate completeness remains the next open gate; class proof is insufficient.

## Direct-import safety follow-up (2026-09-27)

R-07/R-10: [compiler anchor agreement](../reports/2026-09-27-settings-direct-import-anchor-proof.md)
repairs a reproduced direct-import constructor false negative, not just adds
profiling. Class-export metadata is discovery only; each final batch validates
the original definition at the exact metadata position. Mismatch/freshness
failure discards partial work and uses complete semantics. Constructor alias
and inheritance exact differential and the post-metadata warming race are
public RED/GREEN. Settings class/import control: all 12 responses exact,
normal v1/v2 diagnostics; cache 48–89 ms, first/edit 5,556/5,175 ms.
Constructor-specific narrowing, 500 ms cold/edit, original >3 GB and final
memory gates remain open. No new Worker residency or default experiment.
Final authorized fast gate: 993/993 PASS, zero failures/skips; this closes the
repair's regression gate, not the outstanding product graduation gates.

R-10 [complete retry after seed rejection](../reports/2026-09-27-settings-seed-complete-retry.md):
avoid a second isolated definition Program by discarding narrowing and verifying
the full immutable snapshot directly. Constructor/alias/shadow/cancel/edit
exactness passes. Settings: 267 exact, normal diagnostics, 14 complete batches,
52.121 s; cold 500 ms and constructor narrowing remain open. Rejected-batch
phase metrics remain an observation follow-up, not counted as successful batches.
Final authorized fast gate: 995/995 PASS, zero failures/skips. This completes
fallback-fusion verification, not constructor candidate or performance graduation.

R-01/R-10 [rejected-verifier observations](../reports/2026-09-27-settings-rejected-batch-trace.md):
default-off rejection event now retains existing verifier timings/source counts
and memory, distinct from successful batches. Public trace-off, constructor,
shadowing, multi-batch and cancellation/edit: 6/6 focused PASS. Settings exact
267/normal diagnostics; 52.584 s, 849,014,784-byte Node peak. Readiness including
the rejected attempt is 43.934 s (~83.6%); observation follow-up closed, not
constructor completeness or cold ≤500 ms. No new full fast-gate claim.

R-07/R-10 [constructor search boundaries](../tdd/references-constructor-search-boundaries.md):
additional public characterization PASS (1/1, four profiles/both policies).
Static `new this()` is included and inherited calls beyond an own constructor
are excluded. The test remains 489 lines; production behavior is unchanged.
These are required completeness guards, not a constructor index implementation
or a latency improvement. Final authorized `pnpm check:fast` is **996/996 PASS**,
exit 0, zero failures/cancellations/skips/todos, 908,988.667 ms. It includes the
rejected-verifier observations and expanded constructor characterization.
Final-build Settings preflight matches; constructor narrowing and performance
graduation remain open, not inferred from a full correctness regression gate.

R-09/R-10 [one completed full-search proof](../tdd/references-full-search-coverage.md):
implemented a bounded early-completion primitive, not constructor narrowing.
One exact, unique-anchor compiler search must cover original membership,
query and all overlays; otherwise remaining batches continue. No candidate
count/loaded-file inference or cross-batch union is accepted. New public
4/4 and existing constructor/cancel/phase/batching 7/7 pass. Full performance
and regression graduation remain separate; do not infer Settings speedup from
the synthetic correctness fixture. Per-batch isolation and defaults stay fixed.

[Same-build Settings replay](../reports/2026-09-27-settings-full-search-coverage.md):
267 exact, normal diagnostics, 54.306 s/841,601,024-byte Node peak. No single
Program covers all 1,496 members (max 1,348), so no batch is skipped. R-10 real
constructor latency remains open; this is not a performance graduation.

Coverage implementation final full gate: **1,000/1,000 PASS**, zero
failures/cancellations/skips/todos, 932,570.833 ms, exit 0. R-09/R-10 prerequisite
regression closed; constructor candidate completeness/performance remain open.

R-10 [class-heritage lexical prerequisite](../tdd/references-class-heritage-facts.md):
standalone public Rust API implemented, 10/10 metadata tests GREEN; existing
25 core tests retain legacy token behavior after cohesive extraction. Workspace
96 PASS/1 existing ignored; release build/check/build and real-stdio LSP 9/9
pass. Class/base spellings are discovery only; incomplete syntax cannot exclude
files. No DocumentSymbols/SQLite/protocol/planner integration or constructor
proof is claimed. [Four fixed Settings files](../reports/2026-09-27-settings-class-heritage-facts.md)
all withhold lexical completeness. Persistence/bindings/compiler-backed
constructor coverage and ≤500 ms remain open; no performance claim or new
whole-fast-suite gate. Rust lib debt shrinks 2,224→1,973 lines; new files ≤500.

R-10 [heritage storage/generation prerequisite](../tdd/references-class-heritage-storage.md):
completed MemoryStore/SQLite roundtrip, same-snapshot served generation,
incremental/full catalog cleanup, rollback and old-cache migration. Schema
10/110 is isolated; old absent facts remain unknown, never complete-empty.
Concurrent opens exposed and fixed a duplicate-column migration race.
Workspace 105 PASS/1 existing ignored, experimental 10/10 and public stdio
9/9 PASS; release/check/build GREEN. No new constructor candidate proof,
protocol/default change or whole-fast-gate claim. Binding/alias/re-export
resolution and compiler constructor coverage are next; cold/edit ≤500 ms
and memory graduation remain open.

[Storage same-build Settings replay](../reports/2026-09-27-settings-class-heritage-storage.md):
267 exact/normal diagnostics; 56.953 s, Node sampled peak 748,716,032 bytes.
All 14 fallback batches remain necessary; no constructor proof or performance
graduation. A single smoke result cannot establish no-regression/P95.

R-10 [fresh-source base-binding discovery](../tdd/references-class-base-bindings.md):
unique local/named-import/explicit-re-export aliases implemented with strict
source provenance and conservative unknown outcomes. New 12/12, workspace
117 PASS/1 existing ignored, release/check/build and stdio 9/9 GREEN. Core lib
shrinks 1,683→1,630; new modules/tests ≤500. This closes standalone discovery,
not generation-bound binding persistence/protocol/planner integration or
compiler-backed constructor candidate coverage. Settings source probes remain
unknown; [same-build evidence](../reports/2026-09-27-settings-class-base-bindings.md)
cannot graduate R-10, ≤500 ms or final memory gates. Legacy lossy bindings
cannot be consumed as an exclusion proof. No production/default change.

R-10 [validated binding storage snapshot](../tdd/references-class-binding-snapshot.md):
bounded requested-URI bindings/provenance/heritage are now read with one
generation in MemoryStore and SQLite. Schema 11/111 keeps legacy provenance
unknown; existing searches remain compatible. Atomic writes, WAL reader/writer
snapshot, rollback/reopen and queued migration parity pass. No extra binding
table, sidecar endpoint, planner consumer or constructor completeness proof.

Workspace **128 PASS/1 existing ignored**, experimental **19/19**, release/
check/build and actual stdio **9/9 PASS**. New files ≤500; oversized parent
core/SQLite/test files shrink but remain recorded debt. Open-overlay admission,
snapshot resolver integration and compiler-backed constructor coverage remain
next. [Fixed Settings evidence](../reports/2026-09-27-settings-class-binding-snapshot.md)
does not graduate cold/edit ≤500 ms or final memory gates.

R-10 [captured snapshot/source-overlay discovery](../tdd/references-class-binding-overlay.md):
standalone public Rust adapter is GREEN. Current source replaces persisted
facts in an immutable operation-local set; invalid traversed buffers cannot
fall back to disk. Validated generation/URI/provenance, explicit import/re-export
chains, UTF-16 spans, alias collisions/cycles and close/reopen parity are covered.
New snapshot extensionless hops remain unknown without source-absence proof;
the old fresh-source contract is preserved by a shared kernel.

Workspace146 PASS/1 ignored, experimental24/24, release/check/build and real
stdio9/9 PASS. Core lib shrinks1,603→1,557; new modules/tests≤500. Production
DocumentAuthority/sidecar/planner admission, authoritative extensionless source
availability and compiler-backed constructor completeness remain open. Caller
must supply all relevant overlays from one fenced revision; same generation
alone is not complete freshness. [Settings evidence](../reports/2026-09-27-settings-class-binding-overlay.md)
does not graduate latency/memory or enable candidate exclusion. No default,
SDK, Worker, schema or memory-policy change; no new whole-fast-suite claim.

R-10 [bounded sidecar / Node discovery boundary](../tdd/references-class-binding-protocol.md):
the existing workspace session now transports one bounded captured binding
snapshot plus operation-local overlays. Exact session identity, ready matching
runtime/snapshot/expected generations, input budgets and strict canonical URI
mapping are enforced. Stale reopen/invalid source cannot revive known discovery;
invalid input errors are distinct from conservative unknown results. No schema
or second database. Lexical success is not constructor identity or search proof.

Production snapshot capture/freshness, all relevant open-overlay admission and
authoritative extensionless source availability remain open. No discarded
per-references RPC, planner consumer or candidate exclusion is added. Compiler
constructor coverage, exact differential and Settings/API24 ≤500 ms/final
memory gates remain required; no default/Worker/SDK/memory-policy promotion.

Transport validation: Rust155 PASS/1existing ignored, experimental24/24,
Node75/75 including realrelease, `check:fast` **1,047 PASS** with zero runtime
annotations; builds/format/diff pass. New modules/tests≤500, modified oversized
parents shrink and remain debt. [Same-build report](../reports/2026-09-27-settings-class-binding-protocol.md)
keeps correctness compatibility separate from unfulfilled performance gates.

Fixed Settings/API24 regression:267 exact with normal diagnostics,53.419s,
sampled Node843,595,776 bytes;1 rejected seed plus14 conservative batches.
Cold≤500ms FAIL; single-run memory no-regression is not established. Production
snapshot/source availability and compiler constructor coverage remain next.

R-04/R-06/R-07/R-10 [production candidate-stage freshness](../tdd/references-candidate-snapshot.md)
now has actual RED/GREEN for old-text rollback, no-signal mutations, SDK changes,
mutable caller inputs, nested-root revision/cache scope and LSP error mapping.
Queries retain entrance values, cancellation stays live, and managed mutation /
configuration revisions fence asynchronous admission and final publication.
Canonical aliases and parent/child roots share revision/cache invalidation;
unavailable identity fails conservative. Actual-worker characterization preserves
independent sibling queries/cache. Real stdio verifies ContentModified (-32801),
fresh exact results and normal diagnostics rather than fatal Worker/timeout or
InternalError. This is not constructor coverage or the binding RPC's production
planner consumer. R-10 stays experimental; ≤500ms and final memory remain open.

Candidate-snapshot frozen-source regression146/146 GREEN; same-build fixed
Settings/API24 first request267 exact,55.479s, sampled Node759,275,520 bytes.
Constructor seed still rejects and executes14 complete conservative batches;
all-attempt Program readiness46.500s (~83.8%). Cold≤500ms FAIL, single-run memory
no-regression unproven. [Replay/report](../reports/2026-09-27-settings-candidate-snapshot.md)
preserves raw curve, request/diagnostic timeline and exact results.

Merge/advance gate remains unpassed: fresh authorized whole-fast was stopped
under severe measured machine pressure after759 passing/5 failing log lines;
the retry-edit targeted selection also timed out while overlapping that run.
No completed full-suite result or root-cause proof is claimed. Require idle
targeted reproduction and whole-fast GREEN; do not replace it with146 focused
passes or weaken timeouts. [Details](../reports/2026-09-27-settings-candidate-snapshot.md).

The unchanged idle five-case recheck now passes **5/5**,12.030s, but the separate
whole-fast rerun completes **997/1,056 PASS;59 FAIL**, zero runtime annotations.
Host-default API24 SDK
selection is observed in several short production fixtures, not established as
the sole cause (the missing-SDK logging case also failed). R-07/R-10 cannot
advance on focused passes alone. Same-build isolated default/missing-SDK
call-hierarchy tests both pass (4.660/1.895s whole tests); logging and403-file
exact references controls pass with original deadlines. A separate full gate
with explicit fixture SDK environment remains pending. Keep default-host
failure and real Settings/API24 gates separate; no production policy changes.

Completed fixture-controlled whole-fast: **1,056/1,056 PASS**, exit0,
2,012,515.851ms; zero failures/cancelled/skipped/todo. The only environment
control is the verified-absent
`ARKLINE_HARMONY_SDK_PATH=/private/tmp/arkts-fast-sdk-control-missing-20260927`;
explicit SDK fixtures retain their own configuration. No source, deadline,
assertion or artifact change. This is a separate code-regression GREEN,
**not resolution of the preserved59 default-host failures**, cold≤500ms or
R-10 narrowing graduation. [Report](../reports/2026-09-27-settings-candidate-snapshot.md).

R-07 SDK caller-object ownership now has
[actual repeated RED and minimal GREEN](../tdd/references-sdk-configuration-ownership.md).
`configureSdk` retains/sends one owned clone before revision/cache changes;
the Node proof and real compiler Worker keep the original SDK despite caller
mutation. Original conservative fallback already returned five correct
Locations; no missing-reference or performance fix is claimed. Undefined/null/
empty/invalid semantics are not normalized into fallback.

Current-source broader validation remains RED: combined15/43,28 timeouts;
post-extraction port6/9,three timeouts. Isolated SDK ownership passes, but prior
1,056 GREEN cannot certify changed source. Project-selection ownership remains
unimplemented and requires its own self-package/target mutation RED. Complete
binding source admission, constructor narrowing, ≤500ms and final memory stay
open; no default promotion or merge. Proxy658 lines remains migration debt.

R-07/R-10 current fixed Settings/API24 regression is **FAIL** at the original
180s references/diagnostic waiters. Three of14 conservative batches complete;
no final response/267-location exact comparison and no partial success. Sampled
Node695,377,920 bytes with actual486–2200ms sampler gaps cannot establish full
peak or a memory improvement. Graceful exit0 is not references success.
[Failure evidence](../reports/2026-09-27-settings-sdk-configuration-ownership.md).
Do not advance the production binding/constructor slice on the isolated SDK
GREEN. Current broader gate, default-host timeout investigation and final
latency/memory remain open without deadline/default changes.

Subsequent [unchanged-source revalidation](../reports/2026-09-27-settings-timeout-revalidation.md)
passes the original43-case focus43/43 and completes one fixed Settings/API24
replay with267 exact Locations and normal diagnostics. Harness latency98.039s
still fails500ms; externally sampled Node803,155,968/tree806,420,480 bytes
with127–441ms gaps is not a paired PSS/release-memory verdict. The original
timeouts remain preserved. Fresh whole-fast completes RED:1,015/1,058 PASS,
43 FAIL, exit1; the independent failing-boundary recheck is1/6 PASS,5 FAIL.
The catalog case returns five exact Locations but fails its whole-RPC wall
budget; this is not an index-only measurement. R-07 cannot advance to
project-object ownership or constructor narrowing yet.
No implementation/default/deadline change in this revalidation.

Further [unchanged-source timeout controls](../reports/2026-09-27-settings-timeout-boundary-controls.md)
record3/3 isolated and5/5 bounded PASS, but the next whole attempt is interrupted
after failures, not completed GREEN. Original2s non-LSP CLI test fails; later
rotated startup controls pass unchanged. The diagnostic small-fixture real LSP
returns exact matching completion labels in4,298ms cold/39.7ms warm with normal
diagnostics and one null-SDK selection. Do not substitute these for fixed
Settings/API24,500ms, full regression or memory gates; no new implementation
slice/default is advanced on this evidence.

R-01/R-10 [2026-10-03 Settings re-export and six-phase trace](../reports/2026-10-03-settings-reexport-anchor-seed.md):
one real API24 `includeDeclaration=true` seed-off/on pair returned the same
10 exact Locations and normal diagnostics; first requests were 7.491/4.506 s.
A trace-only build passed public LSP RED→GREEN and a further 10/10 mode-A,
11/11 mode-C real oracle. Cold membership costs 987–1,010 ms, preload 21–54 ms;
after an unsaved comment membership is ~0.05 ms but compiler `createProgram`
remains 2.157 s and references 3.094 s. This closes narrow attribution and
declaration-inclusive controls only. R-10 remains default-off, S05 resource
FAIL, S03 BLOCKED, and ≤500 ms/final memory gates remain open.
