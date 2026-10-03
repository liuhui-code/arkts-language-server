# ADR 0002: Budget-aware hot semantic context

Status: **Feature-gated retention and L3 hysteresis implemented; graduation evidence incomplete**.

## R-09 default-off implementation (2026-09-29)

The subsequent [negative-lookup recovery](../tdd/references-constructor-empty-scope.md)
distinguishes two identities: later freshness of an exact absent path retains
the existing parent's stable entity/link and rewalks the full missing chain,
not unrelated sibling timestamps; actual-load before/after keeps full stamps.
Existing files and directly enumerated directories retain full freshness stamps.
This avoids unnecessary miss/rebuild without certifying a missing→read→missing
window or re-stamping an old cache. The public sibling cost RED0→GREEN2 hits
preserves exact Locations and zero transient batches; configuration mutation
guards remain. The 31-case combined focus and fresh complete **1126/1126
whole-fast** pass at unchanged deadlines. The first **1124/1125, 1 FAIL** gate
is retained as history; its failed control is not hidden by a singleton rerun.
See the recovery record for the final frozen artifacts and full-gate log digest.

`ARKTS_REFERENCES_RESIDENT_FAST_PATH=1` is a separate, default-off experiment.
It consumes an already built resident compiler Program; it must not build a
Program, warm a scope, or turn a partial interactive context into global proof.
Admission requires unchanged owner/reset/content/overlay identities, complete
original membership plus every open overlay and SDK root, the same actual
Program before and after compiler verification, a unique definition, and no
L2/L3 pressure. The original cursor is queried; an indexed class seed is not a
substitute for constructor semantics. Leases pin the existing context.

Source text is checked against what the Program actually loaded. Configuration
freshness must similarly be bound to actual reads/lookups, including missing
manifests and installation links; restamping current metadata cannot certify an
old resolver cache. Package-entry, absent-owner, installation-link and implicit
type-directive configuration REDs are now repaired; the full 17-case public
stdio coverage is GREEN, including SDK metadata/loader/selection and source/
overlay mutations. Unknown evidence is a miss, not approximate references.
Misses preserve the existing complete pipeline.

The retention default remains `dispose`, alongside `indexed-batched + closure
+ full SDK`. There is no persistent verifier, second compiler, budget increase,
diagnostic suppression or candidate exclusion. The
[public TDD record](../tdd/references-resident-fast-path.md) records the
17-case public coverage and fresh **1116/1116 whole-fast PASS**. The fixed
[six-run Settings A/B](../reports/2026-09-29-settings-resident-fast-path.md)
returns 267 exact Locations each, but all three enabled requests miss at L3,
after resident eviction, and still run 24 batches. No build is saved there.
This is a failed real-workload admission/graduation gate, not a reason to raise
the budget or relax coverage. Keep the flag off; this implementation alone
does not graduate R-03/R-09 or prove cold navigation within 500 ms.

## Context

The current reference executor calls `disposeResidentContext(rootPath)` before
every batched search. This prevents a previously prepared interactive context
from remaining hot. Conversely, retaining that context while a transient
verifier builds another Program can increase total process RSS. The coordinator
already limits resident contexts and owns trim/dispose; the external compiler's
AST must not be manually pruned by the server.

## Decision under test

Replace unconditional disposal with one budget-aware admission decision. Keep
the active interactive root only when its identity and scope remain valid and
there is headroom for the verifier; otherwise trim or evict an unleased context.
Use MRU/age and pressure hysteresis, with the configured L3 target as the
recovery threshold. An idle grace period, if used, is an experimental parameter,
not a correctness invariant. Never use a small interactive Program as proof of
a full global reference result without explicit coverage equality.

The first slice exposes `dispose` and `budget-aware` profiles. `dispose`
remains the production default until the multi-run memory gate passes.
`budget-aware` leaves the warm resident context under coordinator ownership;
normal L2/L3 process-memory sampling may still trim or evict it while the
transient verifier is active. An opt-in trace records the profile and resident
count before/after admission.

The memory policy is stateful at L3. Once RSS reaches `level3Ratio`, it remains
at L3 while RSS is at or above `level3TargetRatio`; normal L0–L2 classification
resumes only after RSS falls below that target. This makes the committed 85%
target an actual recovery boundary instead of unused configuration and avoids
evict/rebuild oscillation near the 92% entry threshold.

## Graduation gate

Feature-gated A/B on the same real project, SDK, query and server build must
show a hot context hit without unnecessary reconstruction, exact semantic
results, no stale overlay, and no meaningful peak/post-eviction PSS regression.
Report the combined Node PID RSS once, including worker threads. Roll back to
the existing disposal policy if memory or freshness gates fail.

The structural real-LSP test is GREEN: a warmed definition leaves one context,
budget-aware references retain it, and the following definition is exact. One
exploratory Settings/API-24 mode-B run returned the exact 248 Locations with a
936,415,232-byte peak versus 1,063,485,440 bytes in the older dispose run, but
single non-randomized runs are insufficient to change the default. A later
[three-versus-three Settings comparison](../reports/2026-09-21-settings-api24-reference-matrix.md)
also preserved exact Locations but showed only small latency and product-RSS
differences. The [post-retention phase trace](../reports/2026-09-21-settings-post-retention-memory-trace.md)
found high pre-verifier Node RSS after the logical resident count changed 1→0
under `dispose`; this does not prove a leak or two live Programs. Neither
comparison graduates `budget-aware` or changes the production default.

The subsequent [isolated one-second disposal-idle probe](../reports/2026-09-21-settings-disposal-idle-probe.md)
used three independent warmed Settings replays per arm with an unchanged
control bundle and a debug-only pre-verifier pause in a copied bundle. All six
returned the same nine exact references; none of the three pauses showed a
material Node RSS decline. A one-second natural idle does not force GC or
distinguish reachable compiler state from allocator-retained pages, so this
result neither proves a leak nor justifies changing the default retention
policy. The memory graduation gate remains open.

The [controlled GC follow-up](../reports/2026-09-21-settings-disposal-gc-probe.md)
compared three independent no-GC and three GC replays using copied debug
bundles, with `--expose-gc` in both arms. Explicit collection in the disposed
semantic Worker reclaimed roughly 508–513 MB of its V8 heap but reduced
whole-Node RSS only about 21 MB immediately; all six exact reference results
remained unchanged. This supports collectibility, not a retained-object leak
finding or a production `global.gc()` policy. The externally sampled peak
difference remains exploratory and does not graduate `budget-aware`.
