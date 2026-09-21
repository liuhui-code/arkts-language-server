# References / semantic Feature Ledger

Status as of baseline `349b3abe`. Priority is product priority, not a claim of
completion. An item is complete only after its linked gate passes; see the
[execution plan](2026-09-20-references-latency-execution-plan.md).

| ID | Priority | Feature | State | Dependency and observable exit |
| --- | --- | --- | --- | --- |
| R-01 | Must | Phase-level semantic tracing | Implemented: batch timeline, queue/candidate/anchor correlation and opt-in compiler `getProgram` / `createProgram` / `getTypeChecker` split | Real-LSP exactness GREEN; external trace-off RSS and fixed real-project benchmark belong to R-02 |
| R-02 | Must | Fixed manifests and exact oracle | In progress: pinned Settings checkout declares compile 23 and uses selected API 24. Its same-SDK 248-Location oracle and manifest passed three independent cold processes per legacy/batched/indexed strategy plus three 11-request indexed series; API 23 is not a blocker for this performance track | [Settings evidence](../reports/2026-09-21-settings-api24-benchmark.md): add second real symbol and no-declaration oracle, investigate 18 diagnostic errors, grow randomized sample; retain separate matched-SDK/cross-version gate |
| R-03 | Must | Budget-aware hot context retention | Feature-gated experiment GREEN; `dispose` remains default pending multi-run graduation | Real LSP proves 1→1 resident retention and exact post-reference definition; Settings single-run peak is non-blocking evidence only |
| R-04 | Must | Complete-result cache v1 | Implemented: pre-index bounded cache, complete results only, conservative overlay/config/workspace invalidation | Real LSP reuse and mutation tests GREEN; Settings/API-24 27-hit median 61 ms, but three diagnostic-quiescence-correlated hits took 1.96–1.99 s; 200/500 ms tail goals remain open |
| R-05 | Must | In-flight coalescing | Implemented | Real LSP proves one verification, independent client cancellation, shared ContentModified invalidation, and no cross-version join |
| R-06 | Must | Interactive/global lanes | Implemented for references, not diagnostic quiescence | Real LSP proves definition/hover bypass delayed references and correct mutation freshness; Settings cache hits still wait behind an already-started diagnostic, so hot-tail scheduling needs a new RED transcript |
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
