# References / semantic latency execution plan

Status: **active successor for latency work**, 2026-09-20. Parent revision:
`349b3abe2e4ff35e00d3cead7f7c766fd981b49f`. The
[bounded references plan](2026-09-10-bounded-references-execution-plan.md)
remains the evidence record and authority for its unfinished original >3 GB
reproducer and final memory gate. This plan does not mark either complete.

Source: user-supplied `deep-research-report.md`, checked against current `main`.
The [ADR index](../adr/README.md), [Feature Ledger](references-feature-ledger.md)
and [MoSCoW](references-moscow.md) are the compact decision and status views.

## Product invariant and baseline

Global semantic scope remains complete; compiler residency is bounded.
`ohos-typescript` is the final semantic authority. Production continues to use
`indexed-batched + closure + full SDK`; `identity` is experimental and `legacy`
is the exactness oracle/safe override. A fixed Photos paired run returned three
equal Locations and 62 diagnostics with peak RSS 885,006,336 → 670,273,536
bytes but duration 7.857 → 8.729 s. This is one A/B, not a release result
([evidence](../reports/2026-09-20-default-indexed-references-rollout.md)).

Current code still disposes the resident context before batching, uses a
transient Worker per batch and serializes the persistent semantic Worker through
one Promise queue. Cold profiling attributes 85.9–91.5% to Program/Checker
preparation, while `findReferences` took about 33–51 ms on three fixed real
projects ([R1](../reports/2026-09-11-bounded-references-r1.md)). Those data
motivate measurement and reuse, not an unconditional long-lived verifier.

## Ordered vertical slices

Each slice starts with a RED public-boundary test and records its parent
revision. Do not advance its dependent slice until correctness and memory
checks are GREEN. Keep opt-in behavior until the stated graduation gate passes.

| Slice | Delivery | Exit / stop condition |
| --- | --- | --- |
| F0 Decision baseline | Six ADRs, this plan, Ledger, MoSCoW; mark existing vs proposed | All links resolve; baseline and unfinished gates explicit |
| F1 Phase trace | Extend existing references trace with queue, anchor, index, plan, worker, compiler preparation/query and merge phases; no source text/absolute paths | Default-off, monotonic timeline from a real LSP replay; no result change |
| F2 Fixed benchmark | Extend `replay-references.mjs`, not a second protocol runner; manifest pins repo/SDK/server, independent RSS sampler, normalized exact Location oracle | Missing SDK or unverified symbol is SKIP/BLOCKED, never a fabricated PASS |
| F3 Exact result cache | Bounded in-memory cache of complete compiler results, root-wide invalidation; add coalescing only after cache freshness tests | Repeat has exact URI/range set and no verifier; edit/project/SDK/overlay changes miss; cancellation independent |
| F4 Hot context A/B | Feature-gated budget-aware retention replacing unconditional disposal | Same-snapshot reuse plus exactness; combined Node RSS/PSS and post-eviction gates pass or revert |
| F5 Index recovery | After mutation, safe fallback until a committed matching generation is ready, then resume indexed path | Mutation → fallback → committed catch-up → indexed real LSP transcript |
| F6 Scheduling | Versioned global snapshot releases persistent queue; interactive lane stays responsive | Concurrent references/edit/definition transcript proves freshness and no head-of-line blocking |
| F6b Diagnostic interference | Preserve automatic diagnostics but let a proven complete cache hit avoid waiting for unrelated diagnostic quiescence; retain the safe memory barrier on cache miss | RED/GREEN framed-LSP transcript: diagnostic in progress, cached references completes within target, diagnostics still publishes, no stale result or second heavy Program |
| F7 Experimental reductions | Anchor reuse, scoped resident fast-path, Worker-shell reuse only with separate A/B | No false negatives, memory regression or retention; otherwise do not graduate |

F1 is the first implementation slice after these documents. F3 and F4 are
separate A/B changes so their benefits and memory costs can be attributed.
F6 cannot precede its mutation/snapshot test. Do not generalize to rename,
implementations or call hierarchy before references is stable.

