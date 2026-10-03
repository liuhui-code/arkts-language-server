# ADR 0003: Reference verifier lifecycle

Status: **Accepted**.

The [awake-host regression recovery](../reports/2026-09-29-awake-regression-gate-recovery.md)
now passes the three original timeout cases in three independent runs (9/9)
and the complete fast gate (1093/1093,exit0,zero cancelled/skipped/todo), with
unchanged artifacts and request deadlines. Prior cancelled-session logs show
the failing baseline already slow before cancellation, only24ms recovery
miss-to-queue wait and negligible inter-batch gaps. No missing terminate/fence
is demonstrated; this is not a lifecycle fix or proof of one exclusive host
cause. Per-batch termination and all memory/latency graduation gates remain.

R-10's [opt-in definition-to-anchor memo](../tdd/references-anchor-reuse.md)
reuses a compiler-produced Location, not a Worker, Program or Symbol. It does
not change this lifecycle decision: every final reference batch remains in a
transient verifier, and a default-path cache miss still resolves its anchor in isolation.

## Context and decision

Keep one transient Worker per reference batch and terminate it after the
compiler-verified result or failure. Do not make the verifier Language Service
permanently resident. The [R1 evidence](../reports/2026-09-11-bounded-references-r1.md)
found retention growth with a same-isolate prototype; cold profiling attributes
most time to Program/Checker preparation, not `findReferences` itself.

Request-scoped Worker-shell reuse may be measured behind an experimental flag
only after phase tracing exists. It may reuse the shell, not silently retain a
Language Service. Global verifier concurrency stays at one. No `ts.Symbol`
crosses a Program boundary.

The [startup-attribution slice](../reports/2026-09-27-settings-worker-startup-attribution.md)
adds default-off `workerStartupMs` to isolated anchor and final-batch traces.
This is parent spawn-to-runtime-ready receipt wall time, including compiler
module loading/scheduling/transport, not pure Worker creation CPU. It can
overlap subsequent worker preparation due to callback scheduling; do not
sum phase fields as disjoint CPU allocations. Measure this contribution
before implementing R-11 shell reuse; instrumentation alone changes no
residency or lifetime policy.

Completed attribution under observed Mac CPU limiting finds startup receipt
at about 6.6% of the failed constructor request and 7.5–8.4% in three exact
HomeInitData controls, versus dominant Program readiness. This does not make
startup free or prove Worker-reuse savings, but does not justify prioritizing
shell reuse as a route to 500 ms. R-11 remains a secondary experimental option;
the per-batch default and memory/correctness graduation gates are unchanged.

The later [original-deadline controls](../reports/2026-09-28-settings-source-availability-consumer.md)
retain two constructor timeout traces, with and without external RSS sampling.
Completed tiny Programs have 2–5 project files and zero SDK declarations,
but startup ready receipt is the largest recorded wall field: 16.533/15.003 s
over 10/13 completed attempts, versus 9.200/10.291 s Program readiness.
These are different partial workloads, not a latency A/B distribution; startup
receipt is still not pure creation CPU and may overlap subsequent preparation.
Do not transfer the earlier 6.6%/7.5–8.4% proportions to every request or host.
Removing the sampler does not close the original 30 s gate. This diagnosis
does not graduate shell reuse, change the per-batch policy or admit constructor
candidate exclusion; regression and product gates remain open.

The later [module-cache controls](../reports/2026-09-28-constructor-worker-module-cache-control.md)
preserve the original bundles and transient lifecycle. An environment-only
Node bytecode-cache run passes the complete public constructor test, while
two explicit cache-disabled controls fail at the original 30 s deadline.
One failed batch records 20.181 s startup receipt and only 0.974 s Program
readiness. A canonical temporary-root microprobe separately observes about
311/187 ms mean pre-ready thread CPU for off/warm configurations, not pure
parsing CPU, a measured cache-hit rate, or an explanation of that 20 s outlier.
These small sequential observations do not graduate caching or shell reuse;
Node 20 compatibility, whole-fast and release gates remain open. No production
cache switch, Worker lifetime or semantic working-set policy changes.
An opt-in temporary preloader subsequently observes the original LSP verifier,
not a replacement query: a late retry records 6.802 s parent startup receipt,
4.033 s child pre-ready wall and 0.727 s current-thread CPU. The original
30 s request still times out. Child wall is not all parsing/computation CPU;
this does not identify IO, scheduling or GC as the sole cause, nor reproduce
the earlier 20 s outlier. Prefix observations add overhead and are diagnostic,
not a cache speed or release-memory comparison.

The [OS-wait controls](../reports/2026-09-28-constructor-worker-os-wait-control.md)
retain another original 30 s timeout, now with process-wide resource deltas.
One pre-ready interval records 5.788 s child wall / 1.031 s thread CPU,
1,835 major faults and 28,756 involuntary context switches for the whole Node
process. Native samples observe compiler/GC frames but are delayed and cover
the whole PID, not a certified triggering thread. The same original case also
fails without native sampling, and an explicit Node 20.19.5/no-preloader control
times out on its with-declaration constructor request. Host-wide swap/CPU
pressure and these counts do not allocate wait time or prove a sole cause.
Neither changing Node version nor these diagnostic observers repairs the
gate or authorizes shell reuse, altered batch scope or relaxed deadlines.

