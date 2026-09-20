# References / semantic architecture decisions

These records separate accepted production invariants from proposed latency work.
The [execution plan](../plans/2026-09-20-references-latency-execution-plan.md)
tracks implementation and gates; an ADR's acceptance does not mean its product
benchmark has passed.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-reference-search-default.md) | Accepted, release-gated | Indexed batching with closure remains the default |
| [0002](0002-hot-semantic-context-lifecycle.md) | Proposed | Replace unconditional disposal with budget-aware retention |
| [0003](0003-reference-verifier-worker-lifecycle.md) | Accepted | Keep transient per-batch verifiers |
| [0004](0004-reference-result-cache-validity.md) | Proposed | Cache only complete compiler-verified results |
| [0005](0005-index-proof-trust-boundary.md) | Accepted | Index plans; compiler proves |
| [0006](0006-semantic-request-scheduling.md) | Proposed | Separate interactive and global work without weakening freshness |

Invariant for every decision: **global semantic scope remains complete while
compiler residency is bounded**. Reducing a compiler working set must never
silently reduce the legal reference scope.
