# ADR 0004: Exact reference result cache validity

Status: **Accepted and implemented for complete in-memory results**.

The default-off [local-export seed experiment](../reports/2026-09-26-settings-local-export-anchor-seed.md)
does not cache discovery or pending proof. Every final batch must validate the
original cursor with compiler before the complete result is cacheable; seed
rejection discards work and retries the compiler-anchor route. Cancellation,
snapshot changes and incomplete results remain uncached. Cache ownership and
root-wide invalidation are unchanged.

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

The [candidate-snapshot regression](../tdd/references-candidate-snapshot.md)
also proves that an overlay owned by a nested workspace can be part of the
parent's authoritative semantic input. Overlay open/change/close therefore
invalidate cache entries for every known physically equal, ancestor or
descendant root, not just the document's lexical owner. Canonical realpath
aliases share this invalidation domain. An unavailable physical identity is
not proof of independence; invalidate conservatively. Proven disjoint sibling
roots retain their cache. Watched file events still clear all entries as above.

Bound both entry count and retained bytes. Cancelled, timed-out, incomplete or
partially verified work is never cached. Identical in-flight requests share one
version-bound operation before semantic dispatch. Each LSP waiter retains its
own cancellation: one client cancellation detaches only that waiter, while a
workspace mutation invalidates every waiter on the old snapshot and aborts the
shared operation after the final waiter detaches. A changed snapshot cannot
join or receive the old result.

Complete results are additionally fenced by the proxy's captured managed
input/configuration revisions before cache insertion. Ready index generation
alone cannot admit a result computed across a document or SDK/project change.

## Gate

Through real framed LSP sessions: first complete request misses; repeated
same-snapshot request has the exact same URI/range set with zero new verifier
Workers and Program builds; each mutation class forces a fresh result; two
concurrent requests perform one verification while retaining independent
cancellation. Any stale result disables the cache.

Cache reuse, overlay/workspace invalidation and concurrent independent
cancellation are GREEN. See the cache and
[coalescing](../tdd/references-coalescing.md) TDD records.

The latest [three-process Settings mode-C check](../reports/2026-09-26-settings-default-mode-c.md)
uses the production profiles with anchor reuse disabled and phase tracing off.
All 33 responses match the nine-Location `HomeInitData` oracle; each process
records nine hits and two misses, including the unsaved edit. Cached requests
are 2–4 ms in this small burst; first/edit misses still take seconds. This is
real-project cache/freshness smoke, not a general 500 ms or memory release gate.

The later [current-build Settings mode-C attempts](../reports/2026-09-28-settings-mode-c-catalog-blocked.md)
both fail before didOpen at the unchanged180 s catalog-ready gate, including a
normal-OS-environment control. No references/cache/diagnostic workload is entered;
they neither close nor disprove cache freshness. Restore readiness before the
same-snapshot/edit replay; correlate edit with actual miss/rebuild/store, not
merely equal locations after an appended comment. Low pre-reference RSS is not
a references memory improvement or a sole-host-cause diagnosis.

## Experimental definition-to-anchor reuse

R-10 has a separate opt-in, context-owned memo of one compiler-validated
definition, not a second global reference cache. Only an explicit definition
at the same position and snapshot can supply the anchor; final references
still require compiler batch verification. Canonical root, reset/content
revision, document generation/version and all active open-overlay paths/versions
bind the entry. An unknown overlay version refuses reuse. Project configuration
changes clear it; SDK reconfiguration disposes its context; trim and eviction
discard it. SDK ambient profiles must match, and complete membership with no
pending path invalidation is required. Both entry count and retained size are
bounded (the snapshot key, definition and prepared-source path/SHA-256 metadata
together are capped at 16,384 serialized code units). Before reuse, every
captured prepared source must still be present with identical content in the
current DocumentAuthority workspace view. This detects disk edits before a
watcher notification; it adds no filesystem reads or retained source text.
These fingerprints cover prepared documents, not a claim of complete compiler
dependency coverage. The flag `ARKTS_REFERENCES_ANCHOR_REUSE=1` remains off by default.
See [the public RED/GREEN](../tdd/references-anchor-reuse.md); this does not
graduate cold fusion, fine-grained invalidation or the memory/latency gates.
