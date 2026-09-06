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

Pending its own RED/GREEN cycle and commit.
