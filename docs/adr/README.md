# References / semantic architecture decisions

These records separate accepted production invariants, user-confirmed requirements,
and experimental latency work. The [budgeted resident-session plan](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
is the **active** L01–L08 implementation sequence. The preceding
[semantic-ready S-series plan](../plans/2026-09-29-semantic-ready-execution-plan.md)
and [references latency plan](../plans/2026-09-20-references-latency-execution-plan.md)
retain implementation and failed-gate history. Acceptance for experimental
implementation is not production graduation or a passed product benchmark.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-reference-search-default.md) | Accepted, release-gated | Indexed batching with closure remains the default |
| [0002](0002-hot-semantic-context-lifecycle.md) | Retention/R-09 implemented default-off; hysteresis implemented; graduation open | Budget-aware retention and resident admission remain opt-in |
| [0003](0003-reference-verifier-worker-lifecycle.md) | Accepted; current production default/fallback | Keep transient per-batch verifiers until an explicit graduated route supersedes a capability |
| [0004](0004-reference-result-cache-validity.md) | Accepted and implemented | Cache only complete compiler-verified results |
| [0005](0005-index-proof-trust-boundary.md) | Accepted | Index plans; compiler proves |
| [0006](0006-semantic-request-scheduling.md) | Accepted and implemented for references | Separate interactive and global work without weakening freshness |
| [0007](0007-semantic-readiness-and-500ms-slo.md) | Requirement-confirmed; documentation only | Initial preparation separate; complete post-ready responses P95 ≤500 ms |
| [0008](0008-compiler-derived-semantic-facts.md) | Research paused after S02 FAIL | Retain v1–v6 evidence; no v7 without a new decision |
| [0009](0009-semantic-generation-and-publication.md) | Proposed; S03 BLOCKED | Facts publication still requires a proven producer |
| [0010](0010-incremental-invalidation-and-overlays.md) | Proposed; scoped S07 gate | Conservative incremental invalidation with authoritative overlays |
| [0011](0011-budgeted-preparation-and-session-reuse.md) | Proposed memory policy; S05 candidate REJECTED | Budget, pressure and eviction; LS lifecycle is owned by 0014 |
| [0012](0012-query-routing-and-fallback.md) | Proposed; L04–L07 per-capability graduation | Reuse existing routing with complete fallback |
| [0013](0013-evidence-and-release-gates.md) | Proposed; acceptance work remains | Separate evidence tiers and retain all original release gates |
| [0014](0014-budgeted-long-lived-semantic-session.md) | Accepted for experiment; production NOT graduated | L01–L08 budgeted long-lived official LS, with existing exact fallback |

Invariant for every decision: **global semantic scope remains complete while
compiler residency is bounded**. Reducing a compiler working set must never
silently reduce the legal reference scope.

## Relationships and adoption

ADR 0001–0006 retain their decisions and dated evidence. New records do not
supersede them by implication:

| Existing decision | Relation to semantic-ready proposals |
| --- | --- |
| 0001 default strategy | 0014/0012 may change only graduated capability routes through explicit supersession; current `indexed-batched + closure + full SDK`, `dispose` and transient defaults remain |
| 0002 retention and R-09 | 0011 owns memory pressure; R-09 remains implemented default-off, and Settings L3 admission failed |
| 0003 transient verifier | 0014 L01–L03 do not change its default; L04 must retain it as exact fallback until correctness, resource and latency review |
| 0004 complete-result cache | Keep bounded complete-answer cache/coalescing and conservative invalidation; paused S02 facts are not a substitute |
| 0005 compiler proof/index recovery | 0014 keeps official compiler authority; lexical candidates and candidate-ready generations remain insufficient for final semantics |
| 0006 references lanes | 0012 reuses lanes, cancellation and revision fences; extend only through a second real capability transcript |

S02 v1–v6 non-equivalence blocks production facts/schema and S03 publication;
that research is paused, not silently converted to L01. S05's compatible-disk
candidate was REJECTED after its own 100-operation Settings gates. ADR 0014
authorizes a **different** falsifiable L01 mechanism while preserving those
decisions. Neither L01 implementation nor ADR adoption graduates 500 ms or the
original >3 GB, 50% memory and DevEco/PSS gates.

Scope and implementation boundaries are in the [product contract](../plans/semantic-ready/product-contract.md)
and [design contracts](../plans/semantic-ready/design-contracts.md); evidence is
governed by [semantic-ready acceptance](../benchmarks/semantic-ready-acceptance.md).
The [Ledger](../plans/references-feature-ledger.md) and [MoSCoW](../plans/references-moscow.md)
hold current feature status and priority. Stage IDs refer to the local execution
plan, not existing GitHub issue numbers.
