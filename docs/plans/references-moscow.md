# References / semantic MoSCoW

This is the prioritization view of the [Feature Ledger](references-feature-ledger.md),
not a second implementation plan. Baseline: `349b3abe`.

## Must

R-01 tracing and R-02 fixed exact benchmark make latency and memory changes
attributable. R-03 hot context, R-04 complete-result cache, R-05 coalescing and
R-06 interactive/global isolation address repeat and head-of-line latency.
R-07 index trust and R-08 generation recovery preserve complete answers after
edits. All remain subject to exactness, memory and freshness gates; the default
strategy is not changed merely because one optimization lands.
R-02 now prioritizes the real Settings checkout; its API-23 SDK requirement is
an environment block on this Mac for the formal gate. The separate API-24
Settings exploratory replay demonstrates working navigation and an exact
same-SDK legacy/indexed differential, but cannot be labelled a matched
API-23 Settings benchmark.
R-04 is now implemented before candidate selection. On the exploratory
Settings/API-24 mode-C replay, requests 2–10 retained all 248 exact Locations
with a 65 ms end-to-end median and 0.60–0.90 ms server work on cache hits.
One request still waited about 1.94 s behind SDK/diagnostic queue work, so this
does not complete R-06 or its P95 interaction gate.
R-03 now has an opt-in `budget-aware` profile with a real-LSP retention test;
the safe `dispose` profile remains default until repeated Settings memory A/B
and post-eviction evidence graduate ADR 0002.
R-08 is now implemented: watched source/project changes start a new catalog,
legacy remains authoritative while its generation is stale, and indexed
batching resumes only after a ready generation advances. The public transcript
keeps exact Locations across fallback and recovery; it does not weaken R-07.

## Should

R-09 full-scope resident fast-path and R-10 anchor fusion may remove redundant
compiler preparation, but only after trace and coverage proof. R-11 Worker-shell
reuse is a flagged experiment because earlier same-isolate retention regressed.
R-12 pressure hysteresis follows budget-aware retention; parameter values are
benchmarked rather than declared architecture constants.

## Could

R-13 finer invalidation, R-14 compiler-derived persistence and R-15 reuse by
other global capabilities depend on proven validity and references scheduler
behavior. They cannot be used as shortcuts to the current 500 ms navigation or
original >3 GB memory goals.

## Won't

R-16 a second ArkTS TypeChecker, R-17 identity as today's default, R-18
multiple full-Program Workers and R-19 file-count-only memory extrapolation.
These contradict known correctness or memory evidence. Reconsider only through
a new ADR and independent real-project evidence.
