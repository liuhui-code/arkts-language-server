# T4c aggregate admission before disk reads

## Contract

- The existing limits remain authoritative: 4 MiB per disk snapshot, 8 MiB and 256 documents per semantic closure.
- A cold disk document is admitted against the closure's remaining byte budget after descriptor `fstat`, but before buffer allocation or `readSync`.
- Aggregate budget rejection is distinct from an unavailable file. It must not store a record, update LRU access, or capture transactional undo state.
- A stable descriptor read is checked again using the decoded content's actual byte length before the document is stored.
- Open overlays remain pinned and authoritative. Cancellation and rollback retain their existing behavior.

## Slice A: workspace hydration

Parent revision: `cbc6dea`.

Fixture: an open, small `Main.ets` plus `A.ets` and `B.ets`, each exactly 4 MiB. Project hydration admits Main and A; the remaining aggregate budget cannot admit B.

RED:

```text
node --test --test-name-pattern "workspace hydration admits aggregate bytes" tests/document-store-cancellation.test.mjs
not ok - workspace hydration admits aggregate bytes before reading and retries an uncommitted file
B: openSync=1, fstatSync=2, readSync>0, closeSync=1
```

The old implementation read and cached B before the caller rejected it.

GREEN:

```text
node --test --test-name-pattern "workspace hydration admits aggregate bytes" tests/document-store-cancellation.test.mjs
ok - workspace hydration admits aggregate bytes before reading and retries an uncommitted file
B initial attempt: openSync=1, fstatSync=1, readSync=0, closeSync=1
```

After deleting A and publishing the exact watched-file delta, the same store retries B from disk. A positive `readSync` count proves the rejected attempt did not leak a cached document.

## Slice B: cold dependency traversal

Parent revision: `ea023c6` (Slice A is already present in ancestry).

Fixture: `Main.ets`, A, and B total exactly 8 MiB in dependency traversal
order; imported C is the next dependency. This boundary makes C a deterministic
aggregate rejection rather than relying on approximate large-file sizes.

RED:

```text
node --test --test-name-pattern "cold dependency traversal admits aggregate bytes" tests/document-store-cancellation.test.mjs
not ok - cold dependency traversal admits aggregate bytes before reading and retries its frontier
C: openSync=1, fstatSync=2, allocUnsafe=1, readSync=3, closeSync=1
```

The old BFS loaded C completely and rejected it only after adding its byte
length. It also published the truncated A/B closure, which could permanently
hide C from closure-path invalidation.

GREEN:

```text
node --test --test-name-pattern "cold dependency traversal admits aggregate bytes" tests/document-store-cancellation.test.mjs
ok - cold dependency traversal admits aggregate bytes before reading and retries its frontier
C initial attempt: openSync=1, fstatSync=1, allocUnsafe=0, readSync=0, closeSync=1
```

The BFS passes its remaining aggregate bytes into the transactional loader. A
budget-exceeded outcome neither enters the result nor publishes a byte-truncated
dependency closure. After A shrinks and its exact watcher delta is applied, the
same store reads C for the first time, publishes the now-complete closure, and
the next prepare is a warm closure hit without another C read.

### Truncated-closure mutation guard

The first regression alone was not discriminating: deleting the
`aggregateAdmissionComplete` cache guard could still pass because the test
changed A before its next prepare. The strengthened test now prepares again
immediately, without changing disk state. It requires another cold traversal
and another exact C rejection:

```text
dependencyClosureCacheHit=false
C repeated attempt: openSync=1, fstatSync=1, allocUnsafe=0, readSync=0, closeSync=1
```

With the production cache guard temporarily removed, this assertion was stably
RED with `dependencyClosureCacheHit=true`. Restoring the guard makes the repeat
GREEN and proves a byte-truncated frontier was not published as reusable state.
