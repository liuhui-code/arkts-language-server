# B4a bounded ProjectSet cache

Date: 2026-09-03

Parent revision: `6a59940a46af985e4e95e0052b2cb4ad4faea2fb`

## Scope

`SemanticDocumentStore.prepare(position, true)` now reuses a bounded source-path
set for an unchanged workspace instead of synchronously walking the same
directory tree for every completion. The cache uses the canonical workspace
identity as its key while preserving the lexical root passed to enumeration, so
opened `/var/...` documents are not mixed with discovered `/private/var/...`
paths on macOS.

This slice deliberately adds no TTL, `fs.watch`, catalog subscription, or
automatic discovery of newly created unopened files.

## RED to GREEN evidence

Focused command for every cycle:

```text
node --test --test-concurrency=1 tests/project-file-set-cache.test.mjs
```

The public store-boundary driver injects the workspace source enumerator. The
following behaviors were added one at a time:

1. RED: consecutive unchanged prepares performed two directory reads instead
   of one (`actual 2`, `expected 1`). GREEN: one cached enumeration per
   canonical root.
2. RED: `store.invalidate` did not exist. GREEN: invalidating one root caused
   only that root to enumerate again (`[2, 1]`).
3. RED: an opened unsaved `Unsaved.ets` overlay was absent from the cached
   project view. GREEN: `sync` adds a source overlay to an existing matching
   root without another enumeration.
4. RED: a configured two-path limit returned three paths. GREEN: cached paths
   are capped at the configured value and never above the production maximum.
5. RED: a configured path-byte budget retained a second path beyond the
   budget. GREEN: UTF-8 path bytes are accumulated before caching.
6. RED: a configured two-root cache retained all three roots. GREEN: root
   entries use access-order LRU eviction.
7. RED: `store.dispose` did not exist. GREEN: dispose clears document,
   dependency, generation, and ProjectSet caches; the next prepare enumerates
   again.

An additional alias-root regression first failed because the enumerator was
given the canonical realpath. It now proves that a symlink alias and its real
root share one cache entry while enumeration retains the original lexical root.

Final results:

```text
node --test --test-concurrency=1 \
  tests/project-file-set-cache.test.mjs \
  tests/test-layer-manifest.test.mjs
```

Observed: 9 passed, 0 failed, 0 skipped. `pnpm check` also passed.

## Cache and invalidation contract

- Identity: canonical root, with lexical source paths preserved.
- Default hard bounds: 4 roots; 256 paths per root; 1 MiB of UTF-8 path bytes
  per root. Injected test limits may only reduce these maxima.
- Replacement: access-order least-recently-used root eviction.
- Explicit refresh: `invalidate(rootPath)` removes only that root's ProjectSet.
- Open overlays: `sync` immediately incorporates an in-root `.ets` or `.ts`
  source when that root is already cached.
- Cleanup: `dispose()` clears every store cache and accounting counter.

## B4b follow-up

New unopened files remain invisible until explicit invalidation. B4b must wire
workspace watcher or catalog deltas to `invalidate(rootPath)` (or a future
incremental add/remove API) and add create/delete/rename E2E coverage. B4a does
not claim that behavior.
