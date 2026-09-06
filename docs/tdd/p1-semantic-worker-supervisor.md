# P1 per-root semantic worker supervisor TDD evidence

Status: focused GREEN; production worker composition remains deferred.

- Initial parent revision: `ec96afd5408d6fd50f755e09002b4e6aa8b14db7`
- Initial supervisor commit: `e4ecaf3`
- Adversarial-hardening parent revision: `3b12000`
- Protocol compatibility baseline: `742a924` (canonical file-URI identity helper)
- Scope: deterministic per-root scheduler over an injected worker endpoint
- Excluded: `worker_threads` endpoint, semantic-engine proxy, restart/replay and LSP wiring

## Public contract

`RootSemanticWorkerSupervisor` is the single writer for one canonical workspace root. It accepts
validated mutation inputs and query-by-reference inputs, and exposes a typed request handle with a
result promise plus first-cause `cancel(reason)` operation.

The scheduler guarantees:

- one dispatched, non-terminal command per root;
- mutations before queries, with no query released until the exact gapless mutation ACK;
- wire revisions and request IDs allocated exactly once, only while dispatching;
- independent state generations, so every accepted same-root mutation invalidates older active and
  queued queries even when multiple mutations collapse to one wire revision;
- one active command plus at most 64 waiting requests;
- at most 32 queued document snapshots, 32 total queued mutation records, and 4 MiB of
  replacement-accounted UTF-8 document text;
- document coalescing only within its current arrival segment: a workspace invalidation is a hard
  ordering barrier, while workspace invalidations coalesce only when consecutive at the queue tail;
- every coalesced workspace invalidation still passes the protocol file/message bounds;
- exact epoch, id, applied-revision and document-version response fencing;
- active cancellation settled only after a matching response, a real endpoint terminal event, or a
  bounded termination/deadline fence;
- idempotent disposal using an injected deterministic deadline and exactly one terminate call;
- stable fail-closed errors after malformed traffic, endpoint failure or mutation-journal overflow.

Constructor roots, document mutations, workspace invalidations and requests use the protocol's
canonical file-URI identity rule before URI values become scheduler keys. This rejects lexical
aliases such as `file:///workspace/%41.ets` as well as false path prefixes such as
`file:///workspace-evil`. Realpath and symlink identity are intentionally not claimed here.

Public top-level request and mutation envelopes must be ordinary exact-key data objects. Custom or
null prototypes, symbols, accessors, non-enumerable fields and extra keys produce the fixed
`invalid-request` error without invoking an accessor or poisoning a healthy root. An over-bound
workspace array is descriptor-validated before it is classified: malformed input remains an
`invalid-request`, while a structurally valid mutation that cannot be transported makes the root
`restart-required` because dropping it would diverge worker state.

Client cancellation and content modification use a shared atomic first-writer-wins cell. Disposal,
overflow, protocol faults and termination deadlines cannot replace an earlier client or content
cause. Queued cancellation removes the request and releases its queue slot; dispatched cancellation
keeps the active fence until a terminal condition.

Listener removal and endpoint termination are one idempotent path. Listener cleanup failures and
synchronous/asynchronous termination failures are observed and normalized to a fixed supervisor
error. If the injected deadline wins while `terminate()` never settles, public work and disposal
still reach a deterministic terminal state. The endpoint is then a detached orphan: its late
settlement is observed to prevent an unhandled rejection, but this layer cannot prove that an
arbitrary injected endpoint released its operating-system resources.

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
11. malformed public input leaked protocol errors;
12. a corrupted shared cancellation cell cleared the active record before rejecting its promise,
    leaving the result permanently pending;
13. every coalesced mutation retained another completion record, allowing same-URI edit bursts to
    grow memory despite the snapshot bounds; coalesced callers now share one terminal promise;
14. one individually over-bound full-text mutation was treated as a recoverable invalid call even
    though dropping it would diverge worker state; it now degrades the root to `restart-required`;
15. hostile top-level objects were accepted and could reach public-envelope property access;
16. idle and active disposal both remained pending when endpoint termination never settled;
17. deadline/fault fallback settlement overwrote earlier `clientCancelled` and `contentModified`
    causes with `worker-unavailable`;
18. a throwing listener cleanup leaked its raw error and skipped endpoint termination;
19. send, decode and identity protocol faults released the active command before termination or the
    injected deadline established a terminal fence;
20. document and workspace coalescing crossed each other's ordering barriers;
21. barrier-separated workspace records were omitted from the queue bound and could grow without
    limit;
22. a malformed 1,025-entry workspace change was classified as `restart-required` before its
    accessor-safe structure was checked; and
23. the total mutation-record bound existed only under the misleading document-bound name; the two
    limits are now explicit and independently checked; and
24. when listener cleanup threw, a post-fault matching response could still release an active
    command before the termination fence.

Canonical URI alias rejection was added as a supervisor characterization after the protocol owner's
`742a924` RED → GREEN slice exported `isCanonicalSemanticWorkerFileUri`; the supervisor reuses that
single rule rather than implementing a second path-normalization policy. All timing tests use
injected deferred gates; no test uses wall-clock sleeps.

Each failing behavior was made GREEN before extending the next contract. Response-field fencing,
UTF-8 replacement accounting, error-plus-exit idempotence, synchronous terminate failure and
two-root isolation were retained as characterization/acceptance checks while GREEN.

## GREEN gates

```sh
node --test tests/semantic-worker-supervisor.test.mjs
```

Result: `34/34` passing, with no skipped, todo, cancelled or failed tests.

```sh
pnpm check
```

Result: exit `0` (`tsc --noEmit -p tsconfig.json`) on the shared integration worktree after protocol
baseline `742a924` landed.

## Honest deferrals

This T3 slice does not prove production cancellation or process reclamation. T5/T6 still own the
real Node worker endpoint, worker-resident document/type state, TypeScript cancellation-token
bridge, LSP request proxy and artifact wiring. T7 still owns bounded overlay replay, epoch restart
and crash-loop policy. Realpath/symlink alias handling also remains deferred beyond lexical file-URI
identity. Until those slices and the real stdio responsiveness tracer are GREEN, this supervisor is
a tested state machine rather than an enabled language-server execution path.
