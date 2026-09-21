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
R-02 now prioritizes the real Settings checkout. Its declared compile 23 and
selected API 24 are separately pinned: API 24 is accepted for the same-SDK
performance/differential track, without claiming matched-23 or diagnostic
equivalence. Three independent cold processes per strategy all returned the
same 248 Locations. A missing API-23 installation does not block further
Settings performance work.
R-04 is implemented before candidate selection. On three Settings/API-24
mode-C processes, all 33 references responses retained 248 exact Locations.
The 27 cached repeats had a 61 ms median, but three took 1.96–1.99 s while
automatic diagnostic quiescence was active. That violates both the proposed
200 ms cached P95 and the requested 500 ms navigation target; R-06's
diagnostic-interference slice remains open. The 18 published errors also
require separate SDK/diagnostic validation.
R-03 now has an opt-in `budget-aware` profile with a real-LSP retention test;
the safe `dispose` profile remains default until repeated Settings memory A/B
and post-eviction evidence graduate ADR 0002.
R-08 is now implemented: watched source/project changes start a new catalog,
legacy remains authoritative while its generation is stale, and indexed
batching resumes only after a ready generation advances. The public transcript
keeps exact Locations across fallback and recovery; it does not weaken R-07.
R-07 now also rejects candidates if the sidecar changes from ready to warming
between candidate search and acceptance, even when the committed generation
number is unchanged. Direct and definition-anchor real-LSP transcripts both
fall back to complete semantics and retain the known cross-file reference;
the wider trust matrix remains an open gate.
R-06 is now implemented for references. Only classified interactive methods
may bypass one detached references request; diagnostics and other global work
remain serialized, and any mutation makes the old references snapshot fail
ContentModified. The real LSP interference test records definition/hover queue
waits below 250 ms and a fresh post-edit definition. Detached scheduling is
not yet generalized to other global methods.
R-05 is now implemented as a version-bound shared operation in the LSP request
runner. Identical references share semantic work, but each client keeps an
independent cancellation handle; workspace mutation cancels every old-snapshot
waiter and prevents a new version from joining the old operation.

## Should

R-09 full-scope resident fast-path and R-10 anchor fusion may remove redundant
compiler preparation, but only after trace and coverage proof. R-11 Worker-shell
reuse is a flagged experiment because earlier same-isolate retention regressed.
R-12 pressure hysteresis is implemented: L3 remains active until RSS falls
below the configured recovery target. The committed ratios remain tunable
policy values and still require real-project benchmark review.

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
