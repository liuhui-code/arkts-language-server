# References / semantic Feature Ledger

Status as of baseline `349b3abe`. Priority is product priority, not a claim of
completion. An item is complete only after its linked gate passes; see the
[execution plan](2026-09-20-references-latency-execution-plan.md).

| ID | Priority | Feature | State | Dependency and observable exit |
| --- | --- | --- | --- | --- |
| R-01 | Must | Phase-level semantic tracing | Implemented: batch timeline, queue/candidate/anchor correlation and opt-in compiler `getProgram` / `createProgram` / `getTypeChecker` split | Real-LSP exactness GREEN; external trace-off RSS and fixed real-project benchmark belong to R-02 |
| R-02 | Must | Fixed manifests and exact oracle | In progress: Photos/API-24 is smoke evidence; Settings 6.1-LTS is primary. An explicitly cross-SDK API-24 Settings probe passed a 248-Location legacy/indexed differential and 11 indexed requests, but the matched API-23 SDK and independent oracle are still missing | Three legacy Photos mode-C processes returned exact references but no automatic diagnostics; isolate this failure, then obtain matched-SDK Settings cold/hot series and multiple symbols |
| R-03 | Must | Budget-aware hot context retention | Proposed | R-01/R-02; exact A/B, no peak or post-eviction regression |
| R-04 | Must | Complete-result cache v1 | Implemented: pre-index bounded cache, complete results only, conservative overlay/config/workspace invalidation | Real LSP reuse and mutation tests GREEN; Settings API-24 hot median 65 ms with zero candidate/verifier work on hit |
| R-05 | Must | In-flight coalescing | Blocked on R-06 snapshot/freshness ownership: current public lane supersedes the first identical request before semantic dispatch | R-04/R-06; one verification, independent waiter cancellation without weakening ContentModified |
| R-06 | Must | Interactive/global lanes | Proposed | Versioned snapshot contract; interactive request finishes during references |
| R-07 | Must | Index trust/fallback integrity | Existing, extend | Stale/ambiguous/overlay differential remains fail conservative |
| R-08 | Must | Index resync recovery | Proposed | R-07; mutation → safe fallback → committed generation → indexed |
| R-09 | Should | Resident full-scope references fast-path | Research | R-03; explicit coverage equality and exact diff |
| R-10 | Should | Anchor reuse/fusion | Research | R-01/R-02; fewer Program builds without result or peak regression |
| R-11 | Should | Worker-shell reuse spike | Experimental only | R-01/R-02; meaningful latency gain, peak ≤ per-batch ×1.10 |
| R-12 | Should | Memory hysteresis | Proposed | R-03; L3 target used, no evict/rebuild oscillation |
| R-13 | Could | Fine-grained cache invalidation | Deferred | R-04 plus complete dependency proof and mutation matrix |
| R-14 | Could | Compiler-derived persisted references | Deferred | Stable validity/version schema; compiler remains semantic authority |
| R-15 | Could | Extend global lanes to other capabilities | Deferred | References scheduler correctness first; one capability per vertical slice |
| R-16 | Won't | Second ArkTS TypeChecker | Rejected | Rust index must not become semantic truth |
| R-17 | Won't | Identity as production default now | Rejected pending proof | Known SDK-import false negative |
| R-18 | Won't | Multiple full-Program Workers | Rejected | Duplicates SDK/Program memory; global concurrency stays one |
| R-19 | Won't | File-count-only memory model | Rejected | Use measured RSS/PSS and Program closure, not linear extrapolation |

The first implementation checkpoint is R-01. R-02 may expose unavailable
target SDKs; that is a recorded formal-gate blocker. Cross-SDK probes may be
useful when explicitly labelled, but cannot mark a matched benchmark complete.
