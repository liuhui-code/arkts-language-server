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
| [0007](0007-semantic-readiness-and-500ms-slo.md) | Requirement-confirmed; updated2026-10-28 by explicit user instruction | 500ms experience target; evaluate typical use, distribution, frequency and persistence; occasional exceedance alone does not fail functionality or block delivery |
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
| [0018](0018-semantic-groups-and-initial-preparation.md) | Accepted; default RSS budget superseded by 0029 | Explicit runtime pressure; initial preparation exempt; shared SDK initialization, stable semantic groups and delayed release |
| [0019](0019-stable-programs-and-request-inputs.md) | Accepted; default RSS policy superseded by 0029; comparisons historical | Retained Programs, scoped coverage, shared request inputs and 1024-root fallback soft target |
| [0020](0020-failed-semantic-build-recovery.md) | Implemented in working tree; fast 1,969/1,969 and Windows recovery 15/15 PASS; synchronous-hang protection OPEN; not merged | Owner-scoped Registry cleanup, same-version failed-build recovery and bounded fatal Worker recovery |
| [0021](0021-sdk-input-quality-and-service-availability.md) | Implemented in working tree; fast 2,028/2,028, Windows SDK 10/10, actual SDK 11/11 PASS; not merged | Separate partial SDK inputs from service failure; selected-SDK runtime globals and component metadata |
| [0022](0022-completion-resolution-lifecycle.md) | Implemented; fast 2,035/2,035 and targeted Windows UI PASS (243 details); latency/teardown open, not merged | Separate issued completion items from expiring semantic contexts; benign late resolve with edit and forgery guards |
| [0023](0023-completion-cancellation-and-synchronization.md) | Implemented; fast 2,039/2,039, Windows 50/50 and targeted UI correctness PASS; latency open, not merged | Complete in-place Program synchronization despite caller cancellation; bounded completion priority before global barriers |
| [0024](0024-partial-initialization-and-progressing-synchronization.md) | Implemented in working tree; final fast 2,050/2,050 PASS; scale/500ms/UI limits recorded; not merged | Isolate partial initialization from interactive roots, reuse witnessed relative candidates, observe synchronous activity without extending absolute deadlines |
| [0025](0025-namespace-proof-domain-recovery.md) | **Proposed; authorized candidate11 implemented; fast2,085/2,085 and7204.609s protocol soak verified; not independently approved/merged** | Retire resolver proofs and dependent consumers together, including admitted source authority; M001/M004/M005 |
| [0026](0026-cancellation-grace-terminal-handoff.md) | **Proposed; controlled regression and7204.609s protocol soak verified; original natural timing window open** | Keep the accepted cancellation grace reference monotonic through terminal delivery; SOAK-30K-M002 |
| [0027](0027-completion-details-diagnostic-priority.md) | **Proposed; scheduling defect verified; latency distribution tracked against500ms experience target** | Exhaustive foreground classification with bounded priority and diagnostic fairness; SOAK-30K-M003 |
| [0028](0028-index-cache-lifecycle.md) | **Proposed; implemented/validated under explicit authorization, not marked Accepted** | Isolated test caches, use leases, legacy preview and safe collection; full fast2092/2092, native Mac/Windows verified |
| [0029](0029-opt-in-rss-memory-budget.md) | **Proposed; implemented/validated under explicit authorization; fast2096/2096, Windows focused24 + lifetime2; not marked Accepted** | No default fixed RSS budget; explicit positive budget preserves pressure semantics; normal cleanup and fault recovery remain |
| [0030](0030-completion-scope-and-navigation-liveness.md) | **Proposed; candidate verified: fast2103/2103, Windows7/7; UI scope/limits recorded** | Separate partial completion scope from validity; finite navigation priority; reason-scoped compiler synchronization drain under unchanged absolute deadlines |
| [0031](0031-cancelled-read-compiler-synchronization.md) | **Accepted 2026-10-30; user approved PR delivery; Mac fast2106, final focused Mac28/28 and Windows24/24; actual Photos30K evidence recorded** | Cancel obsolete reads while letting an already-entered compiler synchronization finish under its original absolute deadline |

2026-10-27 [三项根因与ADR审计](../reports/2026-10-27-30k-issues-root-causes-and-adrs.md#adr逐项映射与设计缺口)：
上表0020–0023的“not merged”及检查数是各切片当时的历史收据，不能作为当前版本判定。
其文件已经存在于父HEAD `17e923f`（最近相关提交 `8def69d`），工作树又含未提交修订；
0024仍在工作树，后续取消修复的fast为2052/2052，原2050收据不覆盖该修复。
当次仅诊断未重新执行全量fast，两个7200s耐久目标仍FAIL；这些原始历史不追认通过。
0025–0027是独立评审草案，不追认Accepted，不修改0020–0024的既有历史/预算/新鲜度合同。

2026-10-28[最终验证](../reports/2026-10-28-three-soak-defects-final-verification.md)：candidate11完整fast2085/2085，
新的7204.609s单会话协议混合完成，1Worker/0恢复，三项机制及M004/M005有公开回归；并非真实Zed UI/Windows验收。
37次完整范围不可用、1981份成功操作>500ms、SDK层11pass/2原180s控制取消、原生高内存及M002自然窗口限制仍在。
授权豁免仅本轮驱动Node2048MiB提前停止，产品/V8/其他保护不变；三份ADR依旧Proposed，不借实现收据伪造审批。

2026-10-28后续用户确认[时延体验口径](../benchmarks/interactive-latency-assessment.md)：500ms不是严格限制，
偶发超过不独立判功能失败或阻塞交付；无新增550ms/P95/比例替代硬线。上表旧切片“500ms FAIL”是原始历史收据，
不改测量也不据此自动阻塞当前交付；反复严重慢响应、超时、不可用及其他功能/资源限制继续记录。

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
