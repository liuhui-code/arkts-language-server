# ADR 0002: Budget-aware hot semantic context

Status: **Feature-gated retention and L3 hysteresis implemented; graduation evidence incomplete**.

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
single non-randomized runs are insufficient to change the default.