F1 first vertical slice: [real-LSP RED/GREEN](../tdd/references-phase-trace.md)
now records plan/batch/merge and Worker host-prepare/Program-ready/query time.
The [compiler phase slice](../tdd/references-compiler-phase-trace.md) now
separates Language Service `getProgram()`, the pinned OpenHarmony compiler's
`createProgram` event, and `Program.getTypeChecker()` from SourceFile
statistics. This is opt-in: upstream trace collection adds overhead and must
not be used as the trace-off product latency or RSS result.
The second [queue/candidate-selection slice](../tdd/references-queue-index-trace.md)
records serial queue wait and the inclusive index/optional-anchor selection
duration. The [request-correlation slice](../tdd/references-trace-correlation.md)
adds a default-off ID across candidate selection, isolated anchor, queue,
plan, batch and merge events. F1 instrumentation is complete for batched
references; F2 must now fix real-project manifests and exact oracles before
performance claims or later optimization graduation.

F2 has one pinned Photos/API-24 symbol with separate workspace-relative exact
oracles for both `includeDeclaration` settings. The
[F2 evidence](../reports/2026-09-21-references-f2-photos-baseline.md)
contains three independent cold runs per A/B/C strategy, one indexed-batched
ten-repeat-plus-edit run, and a strict legacy/indexed differential without
the declaration. A completion/definition-warmed A/B returned exact results
but showed 228 ms legacy versus 8,908 ms indexed references in single runs;
the latter whole-run peak also rose to 1,260,650,496 bytes. This is still a
smoke baseline, not F2 graduation: three independent legacy mode-C processes
returned exact references but did not observe automatic diagnostics,
and further verified symbols/projects, hot series and randomized release
samples are outstanding. Per the updated test priority, Settings is now the
primary real-project benchmark target; Photos remains historical F2 smoke
evidence. The clean local Settings 6.1-LTS checkout is
`ecc550dfaed880e04e38a2477eb7235cd50475b9` and declares compile SDK 23.
The SDK inventory on this Mac found DevEco ETS API 24 but no API 23. The
[preflight](../reports/2026-09-21-references-f2-settings-preflight.md)
correctly ruled out calling API 24 an **SDK-matched** run, but matching API 23
is no longer a prerequisite for the Settings performance track. The project
declares compile 23; the selected API 24 and its digest are pinned and labelled
as a compatibility configuration. The first
[exploratory replay](../reports/2026-09-21-settings-api24-exploratory-navigation.md)
returned 248 exact legacy/indexed Locations and a correct cross-module
definition. A subsequent [pinned A/B/C benchmark](../reports/2026-09-21-settings-api24-benchmark.md)
ran three independent cold processes per strategy with the same exact result
and normal diagnostics. It does not prove API-23 or DevEco equivalence, and
the observed diagnostic errors remain a separate correctness gate. Do not
silently relabel the selected SDK or use the proposed master revision
requiring SDK 26.0.1.
Launcher/Contacts are secondary discovery candidates, not substitutes for the
Settings gate.

