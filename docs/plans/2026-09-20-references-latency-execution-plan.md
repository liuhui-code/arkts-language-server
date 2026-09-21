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
The SDK inventory on this Mac found DevEco ETS API 24 but no API 23, so Settings is
`SDK_UNAVAILABLE` for a formal gate until a matching SDK and verified symbol
oracle are available ([preflight](../reports/2026-09-21-references-f2-settings-preflight.md)).
An explicitly labelled [API-24 exploratory replay](../reports/2026-09-21-settings-api24-exploratory-navigation.md)
subsequently returned 248 exact legacy/indexed Locations and a correct
cross-module definition; it does not satisfy the API-23 gate. Do not silently
substitute API 24 or use the proposed master revision requiring SDK 26.0.1.
Launcher/Contacts are secondary discovery candidates, not substitutes for the
Settings gate.

F3 cache v1 is implemented through the semantic proxy, before Rust candidate
selection. A real framed-LSP regression proves one complete miss/store, one
same-snapshot hit with no second candidate selection or verifier batch, and a
fresh miss after an unsaved comment edit. The Settings/API-24 exploratory
mode-C replay returned the same 248 Locations on all 11 requests: requests
2–10 had a 65 ms end-to-end median, while server-side cache work was
0.60–0.90 ms. The edit-warm request correctly rebuilt in about 4.68 s. One hot
request waited about 1.94 s before its 0.78 ms cache hit while SDK/diagnostic
work occupied the serial lane. Therefore R-04 is GREEN, but F3 coalescing
(R-05) and F6 queue isolation remain open. A real-LSP RED showed that today's
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
they do not graduate the profile or establish a memory improvement.

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
([evidence](../tdd/references-scheduling.md)). R-05 coalescing is now unblocked,
but remains a separate slice because identical public requests currently have
independent freshness/cancellation ownership.

## Benchmark contract

Freeze exact repository commit, dirty state, server commit, Node/toolchain,
backend version, project selection, SDK fingerprint, index schema/generation,
query file/symbol/zero-based UTF-16 position and all `ARKTS_*` overrides.
Settings is the primary target, but its local 6.1-LTS revision and the source
report's master revision are **discovery candidates**, not verified oracles.
The former declares compile SDK 23; the latter requires SDK 26.0.1. Neither
may silently run with this Mac's API 24 SDK as a **matched benchmark**.
Explicit API-24 exploratory runs are allowed and separately labelled, as in
the Settings report above. Report `SDK_UNAVAILABLE` for the formal gate until
a matching SDK exists, then freeze that exact revision and SDK identity.
An exported class seed is not a golden until compiler results and known real
references are verified. The historical Settings `LogUtil` case is not an
oracle because its legacy response missed known cross-module references.

Run independent `legacy`, `batched`, `indexed-batched` processes on the same
checkout/SDK/server for causal A→B→C comparisons. Keep index-cold,
semantic-cold, same-process hot and edit-warm separate. Normalize each result
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
3. **Latency:** measure cold separately from hot. Proposed product goals are
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
