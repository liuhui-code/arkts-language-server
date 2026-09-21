# References / semantic Feature Ledger

Status as of baseline `349b3abe`. Priority is product priority, not a claim of
completion. An item is complete only after its linked gate passes; see the
[execution plan](2026-09-20-references-latency-execution-plan.md).

| ID | Priority | Feature | State | Dependency and observable exit |
| --- | --- | --- | --- | --- |
| R-01 | Must | Phase-level semantic tracing | Implemented: batch timeline, queue/candidate/anchor correlation and opt-in compiler `getProgram` / `createProgram` / `getTypeChecker` split | Real-LSP exactness GREEN; external trace-off RSS and fixed real-project benchmark belong to R-02 |
| R-02 | Must | Fixed manifests and exact oracle | In progress: pinned Settings checkout declares compile 23 and uses selected API 24. Its same-SDK 248-Location `MenuController` oracle passed three independent cold processes per legacy/batched/indexed strategy plus six 11-request indexed series across pre/post F6b builds. Real-LSP RED/GREEN fixed missing standard-library assets and default DOM collision; focused installed-artifact acceptance passed 9/9. Three fresh no-DOM `MenuController` replays retained 248/248 exact Locations; the third passed refreshed SDK/runtime-asset manifest preflight, with 6,226 ms cold request and 645,877,760-byte peak product RSS. Asset/Worker digest CLI suite passed 10/10. A second `HomeInitData` oracle with `includeDeclaration=false` passed 9/9 exact Locations in single fresh legacy, indexed and pinned-indexed runs. API 23 is not a blocker for this performance track | [Settings baseline](../reports/2026-09-21-settings-api24-benchmark.md), [F6b runs](../reports/2026-09-21-settings-api24-diagnostic-cache.md), [R-02 report](../reports/2026-09-21-settings-api24-standard-library.md): expand randomized samples and declaration variants, run Windows, triage TS 2307; retain separate matched-SDK/DevEco gate |
| R-03 | Must | Budget-aware hot context retention | Feature-gated experiment GREEN; `dispose` remains default pending multi-run graduation | Real LSP proves 1→1 resident retention and exact post-reference definition; Settings single-run peak is non-blocking evidence only |
| R-04 | Must | Complete-result cache v1 | Implemented: pre-index bounded cache, complete results only, conservative overlay/config/workspace invalidation; F6b moves proven hits ahead of diagnostic quiescence | Real LSP RED/GREEN and three same-build Settings/API-24 mode-C runs: 27 hits, median 67 ms, observed P95 96 ms, max 100 ms, all exact. Larger release samples and mutation/SDK matrix remain open; [F6b report](../reports/2026-09-21-settings-api24-diagnostic-cache.md) |
| R-05 | Must | In-flight coalescing | Implemented | Real LSP proves one verification, independent client cancellation, shared ContentModified invalidation, and no cross-version join |
| R-06 | Must | Interactive/global lanes | Implemented for references; F6b lets complete cache hits bypass diagnostic quiescence, not misses | Real LSP proves definition/hover bypass delayed references and correct mutation freshness; F6b RED/GREEN proves cached references finish before a held diagnostic settles while versioned diagnostics still publish. Cold/miss latency and wider release sampling remain open |
| R-07 | Must | Index trust/fallback integrity | State-race guard implemented; broader stale/ambiguous/overlay matrix remains open | A real-LSP regression proves both candidate-anchor paths fall back to complete semantics when the sidecar changes from ready to warming after serving candidates; see [RED/GREEN](../tdd/references-index-state-race.md) |
| R-08 | Must | Index resync recovery | Implemented | Real LSP proves mutation → safe legacy fallback → committed generation advance → indexed recovery with exact Locations |
| R-09 | Should | Resident full-scope references fast-path | Research | R-03; explicit coverage equality and exact diff |
| R-10 | Should | Anchor reuse/fusion | Research | R-01/R-02; fewer Program builds without result or peak regression |
| R-11 | Should | Worker-shell reuse spike | Experimental only | R-01/R-02; meaningful latency gain, peak ≤ per-batch ×1.10 |
| R-12 | Should | Memory hysteresis | Implemented | L3 remains active until RSS falls below the configured target; coordinator and production-worker regressions GREEN |
| R-13 | Could | Fine-grained cache invalidation | Deferred | R-04 plus complete dependency proof and mutation matrix |
| R-14 | Could | Compiler-derived persisted references | Deferred | Stable validity/version schema; compiler remains semantic authority |
| R-15 | Could | Extend global lanes to other capabilities | Deferred | References scheduler correctness first; one capability per vertical slice |
| R-16 | Won't | Second ArkTS TypeChecker | Rejected | Rust index must not become semantic truth |
| R-17 | Won't | Identity as production default now | Rejected pending proof | Known SDK-import false negative |
| R-18 | Won't | Multiple full-Program Workers | Rejected | Duplicates SDK/Program memory; global concurrency stays one |
| R-19 | Won't | File-count-only memory model | Rejected | Use measured RSS/PSS and Program closure, not linear extrapolation |

The first implementation checkpoint is R-01. Settings/API-24 compatibility
runs are valid for pinned, same-SDK strategy comparisons and performance
investigation; they cannot mark a matched API-23 or diagnostic-equivalence
gate complete. Do not pause this track solely because API 23 is unavailable.
