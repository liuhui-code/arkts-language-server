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

The first slice covered project-membership enumeration and refresh. A refresh
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

## T4c-2 bounded I/O and dependency traversal

Owned-file parent revision: `7a34e7b3a87273d5e02989c294b542982364b280`.
Parallel commits advanced the shared branch while these cycles ran, but did not
overlap the three files owned by this slice.

### 4. Bounded disk-read cancellation

A real 160 KiB source read was constrained by an instrumented `fs.readSync`.
The first call returned 64 KiB and armed cancellation; the descriptor close
then threw a different cleanup error. Before bounded read checkpoints existed,
the store continued reading and returned normally:

```text
not ok 4 - disk reads checkpoint between bounded chunks, close on cancellation, and retry exactly
error: Missing expected exception.
tests 4; pass 3; fail 1
```

GREEN caps every read request at 64 KiB, checkpoints at chunk boundaries, and
rechecks cancellation before `safeRead` converts an ordinary filesystem error
to an unavailable source. Descriptor cleanup stays in `finally` without a
checkpoint, so its failure cannot replace an active cancellation. No second
chunk is read after cancellation, and a fresh attempt returns the exact bytes.

### 5. Cold dependency-prefix rollback

The next public `prepare` test imports A and B in order and arms cancellation
when A's descriptor closes. A checkpoint prevented B from opening, but A still
survived in the document cache, which made the retry skip its disk read:

```text
not ok 5 - cold dependency traversal rolls back a loaded prefix and retries the full closure
expected A open count: 2
actual A open count:   1
tests 5; pass 4; fail 1
```

GREEN wraps dependency traversal in a small undo log containing only touched
document records, cache bytes, the access clock, and the current closure entry.
Every BFS source/dependency boundary checkpoints. Cancellation restores the
loaded prefix and prior closure without copying the whole workspace cache; the
retry loads exact A/B content and only then publishes a reusable closure.

### 6. Warm closure validation

The final case warms Main/A/B, arms cancellation immediately after A's real
`stat`, and returns a guarded Stats object which fails if later fields are read.
Without a stat-boundary checkpoint, the guarded field error replaced the
cancellation:

```text
not ok 6 - warm closure validation cancels after A stat, preserves the closure, and later invalidates
caught: Error: used A stat after cancellation
tests 6; pass 5; fail 1
```

GREEN rechecks cancellation after `stat` and before its result is inspected;
the recovery catch also rechecks before returning `null`. B is not statted, the
warm closure remains reusable after cancellation, and a later real A edit still
invalidates and rebuilds that closure correctly.

`prepare` and `prepareDiskSnapshot` now checkpoint at entry and at the logical
exit barrier. That final barrier is before dependency-generation updates,
eviction, and one-shot changed/removed consumption; no cancellation point is
inserted inside that commit section.

## Regression evidence

```text
node --test tests/document-store-cancellation.test.mjs
tests 6; pass 6; fail 0; skipped 0; todo 0; cancelled 0

node --test tests/project-file-set-cache.test.mjs tests/workspace-file-change-coordinator.test.mjs
tests 37; pass 37; fail 0

node --test tests/lsp-call-hierarchy.test.mjs
tests 34; pass 34; fail 0

pnpm check
tsc --noEmit -p tsconfig.json: PASS

pnpm build
esbuild: PASS
```

The existing partial-refresh, stable-revision, watched create/change/delete,
bounded enumeration, LRU, and batched dependency invalidation contracts all
remain GREEN.

## Deferred T4c work

This is not yet end-to-end worker cancellation. A follow-up slice must prevent
workspace expansion from reading a file after the aggregate document budget is
already exhausted. Full worker composition, request-cell lifecycle, and
production stdio cancellation evidence remain separate integration work.