R-02 diagnostic validity has a separate standard-library delivery slice.
At parent revision `3c0900f`, a real framed-LSP RED showed missing `Object`,
`Array`, `Promise` and `string.includes` from the production bundle, whose
`ohos-typescript` worker had no adjacent default `lib*.d.ts` assets. The
runtime build now delivers the pinned compiler's 70 standard-library files
and the backend explicitly selects non-DOM `lib.es2022.d.ts` after a second
real-LSP RED exposed DOM `Text` collision (TS 2300/2348). The focused public
test and portable installed-artifact acceptance are GREEN (9/9)
([TDD](../tdd/standard-library-delivery.md)). Two fresh Settings/API-24
mode-A replays retained 248/248 exact Locations each; normal diagnostics fell
from 18 to one unresolved `@ohos.systemparameter` (TS 2307). Its correctness is
not validated against DevEco or API 23. Deterministic standard-library and
both Worker-bundle digests, optional manifest mismatch preflight and the full
replay CLI suite are GREEN (10/10). The refreshed `MenuController` manifest
now pins SDK, oracle, entry server, both Workers, standard-library assets and
sidecar; one fresh pinned indexed-batched replay returned 248/248 exact
Locations with 645,877,760-byte product RSS and 6,226 ms request time.
Windows execution and a larger paired performance sample remain open
([report](../reports/2026-09-21-settings-api24-standard-library.md)).
The first full `check:fast` attempt for this delivery passed 949/950; one
five-second correctness-test wait timed out without a Location diff. The
test-only wait adjustment passed its isolated 3/3 run, then the full
`pnpm check:fast` rerun passed **950/950** in 870,262.14 ms. No production
timeout was changed; the separate product latency and memory gates remain open.
R-02 now also has a second real Settings symbol. `HomeInitData` at
`common/src/main/ets/sendable/HomeInitData.ets` (`16:13` zero-based UTF-16)
uses `includeDeclaration=false` and a nine-location compiler oracle. One
fresh legacy process, one indexed-batched process and one indexed-batched
process with a fully pinned SDK/artifact manifest all returned the **same
exact nine Locations**. Their external product RSS peaks were 780,861,440,
555,511,808 and 558,116,864 bytes, respectively. These single runs establish
the second oracle and manifest preflight, not a stable latency/memory benefit;
all three observed cold requests still took over five seconds. They do not
establish API-23 equivalence or complete a release gate
([report](../reports/2026-09-21-settings-api24-standard-library.md)).

The next [fixed Settings/API-24 reference matrix](../reports/2026-09-21-settings-api24-reference-matrix.md)
uses server revision `9cc3768` and the same clean checkout, selected SDK,
compiler assets and sidecar. For `HomeInitData` without declaration, three
new process/index-cold runs per strategy all returned the **same nine exact
Locations** with zero target-file diagnostics. Observed request medians were
8,905 ms `legacy`, 93,179 ms `batched`, and 5,019 ms `indexed-batched`;
median externally sampled product RSS peaks were 784,814,080, 733,638,656
and 558,444,544 bytes, respectively. Pure batching's roughly 10.5× cold
latency confirms why it is not the product default; the indexed result is a
three-run observation, not a stable P95 or release gate. New pinned opposite-
declaration-policy single-run pairs also passed exact differential:
`HomeInitData` with declaration 10/10 and `MenuController` without declaration
247/247. The latter retained one TS 2307 diagnostic. Thus both declaration
policies now have fixed oracles for two real symbols, but F2 remains open:
larger randomized, Windows and final pressure/release evidence is missing;
cold requests are still above the 500 ms navigation target. Three further
independent pinned `HomeInitData` mode-B warmed processes each returned 9/9
exact references; their completion warmup median was 8,613 ms, definition
warmup median 37 ms, references median 4,404 ms and full-run product RSS peak
median 1,136,500,736 bytes. That peak is about 2.04× the mode-A indexed
median, but the workflows differ and the warmed compiler state may contribute;
the completion/definition *contents* were not oracle-checked. One mode-C
repeat/edit process returned all 11 nine-location results exactly: cold first
request 5,018 ms, nine unchanged repeats 2–3 ms each, post-unsaved-comment
version-2 request 3,855 ms. It observed a version-2 diagnostic publication,
not a complete per-version diagnostic sequence. Mode C needs repetition and
edit/freshness coverage before graduation.

The [follow-up Settings `HomeInitData` with-declaration
matrix](../reports/2026-09-21-settings-with-declaration-matrix.md) expands
one opposite-policy pair to three fresh processes per strategy on the same
API-24 compatibility configuration. All nine returned the same ten exact
Locations and zero target-file diagnostics. Observed request medians were
9,030 ms `legacy`, 90,894 ms `batched`, and 5,107 ms `indexed-batched`;
median externally sampled product RSS peaks were 788,803,584, 743,411,712,
and 554,479,616 bytes respectively. The manifest's semantic Worker pin was
updated only after its prior `SEMANTIC_WORKER_MISMATCH` preflight failed. This
adds a second declaration-policy A/B/C smoke matrix, not a stable P95 or an
API-23/DevEco equivalence claim. `MenuController` without declaration and the
release/pressure gates remain under-sampled.

