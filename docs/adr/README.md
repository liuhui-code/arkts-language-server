# References / semantic architecture decisions

These records separate accepted production invariants, user-confirmed requirements,
and proposed latency work. The [semantic-ready execution plan](../plans/2026-09-29-semantic-ready-execution-plan.md)
tracks the new sequence; the [references latency plan](../plans/2026-09-20-references-latency-execution-plan.md)
retains implementation history. An accepted design or documented requirement is
not a passed product benchmark.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-reference-search-default.md) | Accepted, release-gated | Indexed batching with closure remains the default |
| [0002](0002-hot-semantic-context-lifecycle.md) | Retention/R-09 implemented default-off; hysteresis implemented; graduation open | Budget-aware retention and resident admission remain opt-in |
| [0003](0003-reference-verifier-worker-lifecycle.md) | Accepted | Keep transient per-batch verifiers |
| [0004](0004-reference-result-cache-validity.md) | Accepted and implemented | Cache only complete compiler-verified results |
| [0005](0005-index-proof-trust-boundary.md) | Accepted | Index plans; compiler proves |
| [0006](0006-semantic-request-scheduling.md) | Accepted and implemented for references | Separate interactive and global work without weakening freshness |
| [0007](0007-semantic-readiness-and-500ms-slo.md) | Requirement-confirmed; documentation only | Initial preparation separate; complete post-ready responses P95 ≤500 ms |
| [0008](0008-compiler-derived-semantic-facts.md) | Proposed; falsifiable S02 gate | Compiler-derived projections, separately proven per query-kind |
| [0009](0009-semantic-generation-and-publication.md) | Proposed; requires S02 equivalence | Valid input identity and atomic semantic publication |
| [0010](0010-incremental-invalidation-and-overlays.md) | Proposed; scoped S07 gate | Conservative incremental invalidation with authoritative overlays |
| [0011](0011-budgeted-preparation-and-session-reuse.md) | Proposed; preserves ADR 0003 | Preparation and proven session reuse share one resource budget |
| [0012](0012-query-routing-and-fallback.md) | Proposed; per-capability graduation | Reuse existing routing and scheduling with complete fallback |
| [0013](0013-evidence-and-release-gates.md) | Proposed; acceptance work remains | Separate evidence tiers and retain all original release gates |

Invariant for every decision: **global semantic scope remains complete while
compiler residency is bounded**. Reducing a compiler working set must never
silently reduce the legal reference scope.

## Relationships and adoption

ADR 0001–0006 retain their decisions and dated evidence. New records do not
supersede them by implication:

| Existing decision | Relation to semantic-ready proposals |
| --- | --- |
| 0001 default strategy | 0012 may change only graduated capability routes through explicit supersession; current `indexed-batched + closure + full SDK`, `dispose` and transient defaults remain |
| 0002 retention and R-09 | 0011 extends experimental gates; R-09 is implemented default-off, and Settings L3 admission failed, not an unimplemented research item |
| 0003 transient verifier | 0011/S05 may test reuse after S01; no lifetime change before correctness, memory and lifecycle review |
| 0004 complete-result cache | 0008/0009 propose separate artifacts requiring S02 proof; keep bounded cache/coalescing and conservative invalidation until 0010 proves smaller scopes |
| 0005 compiler proof/index recovery | 0008/0009 reuse valid compiler facts; lexical candidates and candidate-ready generations remain insufficient for final semantics |
| 0006 references lanes | 0012 reuses lanes, cancellation and revision fences; extend only through a second real capability transcript |

S00 records 0007's supplied requirement and lands 0008–0013 as Proposed.
S02 non-equivalence blocks production facts/schema and dependent publication/routing;
S05 can continue independently after S01. Stage validation applies only to its
tested scope, and neither that validation nor ADR adoption graduates 500 ms or
the original >3 GB, 50% memory and DevEco/PSS gates.

Scope and implementation boundaries are in the [product contract](../plans/semantic-ready/product-contract.md)
and [design contracts](../plans/semantic-ready/design-contracts.md); evidence is
governed by [semantic-ready acceptance](../benchmarks/semantic-ready-acceptance.md).
The [Ledger](../plans/references-feature-ledger.md) and [MoSCoW](../plans/references-moscow.md)
hold current feature status and priority. Stage IDs refer to the local execution
plan, not existing GitHub issue numbers.
