# ADR 0004: Exact reference result cache validity

Status: **Proposed; no production cache yet**.

## Decision

Add a small in-memory cache only for complete, compiler-verified reference
results. It is reuse of a semantic answer, not an index-only answer. A key must
bind the canonical root and anchor, `includeDeclaration`, backend/SDK and
project configuration identities, workspace content revision and open-overlay
snapshot. The first version invalidates the entire affected root for any source,
project, package/lockfile, SDK/target, or overlay change. Do not start with
fine-grained dependency invalidation or persistence.

Bound both entry count and retained bytes. Cancelled, timed-out, incomplete or
partially verified work is never cached. Identical in-flight requests may share
verification only if independent cancellation of one waiter cannot cancel the
other. A changed snapshot cannot receive the old result.

## Gate

Through real framed LSP sessions: first complete request misses; repeated
same-snapshot request has the exact same URI/range set with zero new verifier
Workers and Program builds; each mutation class forces a fresh result; two
concurrent requests perform one verification while retaining independent
cancellation. Any stale result disables the cache.
