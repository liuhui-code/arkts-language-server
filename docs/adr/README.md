# References / semantic architecture decisions

These records separate accepted production invariants, user-confirmed requirements,
and experimental latency work. The [budgeted resident-session plan](../plans/2026-10-06-budgeted-resident-semantic-plan.md)
is the **active** L01–L08 implementation sequence. The preceding
[semantic-ready S-series plan](../plans/2026-09-29-semantic-ready-execution-plan.md)
and [references latency plan](../plans/2026-09-20-references-latency-execution-plan.md)
retain implementation and failed-gate history. Acceptance for experimental
implementation is not production graduation or a passed product benchmark.
2026-10-08 progression update: final product validation is at L08. Final memory,
latency, overall readiness, long-soak, scale and portability targets do not block
L01–L07 implementation; each slice retains public correctness and execution
protection checks. Earlier L01/L02 resource-admission verdicts are historical.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-reference-search-default.md) | Accepted, release-gated | Indexed batching with closure remains the default |
| [0002](0002-hot-semantic-context-lifecycle.md) | Retention/R-09 implemented default-off; hysteresis implemented; graduation open | Budget-aware retention and resident admission remain opt-in |
| [0003](0003-reference-verifier-worker-lifecycle.md) | Accepted; Worker lifetime superseded by 0016 | Keep serial per-job project verifiers; retain current SDK syntax in one Worker |
| [0004](0004-reference-result-cache-validity.md) | Accepted and implemented | Cache only complete compiler-verified results |
| [0005](0005-index-proof-trust-boundary.md) | Accepted | Index plans; compiler proves |
| [0006](0006-semantic-request-scheduling.md) | Accepted and implemented for references | Separate interactive and global work without weakening freshness |
| [0007](0007-semantic-readiness-and-500ms-slo.md) | Requirement-confirmed; documentation only | Initial preparation separate; complete post-ready responses P95 ≤500 ms |
| [0008](0008-compiler-derived-semantic-facts.md) | Research paused after S02 FAIL | Retain v1–v6 evidence; no v7 without a new decision |
| [0009](0009-semantic-generation-and-publication.md) | Proposed; S03 BLOCKED | Facts publication still requires a proven producer |
| [0010](0010-incremental-invalidation-and-overlays.md) | Proposed; scoped S07 gate | Conservative incremental invalidation with authoritative overlays |
| [0011](0011-budgeted-preparation-and-session-reuse.md) | Proposed memory policy; S05 candidate REJECTED | Budget, pressure and eviction; LS lifecycle is owned by 0014 |
| [0012](0012-query-routing-and-fallback.md) | Proposed; L04–L07 stages verified, final promotion at L08 | Reuse existing routing with complete fallback; experiments default-off |
| [0013](0013-evidence-and-release-gates.md) | Proposed; acceptance work remains | Separate evidence tiers and retain all original release gates |
| [0014](0014-budgeted-long-lived-semantic-session.md) | Accepted for experiment; production NOT graduated | L01–L08 budgeted long-lived official LS, with existing exact fallback |
| [0015](0015-default-resident-optimization-policy.md) | Accepted by explicit maintainer decision; L08 gates open | Six optimizations default ON with rollback; merge via PR after full regression |
| [0016](0016-reference-verifier-sdk-cache.md) | Accepted and implemented; full fast 1,869/1,869 PASS | One serial verifier Worker retains current SDK ASTs; each job disposes project LS/Program |
| [0017](0017-reference-shared-inputs-and-search.md) | Accepted and implemented; full fast 1,872/1,872 PASS; 500ms FAIL | Reuse standard-library syntax, witnessed SDK lookups and classified complete reference searches |
| [0018](0018-semantic-groups-and-initial-preparation.md) | Accepted; implementation in progress | 4GiB configurable runtime pressure; initial preparation exempt; shared SDK initialization, stable semantic groups and delayed release |
| [0019](0019-stable-programs-and-request-inputs.md) | Accepted; implementation and comparison IN_PROGRESS | Pressure-managed retained Programs, scoped coverage, shared request inputs and 1024-root fallback soft target |
| [0020](0020-failed-semantic-build-recovery.md) | Implemented in working tree; fast 1,969/1,969 and Windows recovery 15/15 PASS; synchronous-hang protection OPEN; not merged | Owner-scoped Registry cleanup, same-version failed-build recovery and bounded fatal Worker recovery |
| [0021](0021-sdk-input-quality-and-service-availability.md) | Implemented in working tree; fast 2,028/2,028, Windows SDK 10/10, actual SDK 11/11 PASS; not merged | Separate partial SDK inputs from service failure; selected-SDK runtime globals and component metadata |
| [0022](0022-completion-resolution-lifecycle.md) | Implemented; fast 2,035/2,035 and targeted Windows UI PASS (243 details); latency/teardown open, not merged | Separate issued completion items from expiring semantic contexts; benign late resolve with edit and forgery guards |
| [0023](0023-completion-cancellation-and-synchronization.md) | Implemented; fast 2,039/2,039, Windows 50/50 and targeted UI correctness PASS; latency open, not merged | Complete in-place Program synchronization despite caller cancellation; bounded completion priority before global barriers |

Invariant for every decision: **global semantic scope remains complete while
compiler residency is bounded**. Reducing a compiler working set must never
silently reduce the legal reference scope.

## Relationships and adoption

ADR 0001–0006 retain their decisions and dated evidence. New records do not
supersede them by implication:

| Existing decision | Relation to semantic-ready proposals |
| --- | --- |
| 0001 default strategy | 0014/0012 may change only graduated capability routes through explicit supersession; current `indexed-batched + closure + full SDK` and per-job project disposal remain; 0016 owns verifier Worker retention |
| 0002 retention and R-09 | 0011 owns memory pressure; R-09 remains implemented default-off, and Settings L3 admission failed |
| 0003 transient verifier | 0016 explicitly supersedes per-batch physical Worker termination and SDK AST disposal; all other guards remain. |
| 0003 historical integration | 0014 L01–L03 do not change its default; L04–L07 retain exact fallback during default-off integration; final resource/latency acceptance is at L08 |
| 0004 complete-result cache | Keep bounded complete-answer cache/coalescing and conservative invalidation; paused S02 facts are not a substitute |
| 0005 compiler proof/index recovery | 0014 keeps official compiler authority; lexical candidates and candidate-ready generations remain insufficient for final semantics |
| 0006 references lanes | 0012 reuses lanes, cancellation and revision fences; extend only through a second real capability transcript; 0022 supersedes only the stale completion-resolve error mapping |

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
