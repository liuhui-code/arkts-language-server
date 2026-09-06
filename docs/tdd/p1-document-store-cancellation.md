# P1 DocumentStore transactional cancellation

Date: 2026-09-06

Parent revision: `f064358b3e0f825033b4513d87cd8e30de2155da`

## Scope

This first T4c tracer slice gives `SemanticDocumentStore` a small core-owned
cooperation port:

```ts
export interface SemanticOperationControl {
  checkpoint(): void
}
```

The injected control is stored as an object, with a shared no-op object as the
default. Core workspace code does not depend on the semantic worker,
`SharedArrayBuffer`, or TypeScript. A later composition slice can therefore
inject the request-scoped cancellation implementation without reversing the
dependency direction.

This slice covers project-membership enumeration and refresh only. A refresh
now scans into a local candidate, computes its delta while the previous cache
entry remains authoritative, performs a final checkpoint, and then applies the
non-interruptible reconciliation and cache commit. A partial candidate never
infers removals.

## RED to GREEN evidence

### 1. Custom enumerator cleanup and retry

The public test uses a custom generator which arms cancellation while it is
being consumed and throws a different error from `finally`. Before the
cooperation port and enumeration checkpoints existed, cancellation was not
observed:

```text
node --test tests/document-store-cancellation.test.mjs
not ok 1 - membership cancellation closes enumeration, preserves cancellation, and retries completely
error: Missing expected exception.
tests 1; pass 0; fail 1
```

GREEN adds a checkpoint for every yielded source and rechecks the operation
control before the recoverable enumeration catch degrades an ordinary failure
to partial membership. The cancellation object remains the first cause, the
iterator is closed, no candidate is published, and a fresh attempt completes:

```text
tests 1; pass 1; fail 0
```

### 2. Transactional refresh

The second case changes a cached source and arms cancellation when the refresh
scan finishes. The old implementation published the replacement membership
before reconciliation and did not observe cancellation:

```text
not ok 2 - cancelled membership refresh keeps the old snapshot authoritative and retries the delta
error: Missing expected exception.
tests 2; pass 1; fail 1
```

GREEN separates local scanning from publication. A cancelled scan leaves the
old membership revision, content revision, and pending-change state intact.
After cancellation is cleared, the next refresh still detects the changed disk
identity, invalidates the cached disk record, and reports the change once:

```text
tests 2; pass 2; fail 0
```

### 3. Default directory walker

The third case cancels on a non-source entry while both a workspace directory
and a nested directory are open. It also makes the first cancellation cleanup
throw a distinct close error. Before the walker checked each directory entry,
the operation was observed only after normal cleanup:

```text
not ok 3 - default workspace walking cancels on non-source entries and closes every directory
error: cancellation must occur before directory cleanup
tests 3; pass 2; fail 1
```

GREEN passes the same operation control into the default walker and checks it
for every directory entry, including ignored and non-source entries. The
walker's `finally` closes all outstanding handles; the outer recoverable catch
rechecks cancellation so a cleanup error cannot replace the cancellation
cause. A retry then publishes complete membership:

```text
node --test tests/document-store-cancellation.test.mjs
tests 3; pass 3; fail 0; skipped 0; todo 0; cancelled 0
```

## Regression evidence

```text
node --test tests/project-file-set-cache.test.mjs tests/workspace-file-change-coordinator.test.mjs
tests 35; pass 35; fail 0; skipped 0; todo 0; cancelled 0

pnpm check
tsc --noEmit -p tsconfig.json: PASS
```

The existing partial-refresh, stable-revision, watched create/change/delete,
bounded enumeration, LRU, and batched dependency invalidation contracts all
remain GREEN.

## Deferred T4c work

This is not yet end-to-end worker cancellation. Follow-up vertical slices must
add transactional checkpoints to document preparation, disk reads, dependency
closure traversal and cached-closure validation. Read cancellation must retain
the cancellation cause across filesystem recovery and close failures, use
bounded chunks, and avoid admitting a file after the aggregate document budget
is already exhausted. Worker composition and request-cell lifecycle remain
separate integration work.
