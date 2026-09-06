# R0c-2 — Open-overlay and close consistency

Date: 2026-09-03

Initial tested parent: `423817a734ace41e2e3e246d14f17f3396e673b9`.
Other independent integration commits advanced `HEAD` while this uncommitted
slice was in progress.

## Scope

This slice makes the document store preserve every authoritative open overlay,
even when the set crosses the bounded 256-document disk snapshot window or a
different workspace triggers the 512-record cache eviction path. Closing an
overlay restores the underlying disk snapshot on the next prepare and exposes
a one-shot changed-path delta with a monotonically advanced workspace content
revision.

It does not advertise references or rename, change their contracts, or alter
the TypeScript service or LSP adapter.

## RED evidence

All vertical slices used the stable public `SemanticDocumentStore` interface
through the bundled test driver:

```text
node --test --test-concurrency=1 tests/project-file-set-cache.test.mjs
```

Observed failures before their minimal implementations:

1. With 260 synchronized files whose overlay text differed from disk, an
   ordinary `prepare(position, false)` returned only the current document:
   `1 !== 260`.
2. With 513 overlays in workspace A, preparing workspace B evicted the two
   oldest A overlays. Returning to A produced `511 !== 513`.
3. The first prepare after `close(Target.ets)` did read the disk text, but its
   `contentRevision` remained unchanged and no changed-path invalidation was
   observable.

No sleeps, polling, or private-field assertions are used.

## GREEN design

- Every prepare merges the canonical-root's open overlays into the engine view
  before considering the independently bounded disk snapshot. Overlay text is
  authoritative and overlay paths are stable-sorted.
- Open overlays are pinned and excluded from disk-cache eviction, including
  eviction caused by a request in another workspace. The 512-file/16-MiB caps
  continue to apply to evictable disk snapshots, not client-owned open text.
- Each synchronized overlay retains its canonical workspace identity. On
  close, the store drops that overlay, records its path as changed, and advances
  the root's content revision. The next prepare therefore reloads disk truth
  and gives the type engine an explicit invalidation barrier.
- `changedPaths` remains one-shot; `contentRevision` remains stable after the
  close transition has been observed.

## Verification

```text
node --test --test-concurrency=1 tests/project-file-set-cache.test.mjs
```

Final focused result: `17/17` passed, with zero failures, skips, todos, or
cancellations.

## Remaining risks

- Open overlays are intentionally correctness-pinned and therefore are not
  constrained by the disk snapshot cache limits. A later resource-policy slice
  should expose open-overlay count/bytes telemetry and define an explicit
  admission or degradation policy; silently substituting disk text is not an
  acceptable memory strategy.
- The store records a closed path as changed. A diskless unsaved file is absent
  from the prepared document contents, but pruning that path from an already
  cached membership snapshot is left to the membership/freshness slice.
- Symlink aliases that open the same physical file under multiple distinct
  document URIs remain a project-identity concern outside this slice.
