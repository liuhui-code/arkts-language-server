# References / semantic Feature Ledger

Current baseline (2026-10-11): PR #95 merged to main `a111235b`.
[ADR 0015](../adr/0015-default-resident-optimization-policy.md) enables the six
selected optimizations by default, with explicit opt-outs. The tested PR head
and main have the same tree. Local and Linux fast roots passed 1585/1585, and
[GitHub CI](https://github.com/liuhui-code/arkts-language-server/actions/runs/38109980966)
passed. These code regressions do not graduate L08.

The [effective-combination comparison](../reports/2026-10-11-resident-effective-combo-comparison.md)
retains 40/40 exact results but second-scale edited queries, no clear RSS benefit
and DEGRADED readiness, on its own pre-default-change build. The
[pressure-recovery fix](../tdd/l08-pressure-recovery.md) closes the general Worker
recovery defect with 54 successful scale-workflow sessions and 15 post-pressure
completion recoveries; its 3.3–6.0 s recovery cost remains a performance problem.
Earlier whole-fast and workflow failures remain attached to their original builds.

Current governance: [L01–L08 plan](2026-10-06-budgeted-resident-semantic-plan.md),
[product contract](semantic-ready/product-contract.md), [MoSCoW](references-moscow.md)
and [ADRs](../adr/README.md). This is the only active Ledger. The
[research-reviewed OP-00–OP-06 follow-up](2026-10-11-query-performance-follow-up-plan.md)
owns the next slices within L08, starting with layered attribution, then resident
routing, validation reuse, diagnosis/readiness, incremental snapshots, resource
calibration and final evidence evaluation. It reuses the R-IDs below.

L03–L07 stage implementation/calibration is DONE. L02 remains IN_PROGRESS,
with same-content promotion default-on and remaining incremental contracts in
OP-04. Full-response P95 ≤550 ms (500 ms target), final memory, complete readiness,
soak, scale and platform gates remain at L08. Slice correctness, freshness,
cancellation and cleanable execution are checked before proceeding; final targets
do not block earlier slices. The six defaults follow ADR 0015; release and
Graduated status still require all applicable original gates. S02/S03 research
and the rejected S05 candidate retain their prior decisions. Dated evidence
below describes its original configuration and is not the current work queue.

Latest candidate disposition (2026-10-17): trace-off transient statistics removal
passes its public4→0 mechanism check and39/39 controlled related tests, but eight
fixed full-SDK fallback sessions show no consistent response-time gain despite
32 exact reference results,8 full READY reports and12 normal diagnostics. Two
forward disk requests are about19–20% slower. REJECTED and exactly reverted;
sleep-interrupted FAILs remain archived. Audit435453a9 verifies the original1748
repository files and82 generated artifacts byte-for-byte, productionac4c136b and
217/210 total/fast entries restored. Its original1864/1865 wholeFAIL and403-file
first-reference20s timeout remain; no new default or wholeGREEN claim. Continue
cold Program/full SDK preparation and complex real closure. See [candidate evidence](../tdd/op00-transient-statistics.md).

Latest mandatory freshness fix (2026-10-16, productionac4c136b): both opened
caller and never-didOpen disk-source entries reject a genuinely changed disk
dependency instead of publishing its old definition. Three public regressions
include explicit READY revocation/recovery; fourteen complete related files
pass96/96, exit0. The final bounded raw-source read retains the subsequent
SDK/config guard; no new LS/AST owner, cache or flag. Eight fixed normal full-SDK
sessions retain48 exact results,32 current READY reports,12 diagnostics and8
normal exits. Edited medians are about2.63/2.62s, but paired sampled RSS1.2566
fails the1.10 resource hypothesis. Retain this necessary correctness fix and
the failed comparison, not a memory/P95/PSS claim. The original210-entry
check:fast ended1861/1865,4FAIL,exit1 with stable inputs and audited native exits
(daf7fc3c). Four fixtures declared nonexistent disk sources; real disk files and
deletions restore22/22 without changing production or assertions. After extracting
shared fixtures, six complete files pass49/49; the old test shrinks1213→1120 lines
and remains migration debt. The corrected full210-entry run is now1864/1865,
1FAIL,exit1,zero annotations, independently audited0ab1d0e0 with stable1748-source,
SDK/build/launcher identities and actual root exits. All four fixture cases pass;
the sole failure is the original403-file first reference id2 timing out at20s.
Keep its full oracles/deadline and originalFAIL; no favorable rerun or wholeGREEN
claim. Cold Program/full SDK preparation and complex real closure remain next.
The originalFAIL and old1862 retain their original identities.
Audited6c0812bb; OP04 and all remaining OP00–06/L08 contracts stay open.
See [source publication fix](../tdd/op04-versioned-overlay-snapshot.md#在途磁盘依赖的发布前输入修正).

Earlier READY-preparation scope follow-up (2026-10-16, production72358623):
both entries retain complete edited definitions/types/READY and diagnostics;
default native directory probes60→1, explicit0 remains60. Related64/64 and the
original full check:fast1862/1862, exit0, are independently audited8c5cc269.
The fixed8 installed-SDK sessions show edited medians about3.42→2.97s, but one
paired sampled RSS ratio1.1595 fails the resource hypothesis. Keep that failure,
all earlier builds and the remaining OP00–06/L08 scope; no P95/PSS or release
claim. Defaults, bounds and ownership are unchanged. See [OP04 terminal](../tdd/op04-versioned-overlay-snapshot.md#当前72358623完整回归终态).

R-03/R-32 follow-up (2026-10-16): the deferred-certification candidate removes
one duplicate cold context in the public pressure counterexample, and87/87
related checks plus8 fixed old/new/new/old full-SDK sessions preserve exact
results, current READY and diagnostics. Edited medians improve8.3%/10.3%, but
reverse sampled RSS ratios1.2450/1.2822 fail the preregistered1.10 comparison.
REJECTED and exactly reverted; candidate source/native bytes remain archived.
The restored72358623 execution inputs match the original1862/1862 byte-for-byte,
audited4e744a73; this is not a new whole run. The original40-edit diagnostic
still has34 complete/2 failed/4 unexecuted. No default, budget, owner, PSS or
graduation claim changes; continue independent delta/unknown-in-flight and
complex real-closure work, not favorable resampling. See [OP05 rejection](../tdd/op05-recovery-cost-calibration.md#延后认证候选回退).

Earlier local follow-up (2026-10-16, OP03a / R-20/21/22/29/30/34): basic full
public oracles now cover both entry paths for the14 core matrix items. Genuine
disk references also retain proof-bound result-cache hits, cold complete fallback,
coalescing, independent cancellation and group invalidation/recovery. Current
bd4010b6 has28 complete related files313/313, exit0, auditedb36e8173. Later original
206-fast ends1822/1824 FAIL2, audited5e4670c8; old1779/1797 retained. Corrected
real-source positive plus explicit empty-reply negative retain26 files207/207;
constructor trace-path failure is not located, not fixed by later standalone
passes. New test-head whole NOT_RUN. Installed-full-SDK18 first-use observations
are exact/current READY but original reports stillFAIL and are not336-cell,
P95/PSS or product graduation. More input/pressure/cold and allOP00–06/L08 remain.

Current OP00 cold-batch attribution (2026-10-16, same bd4010b6): fixed
64/128/128/64 on the unchanged original403 full-SDK public case preserves all16
complete replies. Observed whole-workflow reductions39.12%/38.20%, paired sampled
tree RSS maxima0.9791/0.9994; no P95/PSS or general memory claim. Separate native
trace confirms7→4 batches per miss,14→8 complete across two misses, SDK255/full403
and about2s Program preparation per batch.128 is NOT_ADOPTED; default64 and all
selected defaults/budgets/lifetimes stay. Original whole/timeouts and8 collector
launch failures remain; see [OP00 evidence](../tdd/op00-query-layer-attribution.md).
Next complex real-workload/source-entry/proof/input/pressure qualification, not
favorable resampling of this closed small corpus; current206-fast needs a fresh
terminal regression receipt before merge.

Latest source-entry cost on the unchanged1000/500 READY controlled corpus, not
Settings:18 independent processes/one target each,3 per entry/capability, fullSDK
and six defaults. Definition medians510.76/447.75ms; references medians3918–4219ms,
root preparation separately4.63–5.04s. Actual opened-caller versus never-didOpen
workflows/payload/proof/diagnostics/exit auditedaa711a12; all18 original final
reports remainFAIL, no release P95/PSS. Separate two native traces audited13c00996
show inputs-changed resident rejection followed by one fullSDK255/project501
transient batch: Program3.20–3.34s versus query72–73ms. Which proof component or
missing observation causes it is not yet proven; existing proxy prepared-root
hint is present. Next public RED, then smallest proven same-owner fix, not weaker
admission/new LS/cross-batch retention or resampling closed controls. This is the
preserved pre-fix observation, superseded for the local proof handoff below.

Latest local proof handoff (2026-10-16, production81d6e876): genuine public RED
distinguishes an unobserved reference proof after READY from changed inputs.
Same-owner immutable metadata adoption retains all admission/final fences and
the existing Program; no extra LS/AST cache or default switch. Complete9-file
guards75/75 auditedac7407c4. New-build fixed18 independent full-installed-SDK
observations preserve the old corpus/oracles/workflows and all complete results,
current READY and diagnostics. Opened-caller reference medians229–230ms versus
old3918–3962ms; never-opened source464–470ms versus4156–4219ms. Preparation is
still4.14–5.52s. Audit69d6dac6 and separate native4f77a846 show the same READY
Program, no verifier/batch or extra owner; trace timings are not normal samples.
All18 original final reports remainFAIL; not final P95/PSS or general memory
graduation. Old whole1822/1824 FAIL and unknown constructor failure remain.
Current head still needs fresh whole; local proof handoff DONE does not close
OP03a/OP00–06/L08. Next queue is complex real closure/cold cost, OP04 disk/unknown
inputs and pressure/resources, not favorable resampling of closed controls.

Subsequent original complete regression on81d6e876:1826/1826, exit0, no annotations,
206fast entries and all archived source/build/SDK/launcher identities audited1de2bf76.
Public evaluator consumes the real receipt plus18 native reports: macOS regression
PASS, finalBLOCKED; audit70eca240. No final P95/PSS/platform graduation. Then one
new public watched-dependency edit test is RED: all3 current references exact and
normal exit, but readonly root status remainsDEGRADED/inputs-no-longer-current.
Audit83952896; no production change at that checkpoint. That added-test head was RED, not covered
by the earlier1826 GREEN. Next minimal explicit-ready-session reference refresh
keeps bounded resident-only probing, all fences and budgets; no S05/experimental
default activation. Full OP03a/OP00–06/L08 and unknown historical failure causes remain.

Subsequently the reference refresh is RED→GREEN: only existing explicit-ready
intent permits current-owner full certification across the original context reset;
readonly status / bounded resident-only never prepare, all final fences remain.
Current88ad7e9b: nine complete public files81/81, exit0, audit987689db; both source
entries and declaration policies, missing-input repair and entered compiler
cancellation are protected. Four fresh installed-full-SDK post-disk-edit sessions
are exact/current READY with equal diagnostics and normal exits (auditb5c51a6b),
but each RPC still takes3.51–4.00s; sampled RSS maxima508–566MiB, not PSS/true peak.
Two separate attribution sessions show one context replacement per disk revision,
869 input checks, ordinary owner compiler query and no transient batch/extra owner
(auditffa33bbd). No A/B/P95/release graduation; old1826 whole does not cover current
production, fresh whole NOT_RUN. Next verify other ordinary capabilities' dynamic
readiness across disk resets, then cold preparation/disk uncertainty/resources;
S05 and experimental defaults remain off. Local reference contract DONE only.

Next ordinary-query slice is now RED→GREEN for definition, diagnostics-first
intent survival, and both-entry outgoing-call follow-up. Currenta6ae3b97 has nine
complete related files88/88, exit0, audite4c7eaa1. The first eager-root attempt's
86/88 FAIL is retained (07112a09); original unknown-input assertions stay unchanged.
Only needed context replacement/incomplete loaded scope selects full root prepare;
metadata is not a validity cache, diagnostics never certify the root, actual L2/L3
and compiler cancellation still clear intent. Current installed-SDK two fresh
definition sessions are exact/current READY/diagnostics/exit0: first220/228ms,
post-edit3.69/3.84s, sampled RSS559/557MiB (7becc0ca), not A/B/P95/PSS or release
reports. Fresh original whole collector prefix
`.bench/op03a-ordinary-ready-refresh-current-whole-v1/whole*` actually terminates
FAIL/exit1 after ENOSPC in fixture writes and the Node harness output; no final
root summary, counts=null. Independent incomplete-result audit23bd83d0 verifies
all1734 archived/current sources,206 entries, SDK/build/launcher, raw receipt/log
and original PID exits. Integrity PASS is not whole GREEN or a semantic-cause
finding. Preserve the failed run; reclaim only verified task-owned duplicate
derived storage, then rerun the unchanged full command under a fresh prefix.
Old1826 and old matrix data cannot cover the new build. Full
OP03a/OP00–06/L08, complex dynamic inputs/resources/platforms/client work remain.

The storage-recovery-v2 original whole now actually ends1837/1839,2FAIL,exit1,
zero annotations,3303432.414356ms; all206 entries/1734 archived sources/build/SDK/
launcher/native exits independently audited4ab388e2. No ENOSPC this run. Failures
are the verifier-observer premise and the original403 id4 timeout at20s. Unchanged
observer RED plus two native publicCLI controls prove default resident execution
has no verifier; the explicit opt-out has two real disposed/zero-Registry verifiers
(auditd9ea6d3d). Only its test fixture is corrected, and default exact edited/cache
coverage strengthened: three complete related files30/30,exit0,zero annotations,
auditacf11315; test494lines, productiona6ae3b97/defaults unchanged. No whole GREEN,
403 fix, P95/PSS or owner physical-release claim; new test-head whole NOT_RUN.
Keep the original failed runs and complete remaining scope; no default128 adoption
or favorable resampling. See [OP00](../tdd/op00-query-layer-attribution.md).

Local2026-10-16 original403 unchanged finite reproduction:1 PASS/2 name-unselected,
exit0, four full-oracle comparisons reached (auditc67ed6b0). Only non-reproduction,
not a fix; retain the original20s whole failure, no favorable resampling or128 adoption.
The independent planned OP06 real-restart slice now passes both source entries,
fresh-process READY, unsaved destination/version replay, mixed/two-restart sequences
and failed-exit/postflight-tail accounting. Nineteen complete files171/171,exit0,
zero annotations; audit0b95855d. Two private-SDK native entries use four normally
exited server processes; per-PID raw RSS and canonical bindings independently reread.
Original reports remain FAIL, final consumer BLOCKED: no installed-SDK timing/P95/
PSS/physical-release/all14 restart or L08 graduation. Productiona6ae3b97/defaults/
budget unchanged; tools-head whole NOT_RUN. Complete remaining scope, then fresh
whole and branch/PR before merge. See [OP06](../tdd/op06-release-sample-evidence.md).

Subsequent local2026-10-16 restart follow-ups: both entries now preserve full
completion/resolve and prepare/incoming/outgoing results. Real old completion
UUIDs expire; call items retain root/position/current-source semantics, not a new
session UUID protocol. Producer and consumer bind actual earlier same-process,
same-snapshot/version sources; cross-process substitution is publicly rejected.
Twenty complete files176/176,zero annotations; four private-SDK native cases12
exact requests/eight normally exited server PIDs, audit6d359df3. Three public REDs
and one incorrect-fixture qualification failure remain archived; no production
change, SLO/PSS/full14 restart or whole claim. New tools-head whole NOT_RUN;
full remaining scope and branch/PR requirement retained. See [OP06](../tdd/op06-release-sample-evidence.md).

Earlier OP04 notification slice (2026-10-16): production5e7bffc4 skips only
cached closed regular-source changed events with identical physical identity
and bounded reread bytes. Existing same-content default1/explicit0; actual
writes retain conservative invalidation, notification revisions/cancellation
still advance. No S05/new LS cache/budget expansion. Twelve complete files93/93;
eight fixed installed-full-SDK sessions on34 sources/32 inferred dependency hops
retain96 exact/current-READY queries, diagnostics and normal exits. Duplicate
definition medians3.50/3.43s→79/77ms; actual edits3.27–3.48s. RSS ratios
0.9412/0.7970/1.0838/0.7773 include a regression, not general memory/PSS benefit.
Audit a20ba24f; original tool qualification FAIL retained. [OP04 details](../tdd/op04-versioned-overlay-snapshot.md#2026-10-16重复磁盘通知的独立输入切片).
Inventory216 total/209 fast; the original full check:fast now passes1858/1858,
exit0/zero annotations, audited47ad6dda with all1744 sources, SDK/build/launcher
identities and actual root exits. Original403 passes all four unchanged oracles
and deadlines here; this is not a timeout-cause fix. Old1837/1839 FAIL is retained.
Document-store1860→1835 remains migration debt; new handwritten files≤500.
Actual edited preparation, complex real projects, pressure/lifecycle/soak,
remaining restart/consumer/platform gates and branch/PR delivery remain.

## Dated L01 and prior-route evidence

2026-10-06 pivot: the previous [S-series plan](2026-09-29-semantic-ready-execution-plan.md)
is historical. S02 v1–v6 FAIL is retained and research paused (no v7 absent a new
decision); S03 facts publication stays BLOCKED. The distinct S05 compatible-disk
LS candidate is `DECISION_COMPLETE / REJECTED` after the 1.600× RSS peak and
slow edited-definition P95 controls. L01 is **IN_PROGRESS, not PASSED**:
one complete official LS, no dispose after preparation, previously unqueried
real Settings/API24 symbols, exact oracle and RSS/Program identity observation.
The [first three-process control](../reports/2026-10-06-resident-l01-baseline.md)
was 42/42 exact with same-file new-query 286/1,025/267 ms, so the 500 ms
stability screen is NOT_MET and full resource/readiness gates remain open.
The [true-declaration A/B/C control](../reports/2026-10-06-resident-l01-declarations-ab.md)
adds two fresh processes per strategy, 16/16 exact requests and normal diagnostics:
unqueried cross-file `HomeInitData` takes 8.061/23.880 s on current indexed-batched,
versus 178/225 ms on the same-snapshot legacy full LS after its first query.
Only repeated same-symbol requests hit the ~2 ms exact cache. Small-N and noisy RSS
sampling prohibit P95 or memory-graduation claims; these pins are historical after
the trace-only checker observer edit.
The [current-build unsaved-reference control](../reports/2026-10-06-resident-l01-unsaved-reference-edit.md)
adds three fresh processes, 12/12 exact, a 9→10 v2 overlay delta and current
diagnostics; edit-warm first queries take 1.371–1.597 s. A separate trace sees
context reuse but a new Program after the edit. The post-query Checker sequence
changes even for one Program, so it is not a stable reuse gate. This closes one
freshness control, not L02 incrementality, Settings cancellation/L3 safety or
readiness graduation.
The [real Settings L3 recovery](../reports/2026-10-06-resident-l01-l3-recovery.md)
proves one benchmark-controlled eviction followed by an unseen symbol's 10/10
exact Locations and normal diagnostics. Its trace-on recovery is 13.797 s,
sampled Node RSS peak at least 1,087,504,384 bytes, with further automatic
evictions. It is a single completeness control, not stable memory or latency.
The [fixed Settings implementation oracle](../reports/2026-10-06-resident-l01-implementation-discovery.md)
comes from two agreeing fresh-process complete results, not a static guess.
[Three more prepared-suite processes](../reports/2026-10-06-resident-l01-hot-implementation.md)
return 6/6 exact: after each first full-scope references, the previously
unqueried interface implementation takes 280.4/255.2/350.9 ms, with normal
diagnostics. That one pre-opened, post-cost bucket is promising but cannot
graduate R-25/L05, semantic readiness, P95 or memory gates.
The [single real Settings queue-start cancellation control](../reports/2026-10-06-resident-l01-cancel-control.md)
returns one `-32800` without a partial result; fresh same-process references
are 9/9 exact, definition exact, and diagnostics normal. Cancelled work's
document preparation still ran for about 1.2 s, so compiler-in-flight
preemption, repeated cancellation and long-run resource safety remained open.
The [three-process references-callback cancellation control](../reports/2026-10-06-resident-l01-compiler-cancel.md)
observes whole-callback cancellation on the same trace after `$/cancelRequest`,
one `-32800`, no partial result, 9/9 exact references and exact definition
recovery with normal diagnostics. The callback takes 5.76–6.90 s to stop;
this does not establish where TypeScript stops. A narrower
[three-process `findReferences` call control](../reports/2026-10-06-resident-l01-find-references-cancel.md)
waits for the actual TypeScript call, then observes its cancellation throw in
12/2/2 ms and a single public terminal in 19/4/4 ms, with exact recovery.
The first request still waits 7.9–9.0 s before that call; timely cancellation
of earlier preparation and repeated-cancel/long-run resource safety remain Must.
The [three-process cross-module definition control](../reports/2026-10-06-resident-l01-hot-definition.md)
adds 6/6 exact requests: after 248/248 first references, the previously
unqueried `HomeInitData` usage resolves to its declaration in 1,060/858/777 ms.
Normal diagnostics remain enabled; 0/3 samples meet 500 ms. This is a concrete
L01 new-symbol latency failure, not evidence of Program/Checker reuse or L06
route graduation.
One [trace-on attribution control](../reports/2026-10-06-resident-l01-hot-definition-trace.md)
separates a 1,309.4 ms complete definition response from its 2.56 ms compiler
definition callback. Two normal pre-open diagnostics overlap the request; the
second completes just before the callback. The trace lacks a definition queue
boundary, so this is a discriminating scheduling hypothesis, not a measured
per-phase allocation or permission to suppress diagnostics.
The [trace-off diagnostic barrier A/B](../reports/2026-10-06-resident-l01-diagnostic-barrier-ab.md)
keeps both v1 diagnostics and all exact Locations: three fresh processes send
the unqueried cross-module definition only after both publications and respond
in 11.6/8.8/12.2 ms; a subsequent no-barrier process still takes 747.7 ms.
The barrier waits 792.6–923.4 ms **before** the request, however; it moves
cost outside the request timer rather than reducing first-references-to-definition
wall time. Scheduling/freshness remains Must, not a 500 ms or ready-state pass.
The [queued-diagnostic priority slice](../reports/2026-10-06-resident-l01-diagnostic-priority.md)
has a real framed-LSP RED/GREEN for one definition bypass of a queued second
diagnosis and a mutation/v2-diagnostic safety regression. In three pinned
Settings/API24 new processes, exact definition responses precede the second
diagnostic but still take 824.4/703.9/691.0 ms (0/3 at 500 ms). This closes
the narrow queue-order defect, not L01 performance/readiness or resource gates.
The [L01 script-admission trace](../reports/2026-10-06-resident-l01-script-admission.md)
then attributes 748–782 ms of three trace-on unqueried definitions to
`createProgram`. A separate pinned Settings run observes 13 newly resident
scripts, all 13 previously lazy-read with matching source fingerprints,
host generation 257→270, and Program sequence 1→2. No edit or context eviction
occurred. This supports, but does not causally prove, a host-version-only
rebuild. L02 needs a default-off exactness/memory/latency A/B after the L01
safety gate; production versions and 500 ms status remain unchanged.
The [L01 100-edit Settings/API24 resource control](../reports/2026-10-07-resident-l01-resource-soak.md)
now has 102/102 exact trace-off references with normal v1/v101 diagnostics
after a visible initial barrier, but edit P50/P95 is 2.484/4.437 s and
sampled Node RSS peak is at least 1.45 GB. A separate trace-on five-L3 run
is 107/107 exact but records 104 context create/evict pairs; an unbarriered
trace-off run retains a missing v1 diagnostic failure. This closes one
100-edit exactness slice, **not** L01 resource admission, stable residency,
semantic readiness or 500 ms. Investigate churn before L02 production work;
do not increase the budget or alter the production default to hide it.
[Short no-control Settings attribution](../reports/2026-10-07-resident-l01-pressure-attribution.md)
reproduced 13 and 14 automatic L3 evictions across two independent 20-edit
processes (both 22/22 exact, diagnostics PASS). High post-query process RSS
explains the recreate/evict loop under this soft budget; strongly retained
compiler/registry objects were not yet identified in those RSS-only runs.
[Two later fresh Settings registry probes](../reports/2026-10-07-resident-l01-registry-ownership.md)
repeated `trim 2261→2261`, rebuild, `dispose 4522→2261` on the same
SourceFile-path cohort with 22/22 exact results and diagnostics PASS; the
fork's trim/dispose ownership gap is a concrete backend defect candidate.
Refcounts do not quantify retained bytes; R-03/R-30 resource admission remains
BLOCKED pending a real-LSP regression, fix, and memory recheck.
That [regression and two fixed-build Settings replays](../reports/2026-10-07-resident-l01-registry-recycle.md)
are now complete: sampled L2/L3 residual refs reach zero and both runs are
22/22 exact with diagnostics PASS. However fixed-run edit maxima are
28.227/27.004 s, repeated cold `createProgram` can take 21–24 s, and peak
RSS varies 1.518/1.030 GB. Mark only backend ownership repaired; R-03/R-30
resource and latency admission remain BLOCKED, production indexed routing
unchanged.
The [repeated-L2 Settings control](../reports/2026-10-07-resident-l01-l2-rearm.md)
closes only the public Registry lifecycle regression: `L2 → exact query → L2`
now releases each observed Program-owned refcount to zero when explicitly
enabled. One fixed-build 20-edit process is 22/22 exact with normal diagnostics,
but incurs four natural L3 evictions, seven >20 s edits, and at least 1.969 GB
sampled Node RSS. Therefore `ARKTS_L01_REARM_TRIM` requires benchmark control
and remains default-off; R-03/R-30 resource admission stays BLOCKED. Next
test a Program-generation witness and pressure-aware resident re-admission,
with full semantic fallback. Do not graduate L02 or the 500 ms gate from the
fixture GREEN.
[The L2 build-witness RED/GREEN](../tdd/l01-l2-program-witness.md) has now
closed one experimental false re-arm: invalid rename reaches the resident
context but cannot mark it rebuilt; a later observed `createProgram` event can.
This positive grouped compiler event is not strict resident Program identity,
and the Settings resource gate remains BLOCKED.
The [automatic-L3 admission experiment](../reports/2026-10-07-resident-l01-pressure-admission.md)
is now a negative Must-level result for R-03/R-30. Public framed-LSP tests
showed no repeated resident creation and exact results in small stale-index and
unsaved-overlay controls. Real Settings/API24 executed 22/22 planned requests,
but only 20 completed exactly; two reached 180 s while a 24-batch conservative
full-scope search was still at batch 14. External Node peak RSS was at least
1.410 GB. The doubly gated flag remains default-off and **NO-GO**; a lower
observed peak does not excuse timeouts or incomplete results. L01 safety and
L02 admission remain BLOCKED.
[A same-build indexed control](../reports/2026-10-07-resident-l01-indexed-pressure-control.md)
then showed the boundary of index narrowing: `HomeInitData` had three exact
one-batch responses but needed 11.088–13.624 s; `MenuController` was
candidate-ineligible, planned 24 batches and timed out at 180.011 s. Two
explicit L3 recovery samples were blocked because no eviction was observed;
diagnostics/overall status failed. This is not indexed L3 admission.
[The matched-build legacy/indexed A/B](../reports/2026-10-07-resident-l01-matched-strategy-ab.md)
keeps R-03/R-30 blocked: legacy completed all six exact requests but took
60.734 s for the first constructor query, 23–27 s for the two L3 recoveries,
and sampled 1.537 GB Node RSS; indexed timed out on that first query and did
not execute either L3 control. Different executed request sets prohibit a
causal peak-RSS ratio. A [public RED/GREEN admission guard](../tdd/l01-pressure-multibatch-rejection.md)
now makes the *default-off* automatic-L3 experiment return an explicit resource
error before a multi-batch verifier starts. Its one-batch fixture remains exact,
but the guard is not a hard per-batch RSS bound or Settings graduation.
[Real Settings L3 follow-up](../reports/2026-10-07-resident-l01-pressure-guard-settings.md)
returned four exact responses and two explicit `-32803` refusals before any
of the 24 planned batches started (84.5/96.9 ms). Normal diagnostics passed,
but 4/6 complete is FAIL, not a safety or 500 ms graduation.
The [same-input production-default comparator](../reports/2026-10-07-resident-l01-production-comparator.md)
returned 22/22 exact locations and normal diagnostics under both strategies.
All 20 unsaved edits actually used indexed one-batch verification, not legacy;
indexed edit P95 was 4.145 s versus legacy 2.524 s while sampled Node RSS
peak fell from 1.245 to 0.843 GB. The initial identity-ineligible symbol
required 24 conservative batches and 111.220 s, dominated by repeated Program
preparation. These are Must-level latency/resource facts, not L01 admission.
Production remains `indexed-batched + closure + full SDK` and transient batches.
The L01 safety gate can permit L02 validity research with a recorded >500 ms
`PERFORMANCE_FAIL`; neither that continuation nor this Ledger changes default
or graduates the product SLO.
[Three matched Settings post-L3 GC controls](../reports/2026-10-07-resident-l01-post-eviction-gc-attribution.md)
now close a narrow Must-level ownership question: all six new processes kept
four exact reference responses and normal diagnostics, then returned an
explicit resource error; the three benchmark-only GC probes reduced disposed
semantic-Worker heap from 638–646 MB to about 33 MB, while Node RSS fell only
29–31 MB immediately. This argues against a strong-reference leak for that
context, not for every path. The control/probe peak difference is not a
production GC benefit or PSS gate. Preventing overlap with the next normal
diagnostic Program without losing exactness remains L01 BLOCKED; L02 and the
500 ms product gate remain open.
[The three-process production-default indexed-after-L3 control](../reports/2026-10-07-resident-l01-indexed-after-l3.md)
separates that explicit legacy refusal from the actual indexed route: after a
witnessed context eviction, a previously unqueried real Settings declaration
returned 10/10 exact Locations in all three new processes with normal
diagnostics. Its complete references requests still took 4.557–4.586 s;
`READINESS_UNSUPPORTED` and resource/product gates remain open. The proof was
identity-complete for this one symbol and planned one batch; the constructor
symbol's ready index remains correctly unsupported and must not be narrowed
by class-name matching. That checkpoint's full `check:fast` was 1322/1322 GREEN under
the fixture SDK and permitted external RSS sampling; this test status is not
L01 or L02 admission.
[A three-pair, fixed-build post-L3 Worker recycle control](../reports/2026-10-08-resident-l01-semantic-worker-recycle-ab.md)
adds a default-off L01 resource slice: all six Settings runs preserve exact
1-location definition, 10-location references and normal diagnostics; paired
sampled Node peaks fall 29.3%–31.6%, while reference median is still
4.524→4.574 s. A public LSP RED/GREEN caught and fixed lost unsaved edits
on a timed-out recycle witness. This is not a persistent Worker or production
recycle approval: immediate pre-query RSS, PSS, 100-edit stability,
identity-ineligible multi-batch, semantic readiness and original memory gates
remain open. The later fixed-worktree `pnpm check:fast` is **1327/1327 PASS**
with permitted macOS external RSS sampling; this test pass is not product
graduation. L01 resource admission and L02 production wiring stay blocked.
The 2026-10-03 sequencing decision separates implementation from product graduation:
an exact, fresh, complete and resource-safe slice may be implemented while its
500 ms bucket remains FAIL. That failure stays open for S12b; it cannot turn an
unimplemented or semantically invalid route into a completed feature.
S00 documentation is integrated. S01 harness and candidate-ready controls are
implemented but not graduated: semantic readiness FAIL, incomplete bucket coverage;
the [2026-10-03 real Settings edit-reference follow-up](../reports/2026-09-29-semantic-ready-s01-baseline.md#2026-10-03-追加真实未保存引用编辑控制)
adds exact 9→10 unsaved-reference results in legacy and indexed-batched, with
normal v2 diagnostics, but both runs remain READINESS_UNSUPPORTED/FAIL;
the [2026-10-04 Settings public-API edit control](../reports/2026-09-29-semantic-ready-s01-baseline.md)
widens an exported member type in an unsaved buffer and preserves the same nine
exact URI+UTF-16 Locations in both strategies with normal v2 diagnostics.
It is one candidate-ready sample, not semantic-ready or P95 graduation;
S01 preflight now rejects duplicate oracle Locations and compares normalized
sets rather than counts for edit-reference deltas (public CLI focus20/20;
final fixed-tree `check:fast` 1222/1222 PASS, not S01 graduation);
S02's public-checker binding projection hypothesis is FAIL at the mandatory
constructor gate. A distinct resolved-signature v2 passes seven explicit-
constructor targets but produces four extra positions for aliased/parenthesized
heritage; both hypotheses are FAIL. A third isolated compiler hook has exact
inherited-alias/overload answers but still performs per-constructor internal
queries (`NON_BULK`); S02 is FAIL and S03 is BLOCKED. S05's compatible-disk local-LS
candidate is `DECISION_COMPLETE / REJECTED`: default-off context lifecycle/rebuild
observation and prototype are implemented, but hot-session production reuse is
NOT IMPLEMENTED or graduated; safe fallback and per-batch verifiers remain;
S04 and S06–S12 remain NOT_STARTED.
An [isolated v4 compiler worklist](../reports/2026-10-04-semantic-ready-s02-shared-worklist-spike.md)
now shares file/name and import-map passes for multiple constructors: three
narrow public oracle slices are exact, but `public constructor` false-policy
misses one Location and Settings/SDK/resource coverage is not run. It changes
neither the S02 FAIL/S03 BLOCKED status nor production defaults.
The [isolated v5 origin worklist](../reports/2026-10-04-semantic-ready-s02-origin-worklist-spike.md)
repairs the `public constructor` declaration-policy slice and matches more
constructor fixtures. `new Base`/`new Derived` usage-site remains explicit
`UNSUPPORTED` (stock has 3/4 Locations); Settings/SDK and scale were untested
at that checkpoint.
S02 stays FAIL and S03 BLOCKED.
The [isolated v6 usage-origin worklist](../reports/2026-10-04-semantic-ready-s02-usage-origin-worklist-spike.md)
matches direct `new Base`/`new Derived` usage-site Locations under both declaration
policies, including the inherited two-origin selection. The `new Alias()` call-shapes
fixture stops with `HOOK_UNSUPPORTED` and no facts; ordinary/alias nonconstructor
queries remain `UNSUPPORTED`. At that fixture checkpoint Settings/SDK and scale
were untested; a subsequent real Settings extraction attempt is documented below. S02 stays
FAIL, S03 BLOCKED, and production defaults are unchanged.
The [read-only disk-oracle input slice](../reports/2026-10-04-semantic-ready-s02-disk-oracle-slice.md)
retains original source paths and pins only the listed files, but reports
`HOST_PARITY_NOT_MET`: the spike host does not consume API24 SDK or Harmony
resolution. It is not a Settings oracle or S02 gate pass.
The [production-host stock/hook follow-up](../reports/2026-10-04-semantic-ready-s02-production-host-oracle.md)
uses the actual DocumentStore/LS with full SDK and exactly pinned Settings
membership, source, SDK declaration/compiler-option and default project-configuration
digests; installed dependencies are rejected. Stock HomeInitData no-/with-declaration
answers match existing public LSP goldens 9/9 and 10/10; the MenuController
constructor usage at UTF-16 90:17, excluding declaration, matches its separate
267-location golden exactly. The isolated v6 hook now accepts the same production-host
disk input. A tiny pinned SDK/project fixture passes the facts-only constructor
query and exact stock/hook SHA-256 comparisons of sorted Program root paths and
compiler options, not just counts. But clean Settings/API24 extraction with all
1,496 members was **attempted and failed** after about 10.5 s: exit42,
`FAIL/HOOK_UNSUPPORTED`, reason `ORIGIN_WORKLIST_UNSUPPORTED_OUTSIDE_ROOT_OR_SPAN`,
no facts or partial answer. The Settings hook equivalence/resource gate is thus
RUN-and-FAIL, not a fixture success or an unrun real-project test; failure occurred
before real-project hook root/options metadata or 267-location facts could be compared.
Failure-detail replay identifies its first outside-root origin as compiler
`lib.es5.d.ts` for Settings `new Array()`. A mixed local-constructor/Array public
CLI fixture now keeps local false/true-policy facts exact while marking Array
`UNSUPPORTED` and the artifact `FAIL/PARTIAL`, not complete. The same clean
Settings pin replay then stops at `ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH`
without facts; this does not unblock the 267-location hook comparison.
That `ADJUSTED_BRANCH` was observed with a broken local `file:` package-alias
resolution: the real Settings `DialogPage` import had TS2307, so its old stock
2/3 same-file Locations were not a valid exact oracle. A real stdio LSP RED→GREEN
fix for declared local aliases preserves installed-package and path-boundary
guards; the same pinned Settings/API24 stock query now yields 30/31 Locations
across 24 files. Hook extraction was rerun against this corrected oracle;
the old adjusted-branch observation is not a standalone compiler counterexample.
The after-fix extraction still exits42 with that reason and no facts, but its
first failing selection was not recorded in the original output. A default-off,
sanitized failure detail now identifies it as `new CustomUiInfo` in
`MenuCustomComponent.ets`, with the compiler definition on the same file's
import binding, **not** `DialogPage`; status remains exit42/no facts. A real LSP
`didOpen` of that file reports four TS2307 diagnostics for `@ohos/mpchart`
subpath imports: the pinned checkout declares version 3.0.15 but has no
installed `oh_modules`. This is a dependency-incomplete environment for that
symbol, not proof of a hook bug on resolved compiler semantics.
A separate same-commit `ohpm install --all` checkout with exact declared
versions removes all four mpchart TS2307s; fresh LSP definition resolves into
the installed 3.0.15 package. Default production pin v2 still rejects this
checkout at `oh_modules`; an explicit public-CLI-tested v3 `--pin-installed`
now fixes installed bytes, symlink topology, owner lock/manifest and declared
local `file:` targets. The same installed Settings/API24 input is pinned with
1,496 project members. Its stock `DialogPage` answers are complete and exactly
equal to both existing URI+UTF-16 oracles (30/31); this is not hook parity.
A separate public CLI RED→GREEN fixture now proves a narrow package boundary:
compiler references reach an installed local package, stock and experimental
facts-only results match for both declaration policies, and ordinary
ProjectGraph membership remains one project file. The hook indexes project +
verified package sources but selects query targets only from project files;
package constructors are not new project queries. A same-name/version orphan
registry package was independently RED and now fails pin instead of borrowing
another lock row. This is a small fixture slice, not whole-Settings hook parity:
the installed Settings v6 extraction still exits42 with no facts at another
`ADJUSTED_BRANCH` in `TouchpadPointerSpeedComponent.ets`. Its relative
controller target is absent from the fixed commit and real LSP emits TS2307;
this is environment-incomplete, not a proven failure on resolved semantics.
The installed-package `new CustomUiInfo` exploratory LSP references requests
both returned explicit `-32803` errors, not empty or complete Locations;
initial trace showed complete project membership but only batch 0 start.
A public LSP RED→GREEN added default-off `references.batch.incomplete` tracing;
the installed Settings replay now identifies batch 0/24 as `source-unavailable`
while preserving -32803. The specific unavailable source is not in the trace,
so a package-scope fix is not yet justified by location-level evidence.
The real Settings/API24 LSP `DialogPage` differential is 30/30 (exclude
declaration) and 31/31 (include declaration) exact for legacy and default,
with no target-alias TS2307. Yet default logs `candidate-ineligible` and falls
back to complete batching: cold requests take 93,298/94,639 ms versus legacy
8,037/9,317 ms, with externally sampled product RSS peaks 789,233,664/
799,465,472 versus 827,109,376/832,028,672 B. This is a correctness pass
and latency failure, not accepted real-project index proof.
A separate trace-on cold run remains 30/30 exact at 95,401.63 ms: fallback
scans 1,496 member files in 24 sequential batches; their Program-ready time
totals 81,733.91 ms, while compiler reference queries total 2,133.18 ms.
Repeated compiler preparation, not `findReferences`, dominates this run.
The ineligible anchor is the explicit `constructor` keyword, not the class
export identifier span; no declaration identity was produced although the
catalog generation was ready and matched. A class-name remap without compiler
proof is unsafe for inherited constructor/factory semantics.
The public explicit-constructor alias LSP fixture also proves both declaration
policies exactly match legacy while default safely falls back twice; the
implicit-constructor fixture remains index-accepted twice.
Nonconstructor, implementation, overlay and scale gates remain NOT_RUN. S02 remains
FAIL, S03 BLOCKED and production defaults unchanged. The original simple oracle
remains explicitly non-parity.
See the [single S01 report](../reports/2026-09-29-semantic-ready-s01-baseline.md)
and [S02 v1 counterexample](../reports/2026-09-29-semantic-ready-s02-facts-spike.md)
plus [v2 bounded probe](../reports/2026-10-03-semantic-ready-s02-resolved-signature-spike.md)
and [v3 non-bulk hook probe](../reports/2026-10-03-semantic-ready-s02-compiler-bulk-hook-spike.md).
The [v4 shared-worklist probe](../reports/2026-10-04-semantic-ready-s02-shared-worklist-spike.md)
keeps its failed declaration-policy control and does not constitute production facts.
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
[S05's default-off compiler-phase trace](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
then passed one real Settings 100-operation pair with full exact results: every edited
definition triggered `createProgram`, and the 2/off and 5/experimental >500ms
requests spent about 1.3–1.5s there. A single trace-on pair does not reverse the
two trace-off graduation failures or identify L3 eviction alone as the cause.
[The follow-up S05 observation](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
distinguishes post-query Program identity from LS identity: public LSP fixture keeps
one context across a disk comment edit but observes a new Program; the pinned
Settings/API24 no-edit Mode B replay remains 9/9 exact with normal diagnostics.
The latter does not prove real-project edit reuse or graduate the rejected candidate.
The [trace-only SourceFile identity control](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md)
now observes a real Settings/API24 disk edit: experimental retains 306/306 SDK and
63/64 project SourceFile objects across a new Program, while off retains 0/306
and 0/64. Both arms are exact, but one trace-on pair does not reverse the
100-operation trace-off latency failure; default remains off.
S05's 2026-10-05 safety decision closes **this candidate's evaluation** as
`REJECTED`, not the R-03/R-24/R-26 production capabilities. Two reversed-order
trace-off Settings/API24 100-operation pairs show experimental edited-definition
P95 1.657/1.608 s versus off 0.278/0.272 s; an earlier 1.600× peak Node RSS
pair also exceeded the ≤1.10 admission limit, while later ratios vary.
No stable memory benefit, post-eviction PSS, 500 ms or original >3 GB/50%
graduation follows. `ARKTS_SEMANTIC_SESSION_REUSE` remains default `off`, with
complete semantic fallback, budget/L3 and transient verifier unchanged; this
does not supersede ADR 0003 or unblock S02 FAIL/S03 BLOCKED. A different
mechanism requires a new public RED and its own exact/freshness/resource gates.
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

The former S-series priority made R-14 feasibility Must. **Current 2026-10-06
priority replaces that order:** R-14 becomes paused Could/research; R-30–R-34
and the L01–L08 dependencies below own the implementation critical path.
Fine-grained invalidation remains proof-gated; R-11 Worker-shell reuse is not
a shortcut for official-LS Program preparation. R-09 is implemented/default-on
under ADR 0015, not reset to Research. R-20 remains initial preparation availability rather
than a candidate-ready shortcut.

Historical integration baseline: `911ae43c` (PR #91 merged; baseline fast
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
completion. `Implemented` requires applicable public correctness, freshness,
completeness, cancellation and execution-protection checks; `Graduated` requires
the full linked product acceptance at L08. Final latency/memory/readiness gates
remain recorded without blocking the next implementation slice; see the
[current L01–L08 execution plan](2026-10-06-budgeted-resident-semantic-plan.md).
The [preceding plan](2026-09-20-references-latency-execution-plan.md) and dated
checkpoints below retain their original build evidence and previous priorities.
Historical cold/didOpen timings are not semantic-ready bucket measurements;
the new initial-preparation exemption neither graduates nor rewrites them.

## Current L-series priority and status

This table supersedes the former R-01–R-29 priorities **for the listed IDs**.
Unlisted R-IDs retain their former priority and completed public contracts.
The detailed rows below are dated evidence, not a second active sequencing table.
`Must` is priority, never evidence of implementation or graduation.

| ID | Current priority | Current state and next gate |
| --- | --- | --- |
| R-03 | Must | Budget-aware retention and L03 policy implemented/default-on under ADR 0015; final resource acceptance open. OP-05 calibrates release/rebuild costs, OP-06 validates original memory gates; S05 compatible-disk candidate stays REJECTED. The 2026-10-16 deferred-certification candidate is also REJECTED/reverted after reverse RSS1.2450/1.2822; no new default |
| R-09 | Should | Complete resident references implemented/default-on in main under ADR 0015. [OP-01](../tdd/op01-resident-first-routing.md) working-branch IN_PROGRESS: hot bypass/opt-out, edited SDK rechecks3→0 and cold planning hint GREEN; source7816d51d joint79/original large deadline single-run PASS. [Current comparison](../reports/2026-10-12-op01-resident-first-comparison.md) real60/independent trace20 exact; five new-target pairs faster/one slower, edits remain seconds and RSS has no consistent benefit. Raw DEGRADED/FAIL and prior whole1571/1601/joint74/85 FAIL retained. New frozen whole1589/1601 PASS,12 FAIL,exit1 and all identities match; five original cold failures pass in isolation, not a whole fix. Reproducible cost attribution,new whole GREEN and stage adoption/rollback audit required; scope/freshness/lease and full fallback remain, final graduation L08 |
| R-10 | Could | Anchor memo/seeds implemented default-off; not the current critical path to 500 ms. Revisit only if OP-00 attributes meaningful independent setup cost |
| R-11 | Could | Worker-shell reuse unimplemented; transient production fallback stays. Do not substitute shell lifetime for LS/Program reuse |
| R-13 | Must | Preserve conservative edit/overlay validity in OP-02 proof reuse and OP-04 remaining L02 contracts, not S03 facts publication. [OP-02](../tdd/op02-resident-input-proof-reuse.md) working-branch IN_PROGRESS: public same-text hash6→1, bounded request-only memo, capacity and cancellation controls GREEN. Frozen six-B/twelve-C90/90 exact, native hash1031→255; latency/RSS mixed, raw DEGRADED/FAIL retained. Same-size/same-mtime stale fallback with reuse OFF too fixed by full disk identity; joint53 GREEN on5248dc65. Whole1608/1610 retains two original timeouts; isolated trace is not a fix. New official request-scoped module fallback RED→GREEN: twenty SDK imports native directory probes40→2; forty imports80→18 after32-call clear/uncached overflow. Unnotified missing→present rejects, SDK switch restores exact query/current diagnostics. Standard-query and subsequent independent transient-verifier scopes only, no cross-request physical-validity cache; six defaults and lifetime retained. Transient four verifiers each40→2/OFF40 with full SDK/results. Actual transient SDK presence-window RED fixed by load-owned witness/end fence and typed RequestFailed; direct3/3 includes v2 query/diagnostic recovery. Fence extraction18/18 shrinks core3289→3282; prior5160732d related83/83 retained separately. New18449053 related115/115 and full1640/1642 retain2 loaded-input FAIL, all identities stable; original403-file/two5s deadlines pass in that whole. Fixed C12 normal calibration60/60 exact/current diagnostics/pins: new/add3 faster3 slower, delete6 faster, RSS3 lower3 higher, DEGRADED/FAIL retained; no stable overall gain. OFF reproduces both metadata failures. Negative leaf load-owned parent epoch fixes800-path/created-directory capacity1/1; existing guards19/19, real inter-load new-file window rejects/cacheON-OFF SDK-switch/v2 recovery1/1. Public legacy unknown-link success RED now fenced inside its existing lease; both strategies reject then actual repair/watch/v2 restores exact results/latest diagnostics1/1 on ef30254b. New ef30254b related139/139 and whole1642/1643 all pins stable: prior2 inputs/3 deadlines and inter-load window pass;1 notified prospective source-root creation fails. Original finite RED and compiler=true/resolver=true/model=false diagnosis lead to real model reload at new-context creation; original create/equal-size/equal-mtime/change/delete warm-vs-fresh contract1/1 GREEN on c2a50003, debug removed. Twenty-file frozen173/173 and fresh whole1648/1648 on c2a50003, exit0/all identities stable/zero annotations; remaining direct guards and adoption audit still required; no enlarged4096 limit, restamped epoch, final P95 or memory graduation. Fine-grained invalidation remains proof-gated |
| R-14 | Could / paused research | S02 v1–v6 FAIL/NON_BULK/unsupported evidence retained; no v7 or facts schema without new decision. S03 remains BLOCKED |
| R-20 | Must | Initial preparation baseline retained from L01; OP-03 improves conditional readiness refresh and visible client preparation. Candidate-index ready is not semantic ready |
| R-21 | Must | Post-ready full-response P95≤550 ms is the user-approved final L08 gate, with 500 ms retained as a target; earlier failures guide implementation without blocking the next stage |
| R-22 | Must | Public owner-local readiness and input/coverage proof implemented; real complete-input/coverage graduation remains open. OP-03 reviews conditional proof-refresh costs and client preparation, OP-06 consumes actual ready receipts |
| R-23 | Must | Preserve bounded preparation/progress/cancellation in OP-03 client/readiness work and OP-05 recovery calibration; budget never waived by initial preparation |
| R-24 | Must | L06 stage DONE under the selected default policy; [audit](../reports/2026-10-10-resident-l06-completion-audit.md) protects definition/typeDefinition, freshness, Program reuse and recovery. OP-00 measures layered costs; final SLO/resource/ready gates remain L08 |
| R-25 | Must | L05 stage DONE under the selected default policy; [audit](../reports/2026-10-09-resident-l05-completion-audit.md) protects independent complete implementations and input/cancel/recovery contracts. Preserve the combination control's slower implementation warm-up in OP-00; final graduation remains L08 |
| R-26 | Must | L06 stage DONE under the selected default policy; complete completion/resolve/auto-import payload, fresh inputs and recovery protected by [audit](../reports/2026-10-10-resident-l06-completion-audit.md). OP-05/06 extend scale and resource verification |
| R-27 | Must | L07 stage DONE under the selected default policy; versioned applied WorkspaceEdit/conflict/input/cancel contracts protected by [audit](../reports/2026-10-10-resident-l07-completion-audit.md). Existing rename validation fixes retained; final matrix at L08 |
| R-28 | Should | L07 stage DONE under the selected default policy; independent full incoming/outgoing/fromRanges and follow-up contracts protected by [audit](../reports/2026-10-10-resident-l07-completion-audit.md). OP-00/02/03 attribute incoming latency; final matrix at L08 |
| R-29 | Must | Normal diagnostics in L01/L02/L04–L07 and L08 soak; never silence to improve time. [OP-03a](../tdd/op03a-completion-diagnostic-priority.md) IN_PROGRESS: real stdio RED→GREEN permits one uncached completion to bypass not-yet-started diagnostics while both latest versions publish; strict/build GREEN. Direct one-bypass fairness, once-only cancellation, v2 current members/latest diagnostic and global implementation barrier all pass, joint6. Current inputeae466b5 complete ten-file regression89/89, no annotations; actual wait/cost, current whole and adoption audit remain. Prior cold timeouts are not claimed fixed |
| R-30 | Must | L01 resident baseline retained, product graduation incomplete; current six defaults enabled by ADR 0015. OP-00 establishes new-build layered attribution and OP-01/02 improve existing reuse; original baseline reports keep their frozen evidence |
| R-31 | Must | L02 / OP-04 IN_PROGRESS. [OP-04 Snapshot](../tdd/op04-versioned-overlay-snapshot.md) public RED→GREEN: exact UTF-16 delta, genuine parser reuse2/4 versus OFF0, eight numeric ranges without old text/AST; thirteen direct controls add queued simultaneous queries, disk/overlay authority and bidirectional target completions to diskless/promotion, resident-GC, real L3/SDK-switch/process-restart. Common-fixture extraction protected by14/14; new frozen related62/62, all pins stable. Target harness/scope failures retained, not product defects. Original related137/140 and OFF/ON0/3 cold-deadline failures remain; single CPU-profile passes are not a fix. Collector barrier RED→GREEN, frozen86/86 and strict pass. Fixed ABBA four100-edit Settings sessions retain408 exact queries/404 diagnostics and full paired payload equality; raw DEGRADED/FAIL. Pooled P95 OFF2911/ON2893ms is not consistent pairwise gain; original higher ON idle RSS retained. Separate OFF100/ON100 attribution has206 exact queries/202 diagnostics, unchanged context9 and no trim/evict/create; post-GC live heap199.4/199.9MiB supports collection/capacity timing, not large persistent retention on this target. Normal timing does not force GC; not adoption/PSS/release. Other unknown/in-flight edit windows, fine-grained disk/general-config, original cold fix, net-cost audit, fresh full GREEN and adoption remain. Program replacement alone is not failure; prior promotion/freshness contracts retained |
| R-32 | Must | L03 stage DONE; selected budget/admission/cost/transient-diagnosis policy default-on under ADR 0015. Retain 1024 MiB and hysteresis, with proactive Worker retirement still off. Fault/journal-overflow recovery independently implemented. OP-05 calibrates lifecycle/resource costs; its deferred-certification candidate is REJECTED/reverted, with source/native archives and exact restoration audited4e744a73. OP-06 retains final memory gates |
| R-33 | Must | L04–L07 stages DONE; [L04](../reports/2026-10-09-resident-l04-completion-audit.md), [L05](../reports/2026-10-09-resident-l05-completion-audit.md), [L06](../reports/2026-10-10-resident-l06-completion-audit.md), [L07](../reports/2026-10-10-resident-l07-completion-audit.md) preserve stage evidence. Current selected defaults follow ADR 0015; OP-01/02/03 improve routing/validation/waiting without rebuilding capability contracts. Final latency/ready/resource graduation remains L08 |
| R-34 | Must | L08 / OP-06 IN_PROGRESS, not graduated. [OP-06 sample evidence](../tdd/op06-release-sample-evidence.md) publicly RED→GREEN rejects overlapping attempts/target mismatch, fails incomplete plans or full payload/location differences, blocks mixed builds/missing raw oracle; collector archives complete expected Locations. CLI20/20 and frozen related81/81 pass, including five real compiler fixture processes/100 repeat requests; original controller metadata error retained with independent terminal audit PASS. Resource/lifecycle/platform/DevEco/full-regression consumption and all-evidence releaseEligible=true positive remain unfinished. Then validate 336 cells, P95≤550 ms, ≥100 requests/≥5 sessions per cell, soak and original memory gates. Main merge and CI do not graduate |

R-29/R-30 resource follow-up: [two fresh Settings/API24 L3 ownership
replays](../reports/2026-10-07-resident-l01-post-eviction-ownership.md) each
returned four exact responses and one explicit resource error. A pending
normal diagnostic recreated a resident context after explicit eviction; both
Registry disposals reached zero references, yet Node RSS remained about
1.01–1.02 GB through 30 seconds idle. This is a repeatable RSS platform, not
proof of live-object leakage or a PSS pass. Preserve versioned diagnostics;
diagnostic admission during pressure and live-heap/PSS attribution remain
inputs to L03 budget/recovery and L08 acceptance. The current L03 audit closes
stage admission/recovery work; final live-heap/PSS and long-run resource claims
remain open at L08. This dated replay does not block later default-off experiments.

## Prior R-01–R-29 detailed evidence snapshot

The `Priority` column in this dated evidence table is **pre-pivot** wherever
the current table above lists an override. Historical next-step wording does
not authorize restarting S02 or graduating the rejected S05 candidate.

| ID | Former priority | Feature | Evidence state at checkpoint | Former dependency and observable exit |
| --- | --- | --- | --- | --- |
| R-01 | Must | Phase-level semantic tracing | Implemented: batch timeline, queue/candidate/anchor correlation and opt-in compiler `getProgram` / `createProgram` / `getTypeChecker` split | Real-LSP exactness GREEN; external trace-off RSS and fixed real-project benchmark belong to R-02 |
| R-02 | Must | Fixed manifests and exact oracle | In progress: Settings declares compile API 23; selected API 24 is pinned for same-SDK compatibility A/B/C, not SDK equivalence. Standard-library delivery and runtime-asset preflight passed. `HomeInitData` now has three fresh process/index-cold runs per strategy for both declaration settings: all 9/9 without declaration and 10/10 with declaration were exact, with zero target-file diagnostics. With-declaration request medians: legacy 9,030 ms, pure batched 90,894 ms, indexed-batched 5,107 ms; product RSS peak medians: 788,803,584, 743,411,712 and 554,479,616 bytes. `MenuController` has pinned 248/247-location oracles for both settings but only single-run opposite-policy evidence and one unresolved TS 2307 diagnostic. No cold result met 500 ms | [Original Settings matrix](../reports/2026-09-21-settings-api24-reference-matrix.md), [with-declaration matrix](../reports/2026-09-21-settings-with-declaration-matrix.md), [standard-library report](../reports/2026-09-21-settings-api24-standard-library.md): expand randomized/mode-C samples, edit diagnostic/freshness coverage, native Windows, diagnostic triage, original >3 GB and final 50%/PSS release gates. Retain separate matched-API-23/DevEco gate |
| R-03 | Must | Budget-aware hot context retention | Feature-gated experiment and three-versus-three real Settings mode-B A/B GREEN for exactness, not graduated; `dispose` remains default. New trace-gated batch-start RSS/heap instrumentation passed its public LSP test | `HomeInitData` 9/9 each run; retained events 1→1/`removed=false` versus dispose 1→0. Observed reference medians 4,072 versus 4,404 ms, full-run product peak medians 1,129,537,536 versus 1,136,500,736 bytes: small differences, both near 1.13 GB. One warmed trace-on `dispose` run still had 733,794,304 B Node RSS before verifier admission after resident 1→0. A subsequent isolated three-control/three-probe replay found no Node RSS decrease during any one-second no-forced-GC pause after disposal. This does not prove live double Program, a leak, or retention benefit. Next: larger randomized sample, post-eviction PSS and ≤500 ms progress. The 1,024 MiB budget is not a hard process cap. [Matrix](../reports/2026-09-21-settings-api24-reference-matrix.md), [phase report](../reports/2026-09-21-settings-post-retention-memory-trace.md), [idle probe](../reports/2026-09-21-settings-disposal-idle-probe.md) |
| R-04 | Must | Complete-result cache v1 | Implemented: pre-index bounded cache, complete results only, conservative overlay/config/workspace invalidation; F6b moves proven hits ahead of diagnostic quiescence | Real LSP RED/GREEN and three same-build Settings/API-24 mode-C runs: 27 hits, median 67 ms, observed P95 96 ms, max 100 ms, all exact. Larger release samples and mutation/SDK matrix remain open; [F6b report](../reports/2026-09-21-settings-api24-diagnostic-cache.md) |
| R-05 | Must | In-flight coalescing | Implemented | Real LSP proves one verification, independent client cancellation, shared ContentModified invalidation, and no cross-version join |
| R-06 | Must | Interactive/global lanes | Implemented for references; F6b lets complete cache hits bypass diagnostic quiescence, not misses | Real LSP proves definition/hover bypass delayed references and correct mutation freshness; F6b RED/GREEN proves cached references finish before a held diagnostic settles while versioned diagnostics still publish. Cold/miss latency and wider release sampling remain open |
| R-07 | Must | Index trust/fallback integrity | Partial: current-source consumer plus default-off empty/literal module exclusion consumed; general constructor scope proof open | [Literal-root RED/GREEN](../tdd/references-constructor-literal-roots.md): 10->6 actual batches, exact sets with unknown inherited caller and omitted-root dependency; focus38/38 plus strengthening1/1 and fresh whole-fast1133/1133 PASS/exit0. Worker/owner old-token current reads and final recheck preserve membership/dependencies/overlays; changed proof restores complete work. [Settings](../reports/2026-09-29-settings-constructor-literal-roots.md) is11x267 exact/valid but0 rule hits,14+14 batches and61.205/61.528s; nine existing hits27-51ms. No Settings/500ms/default graduation. The preceding empty-module/freshness build has its own1126/1126 historical gate |
| R-08 | Must | Index resync recovery | Implemented; native persisted pre-open endpoints now covered | Real LSP proves mutation → safe legacy fallback → committed generation advance → indexed recovery with exact Locations. A scripted test controls the old-generation/new-generation intermediate window; a separate native SQLite two-process test verifies exact fallback for pre-open watched edits, then observes the restored old committed generation during catalog startup and both declaration policies recover after a newer commit. Native intermediate-window timing is not yet deterministically covered. [S05 evidence](../reports/2026-09-29-semantic-ready-s05-context-lifecycle.md) |
| R-09 | Should | Resident full-scope references fast-path | Implemented default-off; current 18-case public coverage and final whole-fast 1126/1126 GREEN after absence-identity recovery | [TDD](../tdd/references-resident-fast-path.md): unchanged full Program and original cursor; unrelated sibling mutation no longer evicts negative evidence, actual load/configuration guards retained. [Six fixed Settings runs](../reports/2026-09-29-settings-resident-fast-path.md) each give 267 exact Locations, but all enabled queries miss at L3 and retain 24 batches; medians refs101,011/97,490 ms and warmup28,696/33,257 ms. Settings admission/graduation unqualified; no real reuse saving, budget increase or default promotion |
| R-10 | Should | Anchor reuse/fusion | Default-off warm memo, local-export and unaliased re-export cold seeds implemented; graduation open | [Warm RED/GREEN](../tdd/references-anchor-reuse.md), [local-export RED/GREEN](../tdd/references-local-export-anchor-seed.md), [re-export RED/GREEN](../tdd/references-reexport-anchor-seed.md) and [Settings A/B plus mode C](../reports/2026-10-03-settings-reexport-anchor-seed.md) preserve compiler authority and exact results. Fixture include-declaration/edit/cancel and Settings 11-query comment-edit replay pass; the single mode-C pair is not a distribution. Cold seeds require proof plus original-cursor validation in each final batch; mismatch discards/retries. All flags stay off. No verifier residency change; broader symbol/SDK, distribution, memory/freshness/500 ms gates remain blocking |
| R-11 | Could | Worker-shell reuse spike | Startup attribution measured; reuse not implemented/graduated | [Default-off trace and four real probes](../reports/2026-09-27-settings-worker-startup-attribution.md): constructor diagnostics FAIL; three short-query controls exact/diagnostic PASS. Startup secondary at 6.6% / 7.5–8.4% there, not a universal ratio or 500 ms solution. Later [original-deadline small-fixture controls](../reports/2026-09-28-settings-source-availability-consumer.md) fail with/without RSS sampling; startup receipt is their largest wall field, not pure creation CPU. S05 may test this separately; no default promotion without meaningful latency gain and peak ≤ per-batch ×1.10 |
| R-12 | Must | Memory hysteresis | Implemented | L3 remains active until RSS falls below the configured target; coordinator and production-worker regressions GREEN; reused by S05/S12, not recreated |
| R-13 | Must | Conservative incremental facts/overlay maintenance | Planned; NOT_STARTED; finer dependency invalidation remains proof-gated Should | S07 after S04/S06; existing DocumentAuthority/ProjectGraph own changes; new file facts replace old, public/global changes expand invalidation, unknown goes coarse; ordinary edit waits still count toward 500 ms |
| R-14 | Must | Compiler-derived facts feasibility, then conditional persistence | S02 FAIL: v1/v2 semantic counterexamples, v3 NON_BULK, v4 declaration-policy miss, v5 usage-site gap; isolated v6 direct `new` slice exact but alias/nonconstructor fail; real Settings/API24 production-host extraction RUN-and-FAIL; production/schema blocked | [V1](../reports/2026-09-29-semantic-ready-s02-facts-spike.md) misses constructor positions; [V2](../reports/2026-10-03-semantic-ready-s02-resolved-signature-spike.md) adds four false heritage references; [V3](../reports/2026-10-03-semantic-ready-s02-compiler-bulk-hook-spike.md) repeats per-target grouping; [V4](../reports/2026-10-04-semantic-ready-s02-shared-worklist-spike.md) misses a modified-constructor Location; [V5](../reports/2026-10-04-semantic-ready-s02-origin-worklist-spike.md) recovers that slice but cannot answer multi-origin usage-site; [V6](../reports/2026-10-04-semantic-ready-s02-usage-origin-worklist-spike.md) gives direct `new Base`/`new Derived` exact false 2/2 and true 3/4, yet alias-bound `new Alias()` returns `HOOK_UNSUPPORTED`/exit42 with no facts. [Production-host follow-up](../reports/2026-10-04-semantic-ready-s02-production-host-oracle.md): tiny pinned hook/stock constructor exact with matching sorted-root/options digests; mixed local/Array fixture now explicitly retains partial local facts and marks Array unknown. Full clean Settings 1,496-member hook extraction still exit42 `HOOK_UNSUPPORTED` before facts, now at `ADJUSTED_BRANCH`; stock MenuController 267 exact is **not** hook exact. Nonconstructor, implementation, overlay and scale gates NOT_RUN. No S03 until a fully exact and resource-gated producer exists |
| R-15 | Should | Reuse proven global lifecycle for other capabilities | Planned; existing LSP capabilities unchanged; new routes NOT_STARTED | S08/S10/S11 one capability or direction per slice; reuse lanes/freshness, independently prove implementation/rename/call semantics; no empty universal framework |
| R-16 | Won't | Second ArkTS TypeChecker | Rejected | Rust index must not become semantic truth |
| R-17 | Won't | Identity as production default now | Rejected pending proof | Known SDK-import false negative |
| R-18 | Won't | Multiple full-Program Workers | Rejected | Duplicates SDK/Program memory; global concurrency stays one |
| R-19 | Won't | File-count-only memory model | Rejected | Use measured RSS/PSS and Program closure, not linear extrapolation |
| R-20 | Must | Initial preparation availability (reframed) | S04 preparation/progress/semantic readiness planned, NOT_STARTED; preceding opt-in wait/SQL reuse not graduated | Three Settings index-cold runs are exact/one-batch at 537–560 MB but take 39.8–50.5 s and delay diagnostics; legacy takes 8.6–9.6 s at 838–964 MB. Fresh-catalog SQL trace localized activation to reference inserts and commit; a second exact 9/9 three-run trace split median 6.06 s reference work into 3.69 s occurrences, 1.75 s identity work, 0.42 s bindings and 0.10 s aliases, with 3.13 s commit. A one-run stack sample implicates automatic WAL checkpointing but not an end-to-end saving. A 96-row insert A/B regressed activation and was removed. Default wait stays off. Current [recovery/SQL reuse](../reports/2026-09-28-settings-catalog-recovery-identity-sql.md) restores the old-binary real baseline and reduces fixture Rust allocation requests, not proven latency/RSS/CPU. S04 must prove semantic readiness; initial-preparation exemption does not turn historical slow/failing samples into PASS. Exit still requires current full validation, ready-state navigation/diagnostic gate, randomized strategy samples and original >3 GB pressure case; [wait](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md), [rejected A/B](../reports/2026-09-22-settings-sqlite-batch-rejected.md), [SQL stages](../reports/2026-09-22-settings-sqlite-stage-profile.md), [subphases](../reports/2026-09-22-settings-reference-insert-subphases.md) |
| R-21 | Must | Ready-state full-response 500 ms target / 550 ms acceptance | S01 public suite/control implemented; no product graduation. 56 exact references, 50 repeated cache hits; first-query/body-edit controls slow, READINESS_UNSUPPORTED and missing buckets retained | Each capability/bucket P95≤550 ms under the user-approved L08 contract; 500 ms remains the target. Preparation separate, normal edit/new symbol/module/eviction waits included; [contract](semantic-ready/product-contract.md), [historical S01 evidence](../reports/2026-09-29-semantic-ready-s01-baseline.md) |
| R-22 | Must | Versioned semantic readiness | Planned; NOT_STARTED | S03/S04/S07; semantic owner consumes valid compiler-derived generation/input/coverage; candidate committedGeneration keeps its original meaning |
| R-23 | Must | Bounded first preparation and progress/cancellation | Planned; NOT_STARTED | S04 after S02/S03; existing supervisor/Coordinator and standard progress; valid capability-ready only; whole lifecycle memory measured |
| R-24 | Must | Definition/typeDefinition ready-state graduation | L06 stage DONE/default-off; final ready-state graduation open | L06 complete compiler semantics/current inputs/reuse/budget/cancel/recovery verified; historical S05/S09a/S12 remain research context. L08 exact URI/UTF-16, readiness and each normal bucket P95≤550ms (500ms target)/resource gates remain |
| R-25 | Must | Implementations ready-state graduation | L05 stage DONE/default-off; final ready-state graduation open | L05 independent compiler semantics/input/budget/cancel/recovery verified; no failed S02 projection prerequisite. L08 readiness/P95/resource/soak/platform gates remain; references/lexical heritage are not implementation proof |
| R-26 | Must | Completion/auto-import/hover/signature graduation | L06 stage DONE/default-off; final graduation open | L06 complete payload/current overlay/source/edit/sort/snippet/isIncomplete, stale resolve, selected budget/cancel/recovery verified; no second whole-workspace Program/owner. L08 readiness/P95/resource/soak/platform remain |
| R-27 | Must | Safe prepareRename/rename fast path | L07 stage DONE/default-off; final graduation open | Current compiler route verifies representative conflicts, complete versioned WorkspaceEdit/actual application/current inputs/budget/recovery; real62/whole1511/terminal identities proven. Old S10 facts route remains historical, no positions-only substitution. Final conflict/dialect/readiness/P95/resource matrices at L08 |
| R-28 | Should | Call hierarchy ready-state routing | L07 stage DONE/default-off; final graduation open | Independent current compiler directions/full items/fromRanges/freshness/whole-module follow-up/atomic limits; real62/whole1511/terminal identities proven, old S11 projection is not evidence. Existing capability preserved; final readiness/P95/resource/soak/platform at L08 |
| R-29 | Must | Diagnostics and resource/formatting coexistence | Existing capabilities; new readiness regression NOT_STARTED | S09c/S12; normal diagnostics codes/ranges/versions and background freshness separate from request SLO; optimize only measured gaps, no second linter LS |

R-20's linked full validation and >3 GB pressure checks in the table are product
graduation gates, not permission to claim S04 is implemented. S04 implementation
first needs truthful readiness, versioned diagnostics, cancellation and resource
safety; 500 ms navigation failures remain R-21/S12b work. S02's failed constructor
equivalence still blocks the S03 prerequisite for that route.

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

2026-10-13 OP-00 interruption-evidence slice: the public resource CLI now retains
the completed full answer, the genuinely started timeout/exit attempt and the
unexecuted tail. Watchdog loss and missing abrupt-exit cause each have actual
RED→GREEN evidence. Official/owner interruptions, prepared incoming-call
dependencies, RSS/input observation and inventory pass24/24 with all frozen
identities stable; see [OP-00 TDD](../tdd/op00-query-layer-attribution.md).
Whole interrupted sessions remain FAIL/releaseEligible=false; this is not an
OP-00 completion or final latency/memory verdict. Latest production c2a50003
also has173/173 focused protection. Its fresh whole check:fast is now1648/1648,
exit0, with zero annotations and all production/SDK/repository identities
stable; evidence `.bench/op02-source-root-model-reload-whole-v1*`, log SHA
862da85ca90f3274aea3bfc344c74fe7585fc4a4ec805c682a74a16fac5bcc4e.
Remaining direct guards, cost/lifecycle attribution and candidate-adoption
audits remain open; every historical whole failure is preserved.

OP-00 public compiler-object attribution now has actual RED→GREEN identity and
getter-interval tests, bounded event/Program overflow controls and focused29/29.
Three new same-scope Settings/API24 official sessions pass15/15 exact with
stable input/source identities, one LS factory per process and three observed
Programs per process. Each Program contains2261 actual SourceFiles; each edit
transition reuses2260 object identities and replaces only HomeInitData. Public
getter query intervals are tiny; this is not a complete build/parser/checker
count or a release P95. Necessary inputs remain DEGRADED. See
[OP-00 evidence](../tdd/op00-query-layer-attribution.md); original observer
sources and samples keep their independent identities. Production c2a50003
is unchanged; the new tooling is not included in the prior whole1648/1648.
The subsequent actual target-call/Registry shutdown slice passes31/31 and
three fresh official sessions15/15 exact. Per session native acquisition2261,
updates4522 and release2261 balance, one successful disposal and public
reportStats residual0; this is not physical-GC/RSS recovery. Edit costs chiefly
occur inside the first getDefinitionAtPosition, not the tiny observed getter;
internal synchronization/parser/checker proportions remain unmeasured. See
the same TDD for all raw identities and slower values. Declaration-inclusive
A/B now each have three fresh actual sessions,30/30 full-oracle exact, stable
pins and raw-input-counter audit. Owner edit wall remains5.16–5.67s while A is
0.77–0.84s; neither diagnostic wall is formal product P95. Owner object/Registry
terminal observations remain explicitly NOT_OBSERVED. B/Worker objects,
current normal resource curves, pressure lifecycle, remaining direct guards
and candidate adoption stay open; no final gate waived or old whole repinned.

Subsequent Worker compiler tooling passes32/32 after a retained30/32 failure
and physical temporary-path alias fix. Separately digested diagnostic export
hooks first reproduce production bundle bytes, preserve full scope/stdlib
paths/messages/WorkerData and never create an extra LS. The earlier OP-00
reportStats-zero interpretation is withdrawn: r10 omits ordinary buckets.
Native successful release counts and raw results remain; new fork refcount
queries cover observed public path/kind only. Fresh real evidence must bind
the new tool identity; no release/RSS/P95 conclusion is inherited. See TDD.

Fresh A/B native evidence now passes30/30 exact in six fixed sessions with
stable pins and diagnostic artifact/raw audits. Corrected A observed-path
fork refcounts are0 after successful disposal. Each owner has2 LS starts,
1 successful dispose and1 observed2261-source Program; each edit creates a
676-source transient verifier. Its public getProgram costs4.69–4.79s while
the subsequent target APIs cost53–56ms, not pure CPU attribution. All six
verifier last snapshots are outbound-message with676 leases/no observed
dispose: neither leakage nor zero release is inferred. Actual replacement
cause, parent-exit/dispose tail and independent heap/RSS/PSS remain open.
Defaults,1024MiB, per-batch termination and full final gates are unchanged.

Parent-exit/native-disposal caller witnesses subsequently pass public RED→GREEN
and33/33 focused regressions. Three fixed actual owner sessions pass15/15 exact
with stable production/SDK/repo/artifact/raw audits. All nine Workers have native
parent created/exited pairs; all three resident replacements come from the actual
memory-sampler L2 trim/recycle chain, not an inferred ordinary-edit reset. Six
edit verifiers still spend4.47–4.77s in getProgram. Their observed stopped threads
do not prove LS disposal, GC or physical-memory recovery; last compiler lease
counts and unobserved disposal remain explicit. Original full phase/final gates,
1024MiB and C2 source are unchanged; see OP-00 TDD for frozen identities.

OP-06 raw-RSS consumption now has three public RED→GREEN counterexamples:
contradictory sampled peaks, sampler failure and falsified interval summaries
become explicit memory FAIL without removing completed query rows. Thirty CLI/
matrix/inventory protections pass with stable pins; production C2 is unchanged.
Valid RSS observations remain memory BLOCKED, never a PSS/physical-release pass
or a newly invented hard1024MiB RSS cap. Collector regression/current tool whole,
raw-file/coverage binding and all original lifecycle/soak/platform/final gates
continue. Eight-file collector regression now passes87/87 with stable pins,
including explicit consumption of real RSS from five compiler processes/100
repeat requests; memory remains BLOCKED, not PSS/product graduation. Current
tool whole is separately frozen, not inherited from C2's earlier1648 result:
1663/1663,exit0,zero annotations, all production/SDK/repo identities stable and
independent terminal audit PASS. Full-evidence releaseEligible=true remains
unproved; new subsequent source requires its own validation. See OP-06 TDD.

OP-04 now has an explicit default-off warm-owner consecutive-overlay sync
experiment; original leases, full scope, SDK, normal diagnostics and budgets stay.
Cold owner, version jump, actual L3 eviction and reopened lineage guards pass.
An unwatched same-size disk edit plus overlay genuinely missed two references
with sync both OFF and ON: stale indexed candidates, not sync admission, were the
cause. A blanket full-coverage repair failed two existing narrowing/unit contracts
and was withdrawn. The minimal original disk-identity start/end fence instead
passes20/20 with exact results and those contracts preserved; source d6d525cf,
all pins stable. See OP-04 TDD for RED/GREEN, commands and frozen logs. Adoption,
normal trace-off net/resource comparison,100-edit evidence, unknown/in-flight
windows and a new whole remain open; the older1663 result is not restamped.

Subsequent same-source trace-off Settings/API24 four-session forward/reverse
controls complete24/24 exact requests and16 latest diagnostics, full payloads
equal, raw RSS and independent pins/audit PASS. Edit RPC5.56–5.97s→2.12–2.25s,
lower sampled peak RSS but higher idle RSS; raw readiness remainsDEGRADED/FAIL.
This is notP95/PSS, leakage proof or adoption.100-edit resources, remaining
boundaries and fresh whole continue; the sync experiment remains default-off.

The declared four100-edit groups subsequently complete416/416 exact requests,
408 current diagnostics and both full-payload comparisons. ON's fast responses
last only11/10 edits; sustained control P95 exceeds the corresponding OFF groups.
One original RSS sample-orderFAIL is corroborated by independent wall-clock
rollback observations and retained. Only the original unexecuted fourth group
was resumed, with a12-hour gap explicitly recorded. Integrity/functional audit
PASS, resourceFAIL, notPSS/release/adoption. See the OP-04 report for raw hashes;
bounded tracing subsequently observes actual L2 trim, edit12 level2 resident
miss, L3 eviction and new contexts2–4 inputs-incomplete/eviction. All19 requests/
17 current diagnostics and raw identity audit pass. This single diagnostic is
not normal performance, every slow sample's sole cause or physical release.
Future genuine monotonic RSS sampler/collector/consumer has public RED→GREEN
and97/97 related regressions, including actual wall rollback and five actual
compiler processes/100 repeats. Malformed clocks/raw fail without dropping query
rows; legacy timestamps still reject reversal. Original resourceFAIL is not
restamped. OP-05 calibration, remaining boundaries and fresh whole continue
without narrowing the full OP-00–06/L08 scope.

The fresh d6/tool whole now terminates1643/1673,30 FAIL,exit1,zero root annotations;
all before/after source/artifact/SDK/repo/archive identities match independent audit.
All seven new overlay guards pass, but29 original-deadline failures and one first
completion -32803 are retained. The latter precedes any watched mutation and passes
one isolated original-case replay: not a fix or permission to merge. One midflight
CPU speed limit42%/swap7284.5MiB reading is diagnostic, not every failure's sole
cause. Continue fixed sequence/input-window reproduction and minimal fixes before
a justified new whole; budgets, defaults, exactness and full remaining scope stay.

OP-05 is now IN_PROGRESS with a fixed current-policy calibration, not adoption:
100 original Settings alternating edits and10 explicit L3 recovery attempts,
planned114 queries/102 current diagnostics. Trace-only/full SDK/normal diagnosis/
six defaults/1024MiB/original deadlines, overlay-sync off. Deduplicate actual
eviction witnesses, retain blocked attempts and full results/raw identity pins;
do not claim100 disposals or product P95/PSS. Reverse-policy,10k/100k workflow,
native Registry/GC/CPU and remaining stage/final gates continue. See OP-05 TDD.

That first calibration now passes114/114 full queries/100 edits/102 full current
diagnostics equal to the same-source normal control,10 independent lease0 L3
eviction/recovery witnesses,no blocked tail. Full raw/input independent audit
passes; originalCLI1/FAIL/DEGRADED remains. Recovery RPC4.89–5.38s and sampled Node
peak1229MiB are not final balance/P95/PSS.5605 real monotonic RSS records pass
integrity only. No policy adoption, budget increase, fullOP05/L08 or merge claim.

OP-05 macOS workflow SDK attribution now has a public actual18-session RED/GREEN:
the report consumed the repository lock rather than selected SDK; minimal tool-only
fix uses actual SDK metadata/digest. Product-gate9/9/strict pass, productiond6 stays.
Next fixed10k/100k originalcold3/warm10/stress5 executions preserve all fixture/source
bytes and failures, not retry-to-pass. Generated-member label/count checks and RSS
are development observations, not full-oracle/latest-diagnostic/PSS or stage closure;
the currentwhole30FAIL and every remainingOP00–06/L08 gate remain open.

The fixed current10k/100k workflow execution is now terminal36/36 sessions and
10/10 post-pressure completions, bothCLI exit0. All1648 repo source bytes, SDK/
artifacts and fixture10006/100007 file paths/bytes independently auditPASS.
Peak process-treeRSS410.62/587.88MiB, warm-tail381.29/573.46MiB (ratio1.504),
recovery3.42–3.69s: retained growth/slowness, not PSS/550ms graduation. Late
100k archives contain18 start/stop log pairs,77 ok semantic-query logs and5 actual
Worker recovery events; only10 native-metric files/179 rows, remaining8 missing.
No native-exit, GC/Registry release or complete external RSS curve inference.
Next qualify full large-workflow payload/oracles/current diagnostics/raw/actual
exit retention, then bounded policy/cost calibration; fullOP05/OP06 and current
whole30FAIL stay open. See OP-05 TDD for frozen commands and all audit hashes.

Successful full macOS response retention now has publicRED/GREEN, native JSON-RPC
id/result/document-version receipts and separate pressure control records. Generated
fixture exact definition/reference sets pass, full-file10/10 then related42/42,
stable currentpins/repo/raw independent auditPASS. Tool432/test400 lines, no Rust/
new entry or productiond6 change. Earlier scale reports remain old-tool evidence;
not upgraded or rerun. Request/oracle binding, versioned diagnosis/rawRSS/native
exit and failed/unexecuted tail remain. No fresh wholeGREEN or fullOP05 closure.

MacOS actual requestparams and optional independent pinned location oracle now
have publicRED/GREEN: full SDK/fixture-byte/target binding, exact definition and
inc-declaration reference sets, eight contradictory inputs rejected. An actual
post-admission file-change oldPASS is fixed by final pin/raw-oracle-SHA validation;
equivalent JSON field/set order no longer causes a false mismatch. All original
RED and the negative-fixture alias failure remain. New four-file46/46/current
pins/repo/raw independent auditPASS, productiond6 unchanged, no new test entry.
This is tool-only qualification, not all completion payloads, diagnostics/rawRSS/
native exits/error tails, policy calibration or fullOP05/L08. Earlier scale records
not restamped or rerun; latestwhole30FAIL remains and no merge is authorized.

MacOS admitted-failure retention now has publicRED/GREEN for mismatched references,
postflight input drift, actual native exit17 and native pressure -32601. Actual
responses/params/error, targetPID/shutdown/exit and exact unexecuted session tails
are retained without PASS; pressure acceptance is not eviction/disposal proof.
Per-PID/start/RSS/monotonic observations and all parsed native metric objects now
remain in reports, with public peak/tail recomputation. They are not original
ps/JSONL byte archives, PSS, GC-live or Registry release. GREEN responsibility
extractions preserve public cases; new four-file50/50 and independent14-run/raw/
current1655-repo-byte/fullSDK/production auditPASS, productiond6 unchanged.
Current-version diagnostics, sent-but-unanswered requests, sampler/metric/post-run
failures and unapplied-stress postEviction aggregation still require tracer tests.
FullOP00–06/L08 and policy calibration continue; older scale records are not
upgraded/rerun, latestwhole30FAIL remains and no new wholeGREEN/merge is claimed.

The next tool checkpoint now excludes unapplied stress from postEviction summaries;
18 final current-version3/4 diagnostic notifications equal two independent fresh
normal controls. Missing/malformed native metrics still FAIL while preserving real
results/diagnostics/exit/unexecuted tails and original UTF-8 metric text/error.
An actual sent completion frame followed by private-child SIGKILL is now retained
as a failed attempt, not unexecuted work or a fabricated response. All five public
REDs remain; new four-file54/54 and independent11-run/fullSDK/production/current
1658-repo-byte auditPASS. Exact measured source bytes are archived and independently
decoded/verified, productiond6/defaults/budgets/deadlines/test inventory191 unchanged.
This is tool-only qualification, not a full diagnostic oracle, resource/policy
gain, wholeGREEN or stage closure. Init/real original-deadline timeout/sampler/schema
guards, real frozen scale and reverse-policy cost calibration continue with the
entireOP00–06/L08 scope; older scale reports and latestwhole30FAIL are not restamped.

The next four observation guards now have publicRED/GREEN: actual native ps failure,
genuine original30s deadline, null/negative-RSS/wrong-PID/missing-scope metrics and
actual initialization SIGKILL. Native data/error/text, attempted frames/deadlines/
elapsed time, real exit and unexecuted tails remain; missing peak is null, not zero.
New four-file58/58, independent9-run/fullSDK/production/current1660-source-byte
auditPASS and exact measured source archivePASS, productiond6/defaults/budgets/
deadlines/inventory191 unchanged. Initialization native-error responses/late frames
remain unqualified, not full failure-path closure. Read-only cost-ranking review
requires two unleased eligible contexts with positive unequal actual rebuild costs;
the single-context Settings recovery baseline cannot prove ordering benefit.
Continue finite same-build reversed defaultON/costOFF full-result/current-diagnostic/
lifecycle/resource calibration and real frozen scale within original owner/context/
budget/hysteresis limits. Whole30FAIL and allOP00–06/L08 remain; no policy gain or
wholeGREEN/merge claim, no reclassification or format-only reruns of older scale.

Real full-API24-SDK multi-root qualification and the fixed OFF→ON→ON→OFF cost
calibration now have terminal evidence: four independent native servers, 60 exact
full semantic results, 16 equal current-version normal diagnostics, and original
deadlines/budget/owner/context bounds. Both ON runs choose the cheaper observed
unleased context; functional L3 stops after one disposal below the original live
RSS target, while OFF retains LRU and disposes both. The retained root's capacity
recovery is 50–55ms vs477–482ms and L3 recovery27–28ms vs2369–2424ms. Fixed semantic
RPC totals improve13.81%/14.44%; trace-only finite sequence, not P95/natural pressure.
ON Node peak RSS is higher in both directions: no memory-benefit claim or new
policy adoption. Independent fullSDK/production/all fixture bytes/raw/results/
diagnostics/316-monotonic-sample auditPASS, 1660 measured source files archived,
and all16 observed PID+start identities exited. Productiond6/six defaults unchanged.
This closes only finite ranking/hysteresis calibration. Real10k/100k original
workflow complete oracle including completion/current diagnostics/lifecycle,
other capabilities/Registry/CPU/GC-live, whole30FAIL and allOP00–06/L08 remain.
No old36-session upgrade or format-only rerun, no PSS/550ms/stage/wholeGREEN claim.

Complete completion oracle and original runtime-log retention now have public
RED/GREEN and four-file62/62, all raw/fullSDK/production/1663-source-byte auditPASS
and exact source archivePASS. Public native APIs plus declared struct facts,
not candidate LSP copies, bind initial/edited/post-pressure full payloads; opaque
session UUIDs are validated before canonical comparison. Productiond6 unchanged.
The new original-scale qualification batch actually completes10k18/18:77 full
semantic results/18 current diagnostics/5 recoveries, with slow3.51s warm completion
and3.42–3.56s recovery retained. 100k completes only its first two cold sessions:
8 full results/2 diagnostics; third cold is pre-query FAIL and15 sessions unexecuted.
Real catalog reachesDEGRADED at~41s, while the CLI waits for percentage100 to the
original180s deadline. Source confirms terminal-recognition gap; the underlying
index-degradation cause remains unproven. Four fresh normal diagnostic controls,
85 results/20 diagnostics/1345 genuine RSS samples/logs/fullinputs auditPASS is
integrity only, functional PARTIAL; all42 observed original process identities exit.
Next: quick real-stdio degraded/end regression, retain native terminal frames and
reject without empty waiting, then establish/fix actual index request/stall/commit/
exit cause and execute only failed/unexecuted scope. Do not relax deadlines, fake
READY, restamp old scale or rerun successful scope. Whole30FAIL/allOP00–06/L08 remain.

2026-10-14 follow-up: real degraded/end terminal regression is RED→GREEN and the
catalog-terminal tool version has focused63/63 plus fullSDK/production/1664-byte
source audit/archivePASS. Finite three native100k catalog-only attempts are READY;
the original degradation is not reproduced and its unique cause remains unproven.
Explicit cold suffix and warm-cache-lineage guards subsequently have publicRED/
GREEN and selected3/3, not a new whole run. Originalcold3/warm10/stress5 and all18
planned entries remain; a passing suffix emitsPARTIAL and cannot masquerade as full.
Only failedcold2 plus15 previously unexecuted100k sessions were supplemented:
16/16,69 exact full semantic payloads,16 current diagnostic publications and5 actual
pressure/recovery payloads; fresh normalv3/v4 controls agree. All32 observed process
identities exited,16 server exits0; sidecars2 graceful and14 original boundedSIGTERM
shutdown fallbacks, not all graceful exit or Registry/GC proof. Audit SHA
dc6e8f532740d421668679fdda1b6d4cab88af94434393e512c7c36d3f7efa0c.
Slow5.03s warm completion/4.78–5.04s recovery/90–106s warm catalog and600.77/568.61MiB
peak/warm RSS remain. Low-disk safety cleanup touched only already-closed owned cold
caches, after byte metadata/actual exit checks; original IO/logs/receipts remain.
Environment intervention is explicit: diagnostic observations only, not controlled
timing comparisons, PSS, growth ratios or releaseP95. OriginalFAIL and successful
scopes are neither overwritten nor rerun; no assembled fresh18/18 or newwholeGREEN.

OP-03b interface research is nowIN_PROGRESS, not client experiencePASS. Context7
official docs plus pinned0.7.0 primary Extension/Worktree/source APIs were checked;
no supported generic existing-LSP request/progress hook was found in those enumerated
interfaces. Evaluate server-owned standard progress within stableCLI, never use
installation status as semanticREADY or a secondLS as a backchannel; public custom
contract expansion still needs an ADR. InstalledZed1.23.3 exists but its installed
server does not match the candidate: isolated current-build traffic/display/cancel
validation remains. See the cited plan and `.bench/op03b-zed-sdk-interface-audit-v1.json`.
Continue warm catalog/shutdown net cost, other capabilities/Registry/CPU/GC-live,
100-cycle evidence and whole30FAIL. Productiond6/six defaults/budget/deadlines and
fullOP00–06/L08 gates remain; no final550ms/PSS graduation or merge.

Subsequent2026-10-14 warm-catalog slice: original100k SQL attribution identifies
49.86s old-content removal within85.47s warmSQL. Public full-scale costRED retains
39.39s removal >21.14s complete cold activation; first FTS-only candidate stillFAIL,
not promoted despite its historical green-v1 filename. Original-transaction bulk
child cleanup plus one FTS reset turns the unchanged public contractGREEN.
Full-query/MemoryStore/reopen and late-failure rollback/incremental-trigger guards
pass; index-sqlite72/72, related public12/12, strictClippy/check/fmt and release build
pass. Actual source input changes with Rust; only sidecar artifact changes to8e9babc3,
do not restamp new product as oldd6 source. Raw observer finalization/count-adapter
errors and the expected build-artifact-transition guard are independently annotated,
not hidden or retried into favorable records. Slice audit SHA
48cd0e79f4fef0ed68434a133881c08bf0e6a1147ad8aa2a3755491e75e9463f.
Finite candidate100k cold/warm are bothREADY/graceful0 with original complete rows:
warmSQL85.47→46.59s and catalog108.09→67.70s; coldSQL comparable but overall31.84→
49.09s is adverse and retained. This is a cost slice, not memory/PSS/releaseP95,
all shutdown cases, current wholeGREEN or OP05/L08 graduation. Terminal diagnostic
cache alone was cleared after native exit/hash audit; original raw evidence remains.
Continue originalwhole30FAIL/current complete regression and SQL-external cold cost,
other capability/Registry/CPU/GC-live/100-cycle/client/final matrix evidence. All
six defaults/budget/owner/context/deadline gates and original failures remain.

Current2026-10-14 complete regression after warm-catalog replacement is terminal:
1697/1698,1FAIL,actualexit1,zero skipped/cancelled/todo. All original30 failures
also pass within this whole under unchanged deadlines; retain oldFAIL, not a unique
root-cause claim. Actual final SPEC root summary, full source archive/SDK/artifacts
and originalPNPM exit audit agree; earlier self-test summaries and the recorder's
inapplicable TAP counters do not replace the whole. Audit SHA
b6156f4a5de0a1c9ee61b8e24f32873e1f78f7882a27654d87e708eafb40fd28.
Only failure is naturalL3 test's final200ms idle observation assertion; earlier
complete references/latest diagnostics/eviction witnesses pass. Original idle
delta was not retained by test cleanup, never reconstructed from injected values.

Two separate publicCLI tracer bullets now prove early timer callbacks can end
200ms idle and120ms post-eviction windows at1.84/2.10ms. Each is RED→minimal
monotonic-deadlineGREEN, with genuine clock/completepayload/RSS and pressure
witnesses unchanged. Post-recycle time still consumes the same observation budget.
New seven-file65/65 has zero annotations and originalnaturalL3/Worker recovery/
diagnostic/readiness/monotonic RSS protections. Slice audit SHA
2c5e3de74dbc2efa6998cb2a9460b75fdcafbaf326f88ecd7fd0b06aa942a8d3.
Only test-scoped callback injection; no product preload/flag/budget change,
no timestamp or RSS padding, no claimed RPC/physical-memory gain. Source files
remain<=474 lines and production artifacts unchanged. Fresh post-fix whole is
next; original1697/1698FAIL remains, no merge or OP05/L08 graduation. Continue
SQL-external cold cost and all remaining capability/Registry/CPU/GC-live/100-cycle/
client/platform/final gates, without moving550ms/PSS into earlier slice admission.

Post-observation-fix whole is1699/1700,1FAIL,actualexit1,zero annotations. Both
minimum-window cases/originalnaturalL3 and old30 failures pass within this whole;
only new auto-import firstcompletion returns-32803. Whole terminal audit SHA
e7349cbcead826a6d6b5320dc03c85b170427c6e8a80afcb221749d14f03d624.
Fixed six isolated cases and original complete19/19 do not reproduce it; retain
originalFAIL and unique-causeNOT_PROVEN. Post-response diagnostic elapsed includes
captureIO, never product timing; full targetresponse plus protocolmetadata/stderr
are archived, metadata alone is not a complete payload transcript.

Independent1000ms catalog-commit control instead proves a weak test precondition:
cached search can respond while uncommitted, giving correct complete25-root
fallback rather than claimed ready2-root mechanics. 150/300/450ms controls pass
with commits before requests; neither observation proves original-32803 cause.
Exact feature extraction under original19/19GREEN reduces1777-line file to1606
(remaining migration debt), newfile192; exact inventory191→192/bundle86→87 and
three-file23/23 pass. Same delayed-commit case RED→real standard progress terminal
GREEN with original payload/ranges/pre-resolve/stale25-root resolve protection and
5s/60s deadlines. First incorrect-ready-string candidateFAIL is retained.
Related full26/26/zero annotations and cached search-during-catalog contract pass;
production adds no waiting/flag/budget and artifacts remain unchanged. Slice audit
SHA835e41f32da867029945bd8cd564509276cbd9f599858d31726101c8cedcd51d.
Fresh current-source whole remains next; old1699/1700FAIL is not restamped as fixed
or GREEN, no merge/OP05/L08 graduation. Continue all original remaining gates.

Latest OP00/OP05 whole terminated with actual PNPM exit1 and no final root SPEC
summary: counts remain null; 1466 observed pass lines are not whole coverage.
Old30/auto-import/minimum-window pass observations remain finite evidence, not
1700/1700. Original cause NOT_PROVEN. Raw log/source/SDK/artifact integrity and
actual root absence audited; SHAa2768d09abb3553c4cdcb731083880cfac2735b0fcd761ff2b2af519a3c68655.
Disk had382MiB available afterwards. Only verified closed owned rebuildable
candidate-cost cache607686656bytes removed with manifest/hash; original raw/source/
fixture retained, no broad temporary/user-file cleanup or causal performance claim.

Node test runner actual signal and missing runtime-summary diagnostics are public
RED→GREEN, stderr-only with original exit and fail-closed policy unchanged. OP06
now consumes retained full regression receipts bound to native platform/product
build, terminal raw log, complete selected fast entries and current source archive.
Eight CLI tracer bullets include missing tail, omitted input, Windows path, truthy
labels, invalid digests, unsafe counts and duplicate evidence. Synthetic3-platform
PASS qualifies only this consumer, never actual product portability/release.
Nine-file normal native regression119/119, zero annotations, all identities stable;
earlier sandbox103/119 EPERM failure retained. Audit SHA
313dc8c476da34eb8f9c3fc3788efc825aba53f94c8d562291cab4278878cc4d.
New inventory194/unit92; source/helper/tests<=267lines, old1606-line debt unchanged.
Fresh whole still next, no merge or OP06/L08 graduation. Continue collection wiring,
raw resource/OOM/lifecycle/100-cycle/portability/DevEco-PSS and the full336-cell matrix.

Fresh frozen whole now1711/1712,1FAIL,actualexit1,zero annotations and all source/
SDK/artifact identities stable; passes beyond previous silent no-summary stop.
Terminal audit SHAcaefc4e04a14346a12e10ed8a69e78bbb0e579c668104d171733f95efe0145c0.
Only resource qualification asserts an extra descendant at a read-start timestamp.
OldPID82126 command/fulltimeline not retained; unique cause NOT_PROVEN. Fixed single
case PASS is not a fix. Two real OS cross-task snapshot controls RED→actual read-end
wall/monotonic timestamps GREEN; no fabricated clock/RSS, discarded raw/peak/tail,
forcedGC/quietdiagnostics or budget increase. Original >=1 fully-window-contained
sample and no builder-child assertion retained. Completion-field corruption is an
independent CLI RED→GREEN; paired/mixed/missing/null/unsafe and wallrollback controls
preserve20 successful query rows without PSS/release promotion. Related seven-file
63/63,zero annotations,all identities stable; audit SHA
7b3caf5fe7245973c14b7921906087b0a5c4ae7421a46352c95add40964f8724.
Inventory195/unit93,new source/test/fixture<=99lines. Current post-fix whole still
pending; retain original1711/1712FAIL, no merge or OP/L08 graduation. Continue full
original collection/resource/lifecycle/client/100-cycle/platform/336-cell scope.

Local2026-10-15 OP06 public retained-regression collection now records actual
check:fast child close/exit, immutable native log/source archive, full layer
selection and pre/post build/SDK/repository/launcher identities. Eight tracer
bullets fail closed for missing/early summaries, zero execution, native errors,
SDK/source postflight failure, launcher drift and missing raw. Original spawnREDv1
after-scan source drift remains; stableREDv2→full8/8 replaces no old record.
Real collector→public consumer exposed production digest grammar mismatch missed
by both synthetic halves. Align with existing path/NUL/byteLength/NUL/bytes;
keep all checks, original failed interoperability retained. Tool-only fake-pnpm/
query proofs never become actual full regression or portability/release evidence.
Nine-file100/100,zero annotations,all identities stable; audit SHA
4d7a73e56602981677bf05ab9998f5dfa0432527fbd3242e8153b979e1a760c3.
Inventory196/unit94, new files<=270lines, no Rust/owner/policy changes. True current
whole still next, original1711/1712FAIL retained, no PR merge or OP/L08 graduation.
Continue original resource/lifecycle/100-cycle/client/platform/DevEco-PSS/336-cell scope.

Local2026-10-15 first genuine public collector whole now TERMINAL:1718/1727,
9FAIL,actualexit1,zero annotations,all source/SDK/artifact identities stable and
native PID29572 absent. Independent integrity PASS is not actual regression PASS;
audit SHA8b986396ef17f9628fcd792ee7ea4aba93d8e069050db77d3a7a5bf253c61471.
Original5s cold interaction/diagnostics,20s403-file references and20s edited
auto-import diagnostics remain. The last uses a tiny SDK fixture; unique cause
NOT_PROVEN, no uniform real-SDK/flag attribution or deadline relaxation.
Raw resource artifact collection/consumption now public RED→GREEN and applied:
retain native JSONL bytes after temporary cleanup, reread hash/length/full records,
reject missing/corrupt/unsafe/invalidUTF8 evidence while preserving exact query rows.
Legacy embedded RSS is explicitly unbound, never restamped into PSS/release proof.
Seven-file73/73,zero annotations,identities stable,audit SHA
ad449f9816f9250bbf13859acb86d4c1653033f9dfc5d3d13d510abfb3b12abf.
Original five failure files finite24/24 likewise stable but not a fix/whole PASS;
audit SHA288f7db3530f3e27b3d682d2c34e0b7218e17153a2be7ae71372e239d673bf23.
Initial observer ESM-path failure retained, not mistaken for a native product repro.
Inventory198/unit96/fast191,affected handwritten files<=477lines,production1bc4e318
and servere832f9b6 unchanged. See[raw resource TDD](../tdd/op06-raw-resource-artifact.md).
Continue reliable original-failure feedback loop and full original resource/OOM/
nativeLS/Registry/100-cycle/workflow/client/platform/DevEco-PSS/positive evaluator/
336-cell scope. No new whole GREEN,PR merge,push or OP00–06/L08 graduation.

Subsequent local2026-10-15 OP06 product memory comparison ingestion now public
RED→GREEN: original threshold/3-10-5/schema/identity math shared without CLI change;
summary artifacts reread and bound to SDK/current build/flags/selected defaults,
missing artifacts preserve20 verified query rows without an invented digest.
Raw declared Linux proc records are reaudited per PID/role/kernel value/total/read
interval, rejecting duplicates, excluded/missing roles and corrupted clocks.
Synthetic raw/summary proofs qualify only the consumer. Internal record PASS is
not product/sampling/statistic coverage; comparison remains BLOCKED, no actual
Linux/DevEco PSS, physical peak or all-evidence positive release claim.
Seven-file75/75,zero annotations,all source/SDK/artifact identities stable;
audit SHA443fb2ab083e52bf5d4a4f874942b1647f1ca2b5cbf8cf9e4232ec2ce4568aaf.
Inventory199/unit97/fast192,changed handwritten files<=371lines,production1bc4e318/
servere832f9b6 unchanged. Original whole9FAIL and finite24/24 non-reproduction remain.
Continue actual workflow/statistic/sampling scope,OOM/nativeLS/Registry/100-cycle,
portability/client/DevEco-PSS/historical>3GB/50% and full positive336-cell qualification,
plus all original OP00–05 audit/adoption contracts. See[product memory TDD](../tdd/op06-product-memory-comparison.md).
No budget/default/SDK-scope change,new whole GREEN,merge/push or OP/L08 graduation.

Local2026-10-15 production cold-cost work resumed: actual semantic Worker CPU
profile separated parsing/loading guards/end scans; public60-import RED58 native
directory probes→default1/OFF120. Query-only presence retains32 directories/32K
code units, all exits clear; original32-call compiler cache, full load/end fences,
six defaults/1024MiB/scope/SDK/owner unchanged. Seven-file59/59, original five
failure files one24/24, immutable artifacts/native exits independently audited.
Fixed normal four-child ABBA cold completion default2.98/3.23s vs OFF3.30/3.53s,
label parity only, current resolution combo vs full opt-out; not incremental
directory-only benefit/full payload/P95/PSS or original whole9FAIL unique fix.
Original57/59 and diagnostic capture failures retained; private preload provenance
not complete, harness receipt post-launch, no retrospective preflight claims.
Inventory200/unit97/bundle88/fast193, touched handwritten files<=434lines.
Production2303c3e7 and three Worker artifacts changed; servere832/SDK/sidecar same.
New genuine frozen whole is next, old whole1718/1727 FAIL remains. All original
OP00–06 adoption/resource/OOM/native lifecycle/100-cycle/client/platform/DevEco-PSS/
historical3GB/50%/positive336-cell scope remains; no graduation/merge/push.
See[directory presence TDD](../tdd/op02-request-directory-presence.md).

Local2026-10-15 actual new whole TERMINAL1750/1751,one pin-CLI OUTPUT_EXISTS,
nativeexit1/zero annotations/all identities stable; independent integrity audit
48234d0b233bdde6ec0a201dab29bf7dfccd905ccbf7b32ecc4efe5a169fdfdf.
All original nine failed parent/child cases positively PASS in this whole, but
old FAILs/unique-cause uncertainty remain. Isolated same-public-CLI0/1→1/1
identified report-path reuse with retained native RSS bytes. After terminal
audit/SHA/native-exit guards apply one113-line test correction: separate output,
preserve first report/raw exactly, retain pin/overwrite/semantic/exit assertions.
Authoritative four-file15/15,zero annotations,stable production2303c3e7/SDK;
audit4d415c33627f0ccae348baabed0d589bef0b38c7851592aac0605ece61730fb0.
Inventory200/fast193 unchanged. This fake-protocol pin test qualifies evidence
selection only, not native diagnostic execution/PSS or full1751GREEN. New frozen
whole next; all original OP00–06 adoption/resource/native lifecycle/100-cycle/
client/platform/DevEco-PSS/historical3GB/50%/positive336-cell scope stays open.
Docker readonlyexit0 still has daemon connection ServerErrors, no Linux proof.
No default/budget/SDK/production/Rust changes,graduation/merge/push.
See[pin output TDD](../tdd/op06-pin-output-isolation.md).

Local2026-10-15 corrected-pin whole1750/1751 retains original403 with-declaration
id4 timeout at unchanged20s; pin passes, all frozen identities match, no whole GREEN.
SDK candidate prototype native168→4 / related62 GREEN did not establish net benefit:
fixed normalOFF/ON/ON/OFF16 exact replies, ON slower in both first-reference policies.
New SDK candidate Map withdrawn, existing directory reuse/six defaults unchanged.
Current eight-file65/65 retains full403 scope and SDK load/freshness/configuration
recovery; inventory201/fast194, core3260 remains migration debt. Original failures,
experimental bytes and slower samples retained. Next coldProgram preparation slice
must preserve ADR0003, budgets/fullSDK/scope/deadlines; all original OP00–06/L08
adoption/resource/native lifecycle/soak/client/platform/PSS/positive336 scope remains.
See[SDK relative candidate review](../tdd/op02-sdk-relative-candidate-review.md).

Local2026-10-15 transient verifier publication order publicRED→GREEN now disposes
the native LS before either complete result or input-error reply; parent terminate
remains per-batch, no retained LS/SDK AST or new concurrency. Success55/56→0 and
real rejectedSDK load57→0 guarded, eight-file40/40 retains original403/cancel/scope.
Three real Settings sessions15/15 full-oracle exact; six native676-lease verifiers
dispose1/release676/outstanding0 at outbound boundary, actual thread exits separate.
No physical release, original whole unique fix or latency graduation; edit diagnostic
wall still4.92–5.80s. Runtime209/test140/existingCLI477 within500, oldcore3260 debt.
Inventory202/fast195, new production0fbafd7b requires genuine fresh full check:fast;
all original OP00–06/L08 adoption/resource/soak/client/platform/PSS/positive336 scope
remains. See[release order TDD](../tdd/op00-transient-verifier-release-order.md).

Local2026-10-15 genuine release-order whole1752/1754,2FAIL,exit1,zero annotations,
stable full identities: original403 and new native release guards PASS, no whole GREEN.
Both original coordinator alias failures consume an absent package.json as its parent's
entire namespace epoch. Bounded native controls and public LSP RED→GREEN now separate
metadata presence; actual package creation still rejects-32803, fresh process recovers.
Nine-file86/86 includes original coordinator22/22, SDK windows/cancel/native order/inventory.
Inventory203/fast196, core3256 debt, new production5cf9d618; old full FAIL retained.
Next preserve standard failed SPEC tail counts as FAIL, then freeze a genuinely fresh whole.
All original OP00–06/L08 adoption/coldProgram/resource/lifecycle/soak/client/platform/PSS/
historical peak/positive336 scope remains; no graduation/merge/push or earlier550ms gate.
See[package presence TDD](../tdd/op02-package-metadata-presence.md).

Local2026-10-15 standard failed SPEC tail consumer publicRED9/10→GREEN10/10,
eight-file80/80,stable full identities. Completed integer nonzero/null-signal exit
and positive failed count permit native failure details while retaining actual counts
as FAIL, never release; zero/signal/invalid exit/green summary/arbitrary tail rejected.
Production5cf9d618/inventory203/fast196 unchanged; fresh frozen actual whole next,
all original adoption/resource/lifecycle/soak/client/platform/PSS/positive336 scope open.
See[failed SPEC tail TDD](../tdd/op06-failed-spec-tail.md).

Local2026-10-15 actual current production5cf9d618 frozen whole1757/1757,exit0,
zero annotations;1702-file source/archive/artifact/SDK/launcher identities stable,
native PID absent and independent terminal audit PASS. Original403 and both old
coordinator alias failures positively PASS; not a unique old-timeout-cause claim.
Terminal audit SHA d310326ca54ac55f3fdc7049d6b69cfc4c53de53a129fff7c9d99c874e510546.
Real public release CLI consumes original1757 counts/archive without synthetic query
or repinned old report; missing current product query build correctly remains BLOCKED.
Central next-execution table reconciled: candidate adoption/rejection, remaining cold
preparation/resource scenarios, PSS recipe/workflow coverage, lifecycle/soak/platform/
historical peak and all-positive evaluator/336 cells. Earlier stages have no550ms barrier.
Current code regression GREEN, no final graduation/merge/push; old failures unchanged.

Subsequent local2026-10-15 PSS declared-peak lower-bound guard publicRED13/14→
GREEN14/14, eight-file82/82 with stable source/SDK/artifacts and actual PID absent.
Raw server/DevEco same-metric peak above summary now FAIL; later higher samples
cannot be omitted. Unobserved higher summary stays BLOCKED, never qualified PSS.
Synthetic proc records qualify only the consumer; full statistical/workflow/scope
binding and original lifecycle/portability/soak/historical/positive336 gates remain.
Production5cf9d618 unchanged, script119/test393; fresh tool-head whole pending,
preceding1757/1757 retains its own frozen source rather than covering this change.
See[product memory TDD](../tdd/op06-product-memory-comparison.md#2026-10-15声明峰值的必要下界保护).

Local2026-10-15 fixed eight-metric PSS statistics publicRED15/16→GREEN16/16;
shared synthetic fixture extraction preserves16/16. Median/even-median/maximum/first,
each inconsistent/missing metric, unknown recipe and unsafe arithmetic controls pass.
Original inventory88/89 FAIL retained; corrected exact count yields nine-file89/89,
zero annotations, stable source/SDK/artifacts and native PID absent. Inventory204/unit98/
fast197; calculation39/shared-fixture98/new-test132 within500. Arithmetic binding only,
productCoverage NOT_VERIFIED/comparison BLOCKED, not native Linux/DevEco measurement.
Production5cf9d618 unchanged; old frozen1757 does not certify the new tool head.
Workflow/topology/run/PID/window/coverage, lifecycle/portability/soak/historical peak,
all-positive evaluator and original336-cell final scope remain open.

Local2026-10-15 original seven-topology/two-product/3-10-5 PSS declaration binding
publicRED16/17→GREEN17/17, rehashed manifest type17/18→18/18; ten-file97/97,
zero annotations, stable source/SDK/artifacts and actual PID absent. All252 slots,
manifest bytes, run IDs and sample read/PID/role/start identities bind; missing remains
BLOCKED, contradictory/duplicate/outside-window evidence FAIL. Dynamic cohorts remain
valid if every declared identity is observed; not a full native-tree proof. Inventory205/
unit99/fast198, module99/new-test133/fixture71 within500. Production5cf9d618 unchanged.
Synthetic declarations qualify binding only: actual execution/samplingCoverage/
productCoverage still NOT_VERIFIED; original actions/payload/cache/ready/OOM/lifecycle/
platform/soak/historical/all-positive336 remain open. Old1757 cannot certify new tool head.

Local2026-10-15 declared sampling-span/cadence publicRED18/19→GREEN19/19;
original-error retention RED5/6 repaired without treating failed reads as success.
Eleven-file104/104,zero annotations,stable source/SDK/artifacts and actual PID absent.
All per-run sample counts/edges/read duration/actualP50/P95/max are recomputed; single
or clipped windows/missing rows BLOCKED, contradictions/native error FAIL. Actual80ms
gaps remain80ms despite50ms request; continuousPeakCoverage/productCoverage NOT_VERIFIED.
Inventory206/unit100/fast199; module49/test126/fixture43/consumer145 within500.
Synthetic data qualifies only DECLARED_RUN_WINDOW_GAP_ACCOUNTING_ONLY; original real
actions/results/cache/ready/native tree/peak/OOM/lifecycle/platform/soak/historical/
all-positive336 scope remains. Production5cf9d618 unchanged, fresh tool-head whole pending.

2026-10-15 OP-01 routing slice ADOPT/DONE: fixed12 timing/4 independent trace,
80 exact responses retain original measurement identity;5/6 new-target pairs faster,
no stable edit/RSS gain. Eight route/protection files equal the frozen1757/1757
production archive; ten direct public PASS contracts and16 original artifact triples
re-audited. Audit1fa7716d; default1/explicit0,cache-first,cold skip/full fallback stay.
Historical FAIL/DEGRADED and whole failures remain; new tool whole and L08 stay open.

2026-10-15 real original stress module send receipts and unexpected failure-report
retention public RED→GREEN; eight complete files81/81,exit0,zero annotations,stable
source/SDK/artifacts. Every stress retains20 actual open/close pairs; SENT is queued
send, not acknowledgement/load/dispose. Before unchanged assertion/fixture cleanup,
unexpected-exit diagnostics keep original reportText; preflight hasnull, expected
failure remains expected. Previous77/78 lifecycle FAIL had lost its report and remains
unlocated; selected replay1/33 and this related PASS do not prove a fix. Default-sandbox
samplerEPERM FAIL is separately retained; temporary diagnostic preload removed.
Auditbc4342bd; inventory207/unit101/fast200,changed files≤500. Production5cf9d618
unchanged. Real execution/payload/cache/ready,DevEco/native PSS tree/peak/OOM/lifecycle/
platform/soak/historical/all-positive336 remain; fresh tool-head whole pending.

2026-10-15 OP-02 pure-hash sub-slice ADOPT/DONE: real native in-flight SDK and
nested-root overlay boundaries qualify default/opt-out. Old SDK proof is rejected,
new verifier loads76 rather than28 SDK code units and matches fresh2/3 full results;
nested mutation rejects parent withContentModified/no result, then complete5/6 and
latest diagnostics recover. Original20s references contract unchanged. Private
duplicate-barrier and invalid fixture/early-wait expectation FAILs retained; no
production fix claimed. Ten complete files84/84,exit0,zero annotations and stable
source/SDK/artifacts; audit64bb567a. Inventory208/unit101/bundle92/fast201.
Original fixed18 cohorts/all artifact+native counter hashes reverified,5/6 new-target
pairs faster,edit/RSS mixed. Pure-hash adoption audit383773a2; only bounded actual
string SHA per request, no FS validity memo. Original3d6cc93f timing stays separate
fromcurrent5cf9d618. Module/directory combination adoption and new tool whole remain;
full OP-02/OP-00–06/L08 scope is not reduced or completed by this sub-slice.

2026-10-15 OP-02 selected request-local reuse slices DONE: bounded official module/
directory combination ADOPT after re-reading original12 normal session artifact
hashes,60 full results/24 diagnostics and original four cold-cohort logs. New/added
reference pairs3 faster/3 slower,removed6 faster,RSS mixed; cold cohort remains limited
label/posthoc-harness/request-end RSS, not independent peak/full payload/current SLO.
Current five complete files36/36,exit0,zero annotations,stable source/SDK/artifacts;
audit1cf78a74. Five production/protection files equal frozen1757 archive. Combination
adoption audit356305f1; source18449053/2303c3e7 stays distinct fromcurrent5cf9d618.
Pure-hash ADOPT and SDK candidate Map REJECTED decisions stand. Full input-protection
contracts and84 related passes indexed by plan; no optional new hotspot gate extends
OP-02. Remaining OP00/03/04/05/06 and full L08 scope unchanged; fresh tool whole pending.

2026-10-15 OP-03a current public scheduling/readiness baseline31/31,exit0,zero
annotations,stable source/SDK/artifacts and actual PID absent; auditc3f7b689.
Four complete files preserve fair completion bypass/cancel/edit/global barriers and
explicit prepare/status/query-refresh/unknown-input/missing-input/lifecycle ready
contracts. Private holds and case durations are not normal wait/net-cost/P95 proof.
Next distinguish LSP suspend/in-flight settlement,supervisor pending,physical Worker
waiting and afterQuery; first extract cohesive validation/error ownership from894-line
supervisor under public characterization,then default-off observation via publicTDD.
No owner/concurrency/budget/diagnostic suppression change; OP-03 remainsIN_PROGRESS.

2026-10-15 OP-03a two observational vertical slices pass public RED→GREEN:
parent admission→original successful send return and Worker callback→dispatch,
default-OFF exact ARKTS_SEMANTIC_QUEUE_TRACE=1. Original six full files68/68 before
and after cohesive input/error extraction; supervisor894→726→732 remains debt,
new helpers139/52/66,runtime494,core3256 unchanged. Current nine full files78/78,
exit0,zero annotations,stable source/SDK/artifacts and actual child absent.
Complete ON/0 v1/v2 payloads/latest diagnostics match with validated UUID-only
normalization; cancelled pending/send-failed requests acquire no successful receipt.
Ordinary private fixture raw segments retained, not normal Settings benefit/P95;
Worker callback excludes undelivered event-loop time, no cross-thread subtraction.
Current production0039016a/server47aca4f2/Worker a6ad72de; old1757/5cf9d618 remains
historical, fresh current whole pending. Inventory209/unit101/bundle93/fast202.
Next LSP suspend/inflight settlement and conditional afterQuery attribution, then
real normal cost/adoption; OP03/L08 stillIN_PROGRESS, no final550/PSS front-gate.

2026-10-15 OP03a adds original cache-miss quiescence and complete in-query readiness
call boundaries via publicTDD. Default/0/1 cache and full payload/latest diagnostics
remain; queryScope* is the actual returned proof scope, not a new public root ready.
Two92/93 observer failures retained; precise scope/proof-metadata fixes and full
sixteen-file172/172 pass with stable source/SDK/artifacts,exit0,zero annotations,
audit ec9d5cd8. Old root nonready/unknown membership/2307 protections not weakened.
New queue flag also blocks attribution sampling from normal latency/product memory,
including forged trace-off metadata; full release-consumer41/41 is synthetic tool
evidence only. Current production0fb92f3e/server9c52c111/Worker80df72bf/diag fd61f3dd;
core3256/supervisor732 migration debt unchanged, touched source/tests/scripts≤500.
Predeclared current Settings OFF→ON retains10 full exact responses and equal latest
diagnostics, native CLI1/reportsFAIL/readyDEGRADED2307 retained. OFF new refs664ms,
edit4.5–4.9s; ON reference quiescence12.283/0.285/0.362ms, onlydegraded-scope
certification0.110ms. Cohort audit acfac21c; not priority net-benefit/P95/full-ready
refresh or physical PSS. Continue edit preparation/fallback attribution, normal
busy completion and real successful-ready cost/adoption; no extra scheduler or
final550 barrier. Fresh current whole remainsNOT_RUN; old1757 not upgraded.

2026-10-15 OP04 Snapshot default-promotion decision REJECTED/closed: current
source0fb92f3e four fixed OFF100/ON100/ON100/OFF100 sessions retain408 full exact
definitions/404 current full diagnostics. Forward editP95 OFF2002.8/ON1984.5ms,
reverse OFF1275.3/ON2011.7ms;pooled OFF1958.2/ON1996.2ms,peak RSS mixed.
No stable net benefit; no favorable resampling. Cohort integrity b61dac5a, all
native source/SDK/build identities and CLI/server/sampler terminal receipts bound.
Keep actualCLI1/FAIL/DEGRADED2307 and sampled RSS≠PSS. Only unadopted Snapshot
default switchesOFF, explicit1 experiment retains exact native deltas/AST reuse/
eight-range expiry and full results; six ADR0015 defaults and overlay-sync0 unchanged.
Public default RED then first9/14 policy-expectation FAIL retained; old incremental
test parameters migrate to explicit1 with assertions/deadlines unchanged, new
default/0 full-payload check retained. New production1ab95acd full two files14/14,
then thirteen complete related79/79,exit0,zero annotations,audit037770f1.
script-record36/test451≤500; core3256/supervisor732 migration debt untouched.
The first current whole subsequently failed1794/1795,exit1: private GC JSON
publication raced the real parent reader; original failure/audit a35ca1d1 retained.
Native split-write RED, then exclusive atomic publication through a complete
temporary file; actual GC/result/context assertions and original deadline retained.
Thirteen complete files79/79,exit0,zero annotations,audit207ad900,strictPASS;
production1ab95acd unchanged. Fixed tool-head original full check:fast now1795/1795,
exit0,zero skip/cancel/todo,2671965.974116ms; all202 fast entries/source/artifact/
SDK/original launcher identities and native root PID absence independently audited
(b38d39c4). Current code regression GREEN only; original1794/1795 FAIL retained,
not product net-benefit/PSS/client/platform qualification or old lifecycle root cause.
New fixture26/GC71/support74/test457≤500; existing migration debt unchanged.
Remaining OP04 disk delta,
unknown/inflight/general-configuration contracts and OP03/05/06 full scope remain;
do not reopen rejected S05 or add a final550/PSS predecessor gate.

2026-10-15 OP03a ordinary busy-completion comparison remains NOT_COMPLETED.
One-predicate generated control differs only in complete bypass; original public
five cases5/5, control4/5 fails only the ordering assertion. Frozen Settings four
cohorts stop after first oracle omitted public modifier, then corrected input
hits actual final-report ENOSPC. Preserve both failures and three unexecuted
cohorts each; twelve server ok log events do not certify lost full client payloads.
Four closed benchmark-owned SQLite DB/WAL/SHM files1051828664 bytes removed only
after SHA/native PID/lsof audit; ten raw artifacts preserved, cache regenerable.
Private experimental v3 tool public RED/GREEN closes invalid report as FAIL and
journals real complete responses/current diagnostics/native exit before summary;
two full files4/4,exit0,zero annotations,audit4267f371. No production source/build/
policy change, current1ab95acd whole1795 remains the code baseline, not net benefit
or qualification of these nonshipping experiment scripts. Next fix disk housekeeping
between closed sessions and execute original four-way scope; OP03a/b and all other
open OP00/04/05/06/L08 contracts remain.

Subsequently fixed OFF/ON/ON/OFF ordinary Settings cohort completed48/48 full
completion responses and96 ordered current diagnostics; terminal/native PID,
source/build/SDK, protocol journal and nonoverlapping cache housekeeping audit
4692ffbdPASS. Three full experimental tool files8/8; original oracle and two
ENOSPC failures retained separately, no old timing pooled. Each state24 samples:
pooled completionP50 OFF2522.892/ON10748.473ms,observedP95 OFF19072.358/ON15010.825ms.
ON precedes second diagnostic publication but current diagnostics finish later;
both paired ON sampled RSS peaks higher. No stable whole-workflow net-benefit
claim; keep existing bounded ordering correctness fix, no new production switch,
scheduler, owner or concurrency. Actual transient diagnostic pairs8/13/5/3 do not
prove the unique cause of every slow response. All roots stillDEGRADED2307;
journal I/O and actual sample gaps retained, no ready SLO/PSS/CPU graduation.
Four sessions removed1568391168B closed regenerable caches after native exit;
separate failed-run392097792B and oldOP05 950888512B caches removed under exact
SHA/PID/lsof/raw-preservation audit. No raw reports/source/datasets deleted.
This predeclared comparison is closed, no favorable resampling. OP03a success-ready
refresh and broader OP00/03b/04/05/06/L08 remain; production1ab95acd whole1795 unchanged.

Successful-ready refresh cost is now observed separately, not inferred from
SettingsDEGRADED: installed fullSDK/generated1000-workspace500-active corpus,
six fixed normal/probe sessions54 exact complete definitions54 current public
READY proofs36 body edits42 complete latest diagnostics. Full source/build/SDK/
overlay/identity/generation/native-exit/raw audits b3079b3fPASS. Normal edited RPC
827–921ms; trace-only full certification501–573ms, each edit869 actual dependency
check calls,15642 over18 edits. Not869 full recomputations or pureCPU. All original
CLI1/reportsFAIL retained with ready/diagnosticsPASS, other gatesBLOCKED/NOT_RUN;
not final550/PSS/client/platform or Settings qualification. Measurement gap closed,
OP03a stillIN_PROGRESS; next public falsifiable redundant-certification slice must
retain fresh start/end guards and full construction before final input admission.
No source/policy/owner/budget changes, current1ab95acd whole1795 still baseline.

2026-10-15 OP03a fresh-preparation redundant admission slice public native RED
10 SDK-leaf lstat calls versus corrected budget8, then minimal readiness-only
implementation. Entire report/identity construction precedes the retained final
fresh guard; actual SDK mutation during construction revokes READY and ordinary
configuration/revision recovery succeeds. Original characterization28/28,
GREEN30/30, broad twelve complete files70/70; strict/build pass, eabe24ef input.
No validity caching/dependency omission/new flag/owner/budget/scheduler changes.
Fixed baseline→candidate→candidate→baseline path-normalized variants retain
36 complete exact/currentREADY proofs24 edits28 latest diagnostics, all actual
source/SDK/stdlib/full coverage/build/exit/raw identities audited125adc35PASS.
Edited medians968.378→883.679 and985.707→901.196ms, sampled RSS peaks lower in
both pairs; local adoption supported, not direct production/Settings/PSS/final
P95 evidence. Original fourCLI1/FAIL and blocked final gates retained. No extra
resampling; old whole1ab95acd1795 does not cover currenteabe24ef. Fresh complete
203-fast entry check:fast remains required; OP03a and broader planIN_PROGRESS.

2026-10-16 currenteabe24ef original full203-fast check:fast TERMINAL1779/1797,
18FAIL,exit1,zero skip/cancel/todo,3986965.985619ms; all original source/build/
SDK/launcher/entry/PID-exit identities auditedd16e6667PASS. Actual regression
remainsFAIL, not a readiness-slice or product graduation. Two original complete
files reproduce11/11; five further original files90/91, stable403-source20s
timeout retained. Other original5s failures and hover acquisition remain not
located/fixed. One selected403 trace1FAIL2unselected, audit0fdb64ac;82 actual
native events recovered from PID35294,14 batch starts13 completes. FullSDK255,
Program preparation2.0–2.5s/batch versus mostly millisecond query bodies, plus
2.8s unsuccessful anchor before7-batch conservative fallback. No deadline,
scope,per-batch disposal,owner/concurrency or budget relaxation.
Maintainer explicitly authorizes both opened-caller navigation and direct
never-didOpen source requests. First public rootREADY/disk-definition RED
actual[] versus exactLocation, plus complete manifest4/5,audit0e45a55f. No product
change yet; new test registered204-fast/211total. Next implement genuine disk
source authority and freshness, not fake overlays; broader OP00–06/L08 remain.

2026-10-16 OP03a genuine request-scoped disk source now admits direct definition,
typeDefinition and hover, each public framed-stdio RED→GREEN. Opened-caller and
never-didOpen entry payloads match complete cross-module locations or full hover
markdown/Unicode/range. Existing physical ownership, bounded regular-file reads,
request freshness, final source identity and cancellation remain; no fake overlay,
open-map entry or mutation/revision advance. Same-size/mtime unnotified edits,
actual Worker-send-window edits, physical escapes/non-files, real open authority,
close recovery and one canonical cancelled terminal response are publicly covered.
Real client version0 was a genuine defect: overlay initially queried correctly,
but close left stale engine content and the disk query failed -32603. Public RED
retained, minimal explicit source discrimination fixes it; full opened0 outgoing
oracle passes. Existing incoming/outgoing disk follow-ups no longer synthesize
open/close. No new owner/LS/concurrency/budget/flag; six ADR0015 defaults unchanged.
Original characterization86/86, pure extraction94/94, earlier related229/229;
final current production78112f97 sixteen complete files233/233,exit0,zero annotations,
206457.25452ms, full source/build/SDK/native PID absence audit2260f860PASS; strict/
build pass. Protocol getter/exact-key/immutable/text/wire bounds retained. New
files≤500; touched debt protocol1927→1904,proxy550→522,legacy917→901 remains recorded.
Manifest212total/205fast, current full whole NOT_RUN, historical1779/1797 FAIL and
cold403 timeout not rewritten. Other direct capabilities require their own RED/
GREEN; no formalP95/PSS/product graduation. OP03a, all other open OP00–06 and L08
remainIN_PROGRESS. Evidence details and preserved intermediate failures in
[OP03a TDD](../tdd/op03a-completion-diagnostic-priority.md).

Subsequently OP03a signatureHelp, completion, completion resolve and call-hierarchy
prepare each publicRED→GREEN; seven direct document methods plus full existing
incoming/outgoing chain match independent opened-caller oracles. Disk completions
preserve all item/edit fields and validated unique opaque handles. Resolve uses
the server-owned item, rejects forged client replacements and exact source-byte
changes even at same size/mtime, then fresh prepare/list/resolve recovers. Original
512 records/256 returned items remain bounded, one hash per list, no extra source
text retention; open-only preResolved shortcuts do not mistake internal disk0
for client overlay0. Existing physical/source/result/freshness/cancel protections
and all six defaults remain. No synthetic overlay/mutation or extra owner/budget.
Minimal/full original completion characterization44/44 before and after pure mapper
extraction; resolve45/45 and call preparation/full directional chain46/46. One
mis-invoked intended five-file run executed only the first file12/12 (missing
native --test flags), recorder2/invalid qualification; raw run and audit21e3722f
retained, not counted as five files. Corrected command44/44 is separate evidence.
Current productiondce6888a, nineteen complete files271/271,exit0,zero annotations,
286817.898202ms, actual source/build/SDK/PID-exit auditbc4ebe96PASS; strict/build pass.
Full-profile private test SDK is not installed SDK product timing/P95/PSS evidence.
Source count1731, test entry inventory212total/205fast unchanged. New handwritten
files≤500; touched migration debt server792→677,protocol1927→1906,proxy550→522,
legacy917→901 remains. Current whole NOT_RUN; original1779/1797 FAIL/cold403 timeout
and other unresolved causes retained. Next direct references both declaration
policies/implementation/prepareRename/rename; remaining OP00–06 and L08 stillactive.

Those next core entry gaps have since passed their own public RED/GREEN:
implementation exact3 workspace locations; references both declaration policies,
repeat and cold without pre-prepare; prepareRename full range/placeholder; full
origin rename with exact null/open versions and controlled application, no server
writes/invalid-name edit. Separate local-import alias characterization preserves
the origin rather than incorrectly changing the whole declaration.
A real same-size/mtime unnotified other-source edit initially retained a stale
Location; the unqueried declaration-policy miss was current while the repeated
old key was stale, ruling in parent result-cache admission. Disk hits now validate
the original owner complete current READY generation/input proof; storage binds
the same before/after certificate. Proof bytes count in128 entries/8MiB, no AST/
LS transfer. Absence/drift falls back complete, not empty; real cache hit is
explicitly observed, so this is not disabling optimization to pass. Original open
cache-before-diagnostic behavior remains. Twelve complete related files93/93.
Identical disk references initially superseded one participant; now the existing
coalescer shares source resolution/execution while each client owns cancellation.
One cancelled participant does not cancel a full survivor; managed source edit
revokes both old requests, full latest references recover, each ID has one terminal.
Existing600ms verifier/trace windows only prove these controls, not normal cost.
Final current bd4010b6 twenty-eight complete files313/313,exit0,zero annotations,
379799.563245ms, all1733 source/build/SDK/native PID-exit auditedb36e8173PASS;
strict/build pass, inventory213total/206fast. New source test356/admission38/disk
runner84≤500; old touched debt protocol1906→1901,legacy901→885,proxy522 unchanged
after cohesive cache-admission extraction; server677 remains earlier debt.
First rename RED had selected a local import alias with an incorrect origin
oracle; retained, corrected origin-declaration RED still failed before minimal
admission. All intermediate failures retained. Basic14-item entry functionality
does not prove every bucket or installedSDK/P95/PSS/client/platform qualification.
Current fresh whole NOT_RUN, original1779/1797 FAIL/cold403 and other unresolved
causes preserved. Next real full-SDK new-path/proof costs, cold repeated Program
preparation and all remaining OP00–06/L08 contracts; default64 batch roots, six
defaults,1024MiB,one owner/max2 contexts/verifier concurrency1 unchanged.

2026-10-16 OP00 finite cold-batch observation completed on unchangedbd4010b6.
Original403 default64 trace0 once1PASS/2unselected (35.120s), not an identified
fix for the old20s timeout. Transparent collector public RED→GREEN then fixed
64/128/128/64 yields16 exact full replies, normal workflow36.22/22.05/22.26/36.02s;
sampled tree maxima377.71/369.83/372.83/373.07MiB. Independent trace64/128 each
passes original public payload/deadlines and shows14/8 native complete batches,
every batch fullSDK255/admitted403; Program readiness1.96–2.06s versus mostly
millisecond queries. Trace overhead is not pooled with normal timing; two pairs
are not formal P95 or complex-closure budget qualification. Normal report audited
6d732f61, phase0fbb9334; allraw files and8 failed pre-native collector launches
preserved. No production changes/default adoption;128 is a qualification
candidate only. Continue actual complex workload, both source entries and proof
cost, edit/unknown input/cancel/pressure, original regression/OP00–06/L08 scope.

2026-10-16 current original206-fast full1822/1824,2FAIL,exit1/zero annotations,
3043887.808356ms,audit5e4670c8, allsource/build/SDK/launcher stable. Original403
passes unchanged20s deadlines but historical cause not fixed. Old empty-source
benchmark assumption reproduced then corrected to real complete positive; a
separate explicit protocol-empty negative RED→GREEN preserves fail-closed READY
and full oracle. Fixture extraction GREEN12/12 before/after; related26 complete
files207/207,auditb52bce01. Only4 test/fixture files changed,474/109/198/497lines;
production bd4010b6/defaults unchanged. Constructor original seed-event failure
not reproduced in selected/full30, native output retained, no guard removed or
root-cause claim. New test-head whole still needed. Full installedSDK source-entry
18 cells and separate2 phases described above are finite observations, not release
or default adoption; all otherOP00–06/L08 work and historical failures remain.
