# References / semantic Feature Ledger

Status as of baseline `349b3abe`. Priority is product priority, not a claim of
completion. An item is complete only after its linked gate passes; see the
[execution plan](2026-09-20-references-latency-execution-plan.md).

| ID | Priority | Feature | State | Dependency and observable exit |
| --- | --- | --- | --- | --- |
| R-01 | Must | Phase-level semantic tracing | Implemented: batch timeline, queue/candidate/anchor correlation and opt-in compiler `getProgram` / `createProgram` / `getTypeChecker` split | Real-LSP exactness GREEN; external trace-off RSS and fixed real-project benchmark belong to R-02 |
| R-02 | Must | Fixed manifests and exact oracle | In progress: Settings declares compile API 23; selected API 24 is pinned for same-SDK compatibility A/B/C, not SDK equivalence. Standard-library delivery and runtime-asset preflight passed. `HomeInitData` now has three fresh process/index-cold runs per strategy for both declaration settings: all 9/9 without declaration and 10/10 with declaration were exact, with zero target-file diagnostics. With-declaration request medians: legacy 9,030 ms, pure batched 90,894 ms, indexed-batched 5,107 ms; product RSS peak medians: 788,803,584, 743,411,712 and 554,479,616 bytes. `MenuController` has pinned 248/247-location oracles for both settings but only single-run opposite-policy evidence and one unresolved TS 2307 diagnostic. No cold result met 500 ms | [Original Settings matrix](../reports/2026-09-21-settings-api24-reference-matrix.md), [with-declaration matrix](../reports/2026-09-21-settings-with-declaration-matrix.md), [standard-library report](../reports/2026-09-21-settings-api24-standard-library.md): expand randomized/mode-C samples, edit diagnostic/freshness coverage, native Windows, diagnostic triage, original >3 GB and final 50%/PSS release gates. Retain separate matched-API-23/DevEco gate |
| R-03 | Must | Budget-aware hot context retention | Feature-gated experiment and three-versus-three real Settings mode-B A/B GREEN for exactness, not graduated; `dispose` remains default. New trace-gated batch-start RSS/heap instrumentation passed its public LSP test | `HomeInitData` 9/9 each run; retained events 1→1/`removed=false` versus dispose 1→0. Observed reference medians 4,072 versus 4,404 ms, full-run product peak medians 1,129,537,536 versus 1,136,500,736 bytes: small differences, both near 1.13 GB. One warmed trace-on `dispose` run still had 733,794,304 B Node RSS before verifier admission after resident 1→0. A subsequent isolated three-control/three-probe replay found no Node RSS decrease during any one-second no-forced-GC pause after disposal. This does not prove live double Program, a leak, or retention benefit. Next: larger randomized sample, post-eviction PSS and ≤500 ms progress. The 1,024 MiB budget is not a hard process cap. [Matrix](../reports/2026-09-21-settings-api24-reference-matrix.md), [phase report](../reports/2026-09-21-settings-post-retention-memory-trace.md), [idle probe](../reports/2026-09-21-settings-disposal-idle-probe.md) |
| R-04 | Must | Complete-result cache v1 | Implemented: pre-index bounded cache, complete results only, conservative overlay/config/workspace invalidation; F6b moves proven hits ahead of diagnostic quiescence | Real LSP RED/GREEN and three same-build Settings/API-24 mode-C runs: 27 hits, median 67 ms, observed P95 96 ms, max 100 ms, all exact. Larger release samples and mutation/SDK matrix remain open; [F6b report](../reports/2026-09-21-settings-api24-diagnostic-cache.md) |
| R-05 | Must | In-flight coalescing | Implemented | Real LSP proves one verification, independent client cancellation, shared ContentModified invalidation, and no cross-version join |
| R-06 | Must | Interactive/global lanes | Implemented for references; F6b lets complete cache hits bypass diagnostic quiescence, not misses | Real LSP proves definition/hover bypass delayed references and correct mutation freshness; F6b RED/GREEN proves cached references finish before a held diagnostic settles while versioned diagnostics still publish. Cold/miss latency and wider release sampling remain open |
| R-07 | Must | Index trust/fallback integrity | State-race guard implemented; broader stale/ambiguous/overlay matrix remains open | A real-LSP regression proves both candidate-anchor paths fall back to complete semantics when the sidecar changes from ready to warming after serving candidates; see [RED/GREEN](../tdd/references-index-state-race.md) |
| R-08 | Must | Index resync recovery | Implemented | Real LSP proves mutation → safe legacy fallback → committed generation advance → indexed recovery with exact Locations |
| R-09 | Should | Resident full-scope references fast-path | Research | R-03; explicit coverage equality and exact diff |
| R-10 | Should | Anchor reuse/fusion | Real Settings usage-site baseline pinned; no implementation | [Six-run trace](../reports/2026-09-21-settings-usage-anchor-baseline.md): all 9/9 exact; indexed median 7,191 ms includes a separate ~2,053 ms anchor Program (308 SourceFiles) before a ~3,150 ms batch Program (613 SourceFiles). Next RED must preserve exactness while reducing Program builds, then compare RSS/overlay/re-export/freshness before graduation |
| R-11 | Should | Worker-shell reuse spike | Experimental only | R-01/R-02; meaningful latency gain, peak ≤ per-batch ×1.10 |
| R-12 | Should | Memory hysteresis | Implemented | L3 remains active until RSS falls below the configured target; coordinator and production-worker regressions GREEN |
| R-13 | Could | Fine-grained cache invalidation | Deferred | R-04 plus complete dependency proof and mutation matrix |
| R-14 | Could | Compiler-derived persisted references | Deferred | Stable validity/version schema; compiler remains semantic authority |
| R-15 | Could | Extend global lanes to other capabilities | Deferred | References scheduler correctness first; one capability per vertical slice |
| R-16 | Won't | Second ArkTS TypeChecker | Rejected | Rust index must not become semantic truth |
| R-17 | Won't | Identity as production default now | Rejected pending proof | Known SDK-import false negative |
| R-18 | Won't | Multiple full-Program Workers | Rejected | Duplicates SDK/Program memory; global concurrency stays one |
| R-19 | Won't | File-count-only memory model | Rejected | Use measured RSS/PSS and Program closure, not linear extrapolation |

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

R-03 follow-up: an [isolated explicit-GC diagnostic](../reports/2026-09-21-settings-disposal-gc-probe.md)
replayed three fresh Settings processes per arm after the no-forced-GC idle
check. All six returned the same nine exact references. A GC call in the
copied semantic Worker reclaimed roughly 0.51 GB of its used heap after
logical disposal, while whole-Node RSS immediately fell only ~21 MB; later
product peak RSS medians were 1,100,734,464 B without the call and
832,151,552 B with it. This is evidence of collectible post-disposal heap,
**not** a passed release gate or authorization to force GC in production.
R-03 remains feature-gated with `dispose` default.

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
