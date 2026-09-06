# P1 per-root semantic worker supervisor TDD evidence

Status: focused GREEN; production worker composition remains deferred.

- Parent revision: `ec96afd5408d6fd50f755e09002b4e6aa8b14db7`
- Scope: deterministic per-root scheduler over an injected worker endpoint
- Excluded: `worker_threads` endpoint, semantic-engine proxy, restart/replay and LSP wiring

## Public contract

`RootSemanticWorkerSupervisor` is the single writer for one canonical workspace root. It accepts
validated mutation inputs and query-by-reference inputs, and exposes a typed request handle with a
result promise plus first-cause `cancel(reason)` operation.

The scheduler guarantees:

- one dispatched, non-terminal command per root;
- mutations before queries, with no query released until the exact gapless mutation ACK;
- wire revisions allocated only while dispatching, after queued coalescing is complete;
- independent state generations, so every accepted same-root mutation invalidates older active and
  queued queries even when multiple mutations collapse to one wire revision;
- one active command plus at most 64 waiting requests;
- at most 32 queued document snapshots and 4 MiB of their replacement-accounted UTF-8 text;
- one coalesced workspace invalidation whose aggregate still passes the protocol's file/message
  bounds;
- exact epoch, id, applied-revision and document-version response fencing;
- active cancellation settled only after a worker response, worker failure/exit, or termination;
- idempotent disposal using an injected deterministic deadline and exactly one terminate call;
- stable fail-closed errors after malformed traffic, endpoint failure or mutation-journal overflow.

Document and request URIs must cross a real URL path boundary under the constructor root;
`file:///workspace-evil` is not inside `file:///workspace`. Runtime-invalid inputs are normalized to
the fixed `invalid-request` supervisor error without poisoning a healthy root. Mutation-journal or
coalesced-workspace overflow is stronger: the root becomes `restart-required`, queued work is
settled, and the active worker command is terminated before its record is released.

The protocol decoder currently requires a revision on mutation validation. The supervisor uses a
non-escaping sentinel solely to obtain an immutable accepted snapshot; its monotonic wire revision
is created only in the dispatch path.

## RED → GREEN record

Focused command for every slice:

```sh
node --test tests/semantic-worker-supervisor.test.mjs
```

The first RED at the parent revision failed because esbuild could not resolve
`src/semantic/semantic-worker-supervisor.ts`. Subsequent vertical REDs observed, then closed, these
public failures:

1. the 65th waiting request remained unresolved instead of failing with `queue-overflow`;
2. queued mutations neither pre-empted stale queries nor coalesced the latest URI snapshot;
3. a dispose left the active cell at `active` and terminated before the injected deadline;
4. stale response identities leaked raw mismatch errors instead of failing the root closed;
5. `/workspace-evil`, invalid roots and invalid epochs crossed the root supervisor boundary;
6. queued workspace invalidations lost later flags and distinct file changes;
7. document-journal overflow rejected only one call instead of degrading the whole root;
8. an over-bound coalesced workspace mutation leaked `SemanticWorkerProtocolError`;
9. queued cancellation did not return its first cause or release a queue slot;
10. an undispatched `open` coalesced into `change`, losing the worker's open transition;
11. malformed public input leaked protocol errors; and
12. a corrupted shared cancellation cell cleared the active record before rejecting its promise,
    leaving the result permanently pending; and
13. every coalesced mutation retained another completion record, allowing same-URI edit bursts to
    grow memory despite the snapshot bounds; coalesced callers now share one terminal promise; and
14. one individually over-bound full-text mutation was treated as a recoverable invalid call even
    though dropping it would diverge worker state; it now degrades the root to `restart-required`.

Each failing behavior was made GREEN before extending the next contract. Response-field fencing,
UTF-8 replacement accounting, error-plus-exit idempotence, synchronous terminate failure and
two-root isolation were retained as characterization/acceptance checks while GREEN.

## GREEN gates

```sh
node --test tests/semantic-worker-supervisor.test.mjs
```

Result: `19/19` passing, with no skipped, todo, cancelled or failed tests.

Compatibility baseline: semantic protocol follow-up `bba2e5a699a4d5d1eb5e22d038efe7e127c1ca42`.

```sh
pnpm check
```

Result: exit `0` (`tsc --noEmit -p tsconfig.json`) after the concurrently owned protocol and
call-hierarchy slices landed. An interim type run had been blocked only by the call-hierarchy
owner's then-uncommitted narrowing; no out-of-scope file was changed by this slice.

## Honest deferrals

This T3 slice does not prove production cancellation. T5/T6 still own the real worker endpoint,
worker-resident document/type state, TypeScript cancellation-token bridge, LSP request proxy and
artifact wiring. T7 still owns bounded overlay replay, epoch restart and crash-loop policy. Until
those slices and the real stdio responsiveness tracer are GREEN, this supervisor is a tested state
machine rather than an enabled language-server execution path.
