# ADR 0002: Budget-aware hot semantic context

Status: **Proposed; requires A/B memory evidence**.

## Context

The current reference executor calls `disposeResidentContext(rootPath)` before
every batched search. This prevents a previously prepared interactive context
from remaining hot. Conversely, retaining that context while a transient
verifier builds another Program can increase total process RSS. The coordinator
already limits resident contexts and owns trim/dispose; the external compiler's
AST must not be manually pruned by the server.

## Proposed decision

Replace unconditional disposal with one budget-aware admission decision. Keep
the active interactive root only when its identity and scope remain valid and
there is headroom for the verifier; otherwise trim or evict an unleased context.
Use MRU/age and pressure hysteresis, with the configured L3 target as the
recovery threshold. An idle grace period, if used, is an experimental parameter,
not a correctness invariant. Never use a small interactive Program as proof of
a full global reference result without explicit coverage equality.

## Graduation gate

Feature-gated A/B on the same real project, SDK, query and server build must
show a hot context hit without unnecessary reconstruction, exact semantic
results, no stale overlay, and no meaningful peak/post-eviction PSS regression.
Report the combined Node PID RSS once, including worker threads. Roll back to
the existing disposal policy if memory or freshness gates fail.