R-10 now has a distinct [fixed Settings usage-site
baseline](../reports/2026-09-21-settings-usage-anchor-baseline.md): six new
processes, three legacy and three indexed-batched, each returned the same nine
exact Locations with normal diagnostics. Indexed-batched's cold median was
7,191 ms versus 8,631 ms legacy; sampled product peak medians were
573,988,864 versus 790,999,040 bytes. Crucially, every indexed usage request
ran a separate 308-SourceFile anchor Program for ~2,053 ms before the
613-SourceFile verifier batch. This is measured duplicate compiler preparation,
not an approved fusion or a claim that the full anchor duration is removable.
R-10 remains experimental until a public-LSP RED/GREEN proves fewer Programs,
exact Locations and no memory/freshness regression. This usage workload is not
pooled with the declaration-position matrix, which has no standalone anchor.

F3 cache v1 is implemented through the semantic proxy, before Rust candidate
selection. A real framed-LSP regression proves one complete miss/store, one
same-snapshot hit with no second candidate selection or verifier batch, and a
fresh miss after an unsaved comment edit. The Settings/API-24 exploratory
mode-C replay returned the same 248 Locations on all 11 requests: requests
2–10 had a 65 ms end-to-end median, while server-side cache work was
0.60–0.90 ms. The edit-warm request correctly rebuilt in about 4.68 s. One hot
request waited about 1.94 s before its 0.78 ms cache hit while SDK/diagnostic
work occupied the serial lane. At that checkpoint R-04 was GREEN while R-05
coalescing and F6 queue isolation remained open. A real-LSP RED showed that the
freshness lane supersedes the first identical concurrent references request
before either request can share semantic work. R-05 therefore moves with the
R-06 snapshot/freshness ownership change; a proxy-local Promise map would not
preserve independent cancellation and `ContentModified` semantics.

F4 has its first feature-gated vertical slice. The `budget-aware` profile
retains a warmed resident context through references under the existing
coordinator and process-memory pressure policy; `dispose` stays the default.
The public test observes resident count 1→1 and an exact definition after the
global query. One Settings/API-24 mode-B run passed with 248 exact Locations
and a 936,415,232-byte process-tree peak, versus 1,063,485,440 bytes in the
older dispose run. Because these are single runs with different executions,
they do not graduate the profile or establish a memory improvement. A newer
[controlled three-versus-three HomeInitData mode-B comparison](../reports/2026-09-21-settings-api24-reference-matrix.md)
on the same fixed Settings/API-24 build returned 9/9 exact Locations in every
process. All retained runs logged resident 1→1 with `removed=false`, while
dispose logged 1→0. `budget-aware` reference median was 4,072 ms versus
4,404 ms with dispose; full-run product RSS peak medians were 1,129,537,536
versus 1,136,500,736 bytes. These small three-run differences do **not**
graduate R-03 or justify changing its default. Both profiles peaked around
1.13 GB; the configured 1,024 MiB semantic budget is a policy threshold, not
a hard Node-process limit. Post-eviction PSS and release-level latency remain
unmeasured, and first references still exceed 500 ms.

