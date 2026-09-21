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
R-20 is the separate initial-index first-click gate: post-mutation generation
recovery does not solve a request that precedes the first catalog or sidecar
`open`. Its current bounded wait is an opt-in causal experiment, not a default
navigation policy.
R-02 now prioritizes the real Settings checkout. Its declared compile 23 and
selected API 24 are separately pinned: API 24 is accepted for the same-SDK
performance/differential track, without claiming matched-23 or diagnostic
equivalence. Three independent cold processes per strategy all returned the
same 248 Locations. A missing API-23 installation does not block further
Settings performance work.
R-04 is implemented before candidate selection. The earlier three
Settings/API-24 mode-C processes had a 61 ms cached median but three
1.96–1.99 s outliers when automatic diagnostic quiescence was active. F6b
added a real-LSP RED/GREEN gate: only an already-proven complete cache hit
bypasses that wait; misses retain it, and normal diagnostics still publish.
Three new independent same-build processes returned all 33 responses with
248 exact Locations each. Their 27 cached repeats had 67 ms median, 96 ms
observed nearest-rank P95 and 100 ms maximum. This clears the 500 ms target
for this **cached** Settings sample, not for cold/post-edit misses or release
P95. Those F6b runs published 18 errors. A subsequent real-LSP RED/GREEN
showed that the bundle lacked adjacent `ohos-typescript` standard-library
declarations. A second RED found that the default full library introduced a
DOM `Text` collision; production now selects non-DOM ES2022. Focused portable
installed-artifact acceptance passed 9/9. Two fresh Settings/API-24 no-DOM
replays retained 248/248 exact references each and published only TS 2307, which
still requires validation. Asset and Worker-bundle digest recording with
optional manifest mismatch preflight passed the full replay CLI suite (10/10);
the refreshed `MenuController` manifest and one fresh pinned indexed-batched
replay also passed with 248 exact Locations. That cold request took 6,226 ms,
so it does not satisfy the user's ≤500 ms navigation target. Larger paired
samples and Windows execution remain open; this is not an API-23 or
DevEco-equivalence claim
([standard-library report](../reports/2026-09-21-settings-api24-standard-library.md)).
R-02 now has two real Settings symbols, each with pinned oracles for both
declaration policies. A [new matrix](../reports/2026-09-21-settings-api24-reference-matrix.md)
ran `HomeInitData` without declaration in three independent fresh processes
per `legacy`, `batched` and `indexed-batched` strategy: all nine responses were
the same exact nine Locations, with zero target-file diagnostics. The observed
request medians were 8,905 / 93,179 / 5,019 ms respectively; pure batching
therefore remains unsuitable as the default for this case despite a modest
median peak-RSS reduction. Single fresh legacy/indexed pairs also passed
`HomeInitData` with declaration 10/10 and `MenuController` without declaration
247/247; the latter still reported TS 2307. Three cold runs are not a stable
P95, those opposite-policy pairs initially had only one run per strategy, and all cold
requests missed the 500 ms navigation target. F2, matched-API-23/DevEco,
native Windows, original >3 GB and final memory gates remain open.
The [follow-up with-declaration matrix](../reports/2026-09-21-settings-with-declaration-matrix.md)
expanded `HomeInitData`'s opposite policy to three fresh processes per
strategy. All nine returned the same ten exact Locations and zero target-file
diagnostics; observed request medians were 9,030 ms legacy, 90,894 ms pure
batched and 5,107 ms indexed-batched. This strengthens the fixed Settings
smoke differential but is still not a release sample, API-23 equivalence or
evidence that cold navigation meets 500 ms.
Three independent warmed mode-B `HomeInitData` processes also retained 9/9
exact references. Their observed completion, definition and references medians
were 8,613, 37 and 4,404 ms; the full-run peak product RSS median was
1,136,500,736 bytes, about 2.04× the mode-A indexed median under a different
workflow. This is a memory-warning signal, not proof that references alone
caused the increase: the warmup may retain compiler state and its result
contents had no golden. One repeat/edit mode-C process returned 11/11 exact
responses, with nine unchanged repeats at 2–3 ms and a 3,855 ms post-edit
request. Only one version-2 diagnostic publication was captured, not a full
versioned diagnostic sequence. These runs do not graduate F2, establish a
stable P95 or meet the cold 500 ms target.
R-03 now has an opt-in `budget-aware` profile with a real-LSP retention test;
the safe `dispose` profile remains default. A controlled
[three-versus-three Settings mode-B comparison](../reports/2026-09-21-settings-api24-reference-matrix.md)
returned 9/9 exact `HomeInitData` Locations on every run and observed
resident 1→1 under retention versus 1→0 under disposal. References medians
were 4,072 versus 4,404 ms; full-run product RSS peaks were 1,129,537,536
versus 1,136,500,736 bytes. These small sample differences do not support a
default flip or graduation: both workflows still peak around 1.13 GB, the
1,024 MiB semantic budget is not a hard RSS cap, first references remain
above 500 ms, and post-eviction PSS evidence is missing.
R-08 is now implemented: watched source/project changes start a new catalog,
legacy remains authoritative while its generation is stale, and indexed
batching resumes only after a ready generation advances. The public transcript
keeps exact Locations across fallback and recovery; it does not weaken R-07.
Initial catalog warming is a separate open Must gate: a
[pinned Settings first-click replay](../reports/2026-09-21-settings-immediate-catalog-replay.md)
timed out after 120 seconds on the indexed-batched path, which kept its
23-batch conservative plan even after catalog readiness. Completed legacy
controls were exact but took 31–38 seconds and used about 875–910 MB peak
product-tree RSS. Neither path meets the cold navigation target, and the
timed-out indexed peak cannot establish completed-query memory safety.
Do not promote an initial-index fallback policy without snapshot/cancellation,
exactness, diagnostics and RSS gates.
The [opt-in wait experiment](../reports/2026-09-21-settings-initial-catalog-wait-experiment.md)
now passes the narrow snapshot/cancellation/exactness transcript and returns
9/9 in three index-cold Settings runs with 537–560 MB completed peaks, but
39.8–50.5 second requests and delayed diagnostics leave this Must gate RED.
The same-build legacy median is 8.7 seconds/953 MB; one default indexed-first
run took 90.8 seconds and 23 batches. Neither is a general low-memory fix or
500 ms navigation. The wait remains default-off. Initial-index readiness must
move off the user click/diagnostic suspension path before graduation review.
The [fresh Settings catalog phase profile](../reports/2026-09-22-settings-catalog-phase-profile.md)
records roughly 0.8–1.0 seconds before activation and 10.2–11.9 seconds
from activation to ready for 1,846 files. A concurrent macOS stack sample
points to reference-row writes inside SQLite replacement. The next experiment
must compare one bounded write-path change with exact generation/query and
memory checks; neither parser tuning nor a default strategy switch follows
from this evidence.
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
R-10 now has that first trace baseline for a real Settings **usage** position:
three indexed cold runs all required a separate ~2.05 s anchor Program before
one verifier batch and returned the same nine exact Locations as three legacy
runs. It remains a Should experiment, not a correctness-approved shortcut
([evidence](../reports/2026-09-21-settings-usage-anchor-baseline.md)).
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