The [temporary whitespace-only artifact control](../reports/2026-09-29-verifier-whitespace-control.md)
also does not repair cancellation/recovery: baseline 2 PASS/1 FAIL, compact
1 PASS/2 FAIL at original deadlines. A 1,803 s host Idle Sleep contaminates
one failed wall-time sample; retain the failure but never classify that span
as compiler CPU or use it in a speed ratio. Baseline bytes and complete inline
licenses are verified, formatting is not enabled, and transient lifecycle,
full correctness scope and the failed whole-regression gate remain unchanged.

A subsequent read-only preflight in that report still observes CPU limiting
48–55% and 8,378.75–8,453.50MiB swap used, with no executable-filtered test
Node/sidecar/sample left running. Application helper counts are not proof of
the cause or permission to terminate user applications. Frozen artifacts and
the original deadline remain unchanged; no new replay or lifecycle graduation
is claimed while a lower-pressure regression environment is unavailable.

The [initial-CPU100 replay](../reports/2026-09-28-constructor-initial-cpu100-replay.md)
subsequently runs the unchanged original case without caching/preloading/sampling.
It still fails30s at Direct's no-declaration query; a retained server log records
late complete10-location work at30.155s, not client acceptance or exact equality.
Target's preceding constructor queries finish at25.862/26.466s. CPU100 is only
a preflight reading (postflight62%), not a constant controlled condition. Retry
startup receipt remains expensive; this does not graduate reuse or waive gates.

The [Settings isolated-anchor phase profile](../reports/2026-09-26-settings-anchor-compiler-phases.md)
now separates anchor preparation from definition lookup using the existing
default-off trace flag. Three processes confirm two separate Programs on both
first and post-edit references. This supports investigating redundant
preparation, not dropping anchor proof or retaining a verifier. The 43 focused
regressions pass; cold fusion and lifecycle graduation remain open.

The [document-preparation attribution follow-up](../reports/2026-09-26-settings-anchor-document-preparation.md)
preserves full membership preparation and measures it separately from registry
resolution. Settings first/edit medians are 873/14 ms for documents, yet
both misses still create two Programs. This is not authorization to omit
membership or anchor proof; remaining candidate overhead is not pure index
time. Verifier lifecycle and default-off warm reuse remain unchanged.

## Graduation gate for an experiment

The [full-scope unit prototype](../reports/2026-09-26-settings-constructor-conservative-units.md)
changes grouping, not residency: all legal candidates, dependency closure,
sequential transient verification. Unavailable/incomplete graphs retain file
batches. Fixture GREEN does not graduate the flag: Settings graph is unavailable
and its 23-batch misses still fail latency/diagnostic gates.

The [package-closure follow-up](../reports/2026-09-27-settings-local-package-closure.md)
activates 14 transient batches per miss on unchanged Settings. Eleven exact
responses and normal diagnostics pass, but first/edit still take 51/55 seconds
and one closure admits the entire 1,496-member scope (1,348 compiler project
files observed). This does not justify defaulting grouping or Worker reuse,
claiming a 64-file hard bound, or ignoring release latency/memory gates.

The [local-export seed prototype](../reports/2026-09-26-settings-local-export-anchor-seed.md)
adds a separate default-off flag `ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR=1`.
It avoids a standalone anchor Program only for a unique same-file export with
complete matching-generation index identity/support proof. This is discovery,
not a trusted definition: every transient batch must resolve the original
cursor with compiler and match the proposed declaration. Any mismatch discards
all partial work and retries with compiler anchoring. No verifier residency or
cross-Program Symbol is introduced. Six Settings runs preserve all 66 exact
responses; observed first/edit medians fall 37.7%/29.8%, but remain seconds.
Single-symbol three-per-arm evidence does not graduate default use, broader
correctness, P95, 500 ms or the final memory gates.

Require exact Location equality, a statistically meaningful latency gain,
peak RSS no more than 10% above per-batch, and the existing post-eviction
memory gate. Any retention trend reverts to the transient default.

## 2026-10-03: re-export discovery seed, not verifier reuse

The [public RED/GREEN](../tdd/references-reexport-anchor-seed.md) and
[six-process Settings/API24 A/B](../reports/2026-10-03-settings-reexport-anchor-seed.md)
identify a named re-export cursor for which the direct index proof is
`unsupported`. An opt-in, unaliased single-line class-export **seed** avoids
the separate anchor Program; each final transient batch still resolves the
original cursor and rejects a wrong target before returning any Locations.
Three runs per arm preserve the nine exact Locations and show 7.184→4.456 s
request medians; product RSS peak medians are 617.2→605.6 MB. This small,
trace-on, one-symbol experiment neither supersedes per-batch Worker ownership
nor proves the 500 ms, P95, edited-overlay, PSS or release-memory gates.
`ARKTS_REFERENCES_REEXPORT_ANCHOR_SEED` therefore stays **default off**.
The follow-up public declaration/edit/cancel transcripts and one Settings
ten-repeat-plus-unsaved-comment pair preserve exact Locations and transient
batch proof, including post-edit cache invalidation. They do not change this
ADR's Worker lifecycle decision or the unpassed release gates.