An [observation-only F4 trace](../tdd/references-post-retention-memory-trace.md)
adds Node RSS and semantic Worker heap used to trace-gated
`references.batch.start` after the retention decision. In one new real Settings
`HomeInitData` mode-B process, definition completion already showed
730,607,616-byte Node RSS; logical disposal changed resident count 1→0, yet
the pre-verifier batch-start RSS was 733,794,304 bytes. All three exploratory
mode-A/B trace-on/off processes returned the same nine exact Locations and
empty diagnostics ([raw measurements and limits](../reports/2026-09-21-settings-post-retention-memory-trace.md)).
This rules out attributing the entire warmed peak to `findReferences` alone,
but neither proves live double-Program residency nor justifies changing the
default. The follow-up [isolated post-disposal idle
probe](../reports/2026-09-21-settings-disposal-idle-probe.md) compared three
fresh control processes with three fresh processes that waited one second
after disposal and before verifier admission. Every run returned the same nine
exact Locations; none of the three idle windows showed a Node RSS decrease.
This rejects only a **quick natural RSS recovery within one second** for this
workload. It cannot distinguish objects awaiting later GC from retained
compiler state or allocator pages, and is not evidence to change the default.
Post-eviction PSS, a larger randomized sample and the release gates remain open.
A second, explicitly labeled [diagnostic-only GC
probe](../reports/2026-09-21-settings-disposal-gc-probe.md) held the same
one-second pause in both arms and exposed GC to both processes, then called
it only in the copied experimental semantic Worker before verifier admission.
All six further Settings runs returned the same nine exact references. GC
reduced that Worker's used heap from roughly 538–543 MB to 30 MB and whole-Node
RSS immediately by only ~21 MB; the three-run product peak median was
1,100,734,464 B without GC versus 832,151,552 B with it. This supports
collectible post-disposal heap contributing to later peak, not a proven
compiler-object inventory or a production forced-GC policy. SDK digest
preflight, larger samples, post-eviction PSS and the original pressure case
remain open.

F5 is implemented. Watched source/project changes now schedule a fresh catalog
generation; overlapping notifications coalesce into one subsequent catalog
instead of starting concurrent runs. The semantic proxy records the last
accepted generation, forces complete legacy semantics while the workspace is
dirty, and restores indexed batching only after a ready committed generation
advances beyond that baseline. A real framed-LSP regression proves indexed →
mutation → legacy fallback → generation 1→2 → indexed recovery, with exact
Location equality before and after recovery. Unknown/non-advancing generation
continues to fail conservative ([evidence](../tdd/references-index-resync.md)).

F6 is implemented for references. One revision-bound references request may
remain detached while classified interactive methods use the persistent
semantic Worker. Mutations still advance the ordered revision stream and
cancel the old global snapshot as ContentModified; diagnostics and other
global operations are not admitted concurrently. A real framed-LSP transcript
proves definition and hover finish before a deliberately delayed references
verification, their traced queue waits remain below 250 ms, the edit cancels
the old result, and the next definition observes the new revision
([evidence](../tdd/references-scheduling.md)). This established the independent
freshness/cancellation ownership required by the following R-05 slice.

R-05 coalescing is now implemented on top of F6. The LSP request runner keys
identical references by method, URI, workspace, document version, position and
declaration policy, then shares one semantic execution while retaining one
freshness/cancellation handle per client. A real framed-LSP test proves two
waiters produce one verifier result, cancelling one leaves the other complete,
a document edit makes both old waiters ContentModified, and the next version
does not join the aborted operation
([evidence](../tdd/references-coalescing.md)).

F6b is implemented for **complete cache hits**. Its framed-LSP RED reproduced
the diagnostic-quiescence wait; GREEN returns the already-proven result before
suspending diagnostics, while a cache miss retains the quiescence barrier and
the request runner retains freshness/cancellation checks. Automatic versioned
diagnostics still publish ([TDD](../tdd/references-diagnostic-cache.md)). Three
independent same-build Settings/API-24 mode-C runs then returned 248 exact
Locations on every request, with 27 unchanged cached requests at 67 ms median,
96 ms observed nearest-rank P95 and 100 ms maximum. This removes the previously
observed 1.96–1.99 s hot outliers in this small sample and meets the 500 ms
**cached-references** target here; it does not make cold or post-edit misses
sub-500 ms, nor graduate a release P95
([report](../reports/2026-09-21-settings-api24-diagnostic-cache.md)).

R-12 L3 hysteresis is implemented independently of R-03 graduation. Once the
process reaches the 92% emergency threshold, subsequent samples remain L3 at
90% and 85%; the policy exits only below the committed 85% target and then
resumes normal L0–L2 classification. Coordinator/type-engine/production-worker
regressions remain GREEN ([evidence](../tdd/semantic-memory-hysteresis.md)).

