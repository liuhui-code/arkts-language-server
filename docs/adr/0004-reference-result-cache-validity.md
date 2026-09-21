# ADR 0004: Exact reference result cache validity

Status: **Accepted and implemented for complete in-memory results**.

## Decision

Use a small in-memory cache only for complete, compiler-verified reference
results. It is reuse of a semantic answer, not an index-only answer. A key must
bind the canonical root and anchor, `includeDeclaration`, backend/SDK and
project configuration identities, workspace content revision and open-overlay
snapshot. The first version invalidates the entire affected root for any source,
project, package/lockfile, SDK/target, or overlay change. Do not start with
fine-grained dependency invalidation or persistence.

The cache is owned by the semantic proxy and is checked before Rust candidate
selection. This placement is part of the decision: a valid hit must not pay
index lookup, planner, verifier Worker, or Program construction again. Any
workspace file event clears all entries in v1 because a nested-root change can
invalidate an outer dependency closure; root-local guessing is not safe yet.

Bound both entry count and retained bytes. Cancelled, timed-out, incomplete or
partially verified work is never cached. Identical in-flight requests may share
verification only if independent cancellation of one waiter cannot cancel the
other. That coalescing remains a separate follow-up; a changed snapshot cannot
receive the old result.

## Gate

Through real framed LSP sessions: first complete request misses; repeated
same-snapshot request has the exact same URI/range set with zero new verifier
Workers and Program builds; each mutation class forces a fresh result; two
concurrent requests perform one verification while retaining independent
cancellation. Any stale result disables the cache.

The cache reuse and overlay/workspace invalidation portions are GREEN. The
concurrent independent-cancellation portion is tracked separately as R-05 and
does not block the narrower R-04 implementation status.