R-07's ready-state race guard is implemented for both direct and
definition-anchor candidate paths. A real LSP transcript makes the sidecar
start warming after returning generation-1 candidates while generation 1 stays
committed; indexed narrowing previously omitted a known `Use.ets` reference.
The request now falls back to complete semantics in both paths
([RED/GREEN](../tdd/references-index-state-race.md)). This closes that race,
not the broader stale/ambiguous/overlay matrix or the real-project release
gate.

## Benchmark contract

The [index-cold first-click Settings replay](../reports/2026-09-21-settings-immediate-catalog-replay.md)
adds an explicit `--catalog-state immediate` arm to the existing runner;
`ready` remains its default. At the pinned `HomeInitData` usage position,
indexed-batched planned 23 conservative batches while catalog generation 0
was stale and timed out at 120 seconds after completing only 11. The catalog
became ready about 26.7 seconds after the request started, but the request
did not replan. Two independent initial-index legacy controls returned the
same nine exact Locations in 31.6 and 38.1 seconds, with product-tree peaks
of about 875 and 910 MB. These completed peaks cannot be compared as a
memory win against the timed-out indexed run. The initial-index stale case
is distinct from F5's post-mutation generation recovery and is now an open
R-02/R-07 latency and fallback gate. Any production readiness wait or
replanning requires a cancellable, snapshot-safe real-LSP RED/GREEN and
completed-run RSS comparison; do not silently switch to legacy or call this
one-run observation a release gate.

The [first-catalog wait experiment](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md)
completed narrow RED/GREEN coverage for initial warming, pre-open, cancellation
and a held-status deadline. With the opt-in 60-second wait, three independent
Settings index-cold runs returned exact 9/9 results using one batch at
39.8/50.5/47.5 seconds and 537–560 MB observed product-tree RSS peaks. A
30-second cap missed a catalog that committed just after expiry; another run
exposed the separate pre-open race. This proves startup timing amplification
in this fixed case, not product readiness. The flag remains default-off:
latency and postponed diagnostics miss the interaction gate. Same-build
legacy controls subsequently returned the same nine Locations in 8.6–9.6
seconds at 838–964 MB peak; one default indexed-first request took 90.8
seconds/23 batches. These are small, sequential comparisons, not a default
policy or release P95. The original >3 GB case remains open. Move readiness
off the user click/diagnostic suspension path before considering a default.

A separate [native catalog phase profile](../reports/2026-09-22-settings-catalog-phase-profile.md)
uses default-off sidecar event logging and three fresh Settings caches. Of an
11–13 second catalog, 0.8–1.0 seconds elapsed before `activating` and
10.2–11.9 seconds elapsed before `ready`. A macOS stack sample during this
interval concentrated in SQLite `replace_all`, especially reference-row
writes. This narrows the next performance slice to a controlled write-path
experiment with atomic-generation, exact-query and memory gates. It does not
justify changing the compiler working set or claiming 500 ms navigation.
That [same-build Settings A/B](../reports/2026-09-22-settings-sqlite-batch-rejected.md)
rejected 96-row reference-occurrence insertion: activation median rose from
11,066 to 11,600 ms with no credible RSS benefit and 9/9 exact Locations.
The candidate was removed; the next slice is default-off per-stage SQLite
activation timing before another write-path change.
That [stage profile](../reports/2026-09-22-settings-sqlite-stage-profile.md)
now has three trace-on and three trace-off complete Settings replays, all
exact 9/9. Median SQL replacement time was 10,412 ms: reference-related
insertion 6,118 ms, commit 3,075 ms, index recreation 622 ms. The observer
did not show measurable activation overhead in this three-run control, but
the reference stage still aggregates four kinds of rows. Next partition that
stage and commit/write amplification; no durability or scope change is
authorized by these timings.

Freeze exact repository commit, dirty state, server commit, Node/toolchain,
backend version, project selection, SDK fingerprint, standard-library asset
digest, index schema/generation, query file/symbol/zero-based UTF-16 position
and all `ARKTS_*` overrides. A bundle-only SHA does not identify the effective
compiler library after adjacent `lib*.d.ts` or semantic Worker bundles change.
The runner now records the composite manifest-plus-assets digest and both
Worker-bundle digests, rejecting mismatched optional pins before launch. Its
CLI suite passed 10/10. Both fixed Settings symbols now have pinned manifests
and oracles for both declaration policies. Only one of those four
symbol/policy pairs has this new three-run A/B/C matrix; the others still
require independent samples before a formal paired gate.
Settings is the primary target. Its clean local 6.1-LTS revision declares
compile SDK 23, while this Mac selects API 24; the pinned
[compatibility manifest](../../bench/references/manifests/settings-menucontroller-api24.json)
and [benchmark report](../reports/2026-09-21-settings-api24-benchmark.md)
record both identities. Use that configuration for same-SDK strategy, latency
and memory A/B/C work without waiting for API 23. Never call it an
SDK-matched or cross-version-equivalent benchmark; check diagnostics and
known reference identities separately. A missing exact API-23 installation
blocks only a specifically API-23-matched comparison, not this track. The
source report's master revision requires SDK 26.0.1 and remains a separate
discovery candidate.
An exported class seed is not a golden until compiler results and known real
references are verified. The historical Settings `LogUtil` case is not an
oracle because its legacy response missed known cross-module references.

Run independent `legacy`, `batched`, `indexed-batched` processes on the same
checkout/SDK/server for causal A→B→C comparisons. Keep index-cold
`immediate`, catalog-ready semantic-cold, same-process hot and edit-warm
separate. Normalize each result
to workspace-relative POSIX path plus exact UTF-16 range; sort ordinally,
report missing, extra and duplicate Locations separately. Never lowercase
paths unconditionally. A matching count alone is not equality. Record normal
diagnostics and stale-index fallback events alongside references.

For every run sample the target Node PID externally (50 ms target) and report
process-tree RSS/PSS separately. Worker threads share Node RSS; do not add
their RSS again. Store request median/P95/max, queue wait, phase durations,
Program/project/SDK file counts, candidate/batch counts, cache/context/worker
lifecycle, post-query RSS and complete correctness diff. PR smoke: at least
three cold and ten hot runs; nightly: ten/thirty; graduation: at least thirty
cold (fifty preferred) and one hundred hot. Do not interpret a three-run P95
as a stable tail estimate. Order strategies with a recorded seed.

## Hard gates

1. **Correctness:** zero missing/extra Locations for both
   `includeDeclaration` values; overlays, alias/re-export, same-name,
   SDK-import, stale generation, unavailable source, cancellation and edits
   during a request all fail safe. Never return partial success.
2. **Memory:** retain existing DevEco PSS, unrelated-workspace scaling and
   post-eviction release gates. The original >3 GB reproducer and references
   50% target remain open; no claim of resolution before both pass.
3. **Latency:** measure cold separately from hot. The pre-F6b Settings/API-24
   sample had a 61 ms cached median and 1,983 ms observed P95 across 27
   repeats. The F6b same-build sample had 67 ms median, 96 ms observed P95
   and 100 ms maximum over 27 cached requests, but cold/post-edit requests
   still took 5.4–6.1 s. This is a hot-path smoke result, not proof of the
   user's 500 ms target for every navigation state. Proposed
   product goals are
   hot definition/hover P95 ≤150 ms, cached references P95 ≤200 ms and
   interactive queue wait during references P95 ≤50 ms; these are targets,
   **not current capability claims**. A cold strategy regression requires
   explicit memory trade-off review.
4. **Lifecycle:** cache hit starts zero verifier Workers; a hot context may
   answer global references only with proven full-scope coverage. Global
   verifier concurrency remains one. Trace is default-off and never writes to
   LSP stdout.

If any gate fails, keep the current production default and report the exact
blocking evidence. Do not lower memory thresholds, truncate references, use
an index-only answer, or silently replace the pinned SDK.
