# R0a truthful project membership

Date: 2026-09-03

Parent revision: `34d0c5536278988a92ca33c6870faf07c2cc0cbc`

## Scope

This slice separates the project's source-path membership from the bounded
content snapshot returned by `SemanticDocumentStore.prepare(position, true)`.
It does not make the TypeScript host consume every member and does not enable
references or rename.

The public view now exposes `projectMembership` when workspace files were
requested:

- `paths`: the bounded, de-duplicated source membership;
- `status`: `complete` only when enumeration reached its natural end;
- `reason`: `path-count-limit`, `path-byte-limit`, or `enumeration-error` for a
  partial result;
- `revision`: a positive monotonic snapshot revision which stays stable while
  paths and truthfulness state stay unchanged.

The provisional production membership limits are 20,000 paths and 4 MiB of
UTF-8 path data per root. They are hard safety caps and require calibration by
the later large-workspace suite. Content remains independently limited to 256
documents and 8 MiB.

## RED to GREEN evidence

Focused command for each cycle:

```text
node --test --test-concurrency=1 tests/project-file-set-cache.test.mjs
```

Observed REDs and minimal GREENs:

1. A real temporary workspace with 301 `.ets` files failed because
   `view.projectMembership` was absent. GREEN introduced an explicit cached
   membership snapshot: all 301 paths are complete while only 256 document
   contents are loaded. An unchanged second prepare reuses the same revision
   without another directory enumeration.
2. With an injected `maxPaths: 128`, the store incorrectly reported the
   truncated set as complete. GREEN consumes only the first unique candidate
   beyond the limit, reports `partial/path-count-limit`, and uses a `Set` for
   linear-time de-duplication.
3. The default disk walker opened 162 directories before the store learned
   that a 128-path membership was partial. GREEN changed it to a lazy `Dir`
   iterator and stopped after at most 130 directory opens in the fixture.
4. A watched create changed membership paths without changing its revision.
   GREEN advances revisions for actual create/delete/status changes and for a
   rebuilt invalidated/root-dirty snapshot. Duplicate create, unknown delete,
   repeated prepare, and repeated opens beyond an unchanged partial limit do
   not create revision noise.
5. An enumerator exception escaped `prepare`. GREEN retains the bounded paths
   already known and reports `partial/enumeration-error`. Generator `finally`
   cleanup and a nested `opendir` failure both prove that open iterators and
   directory handles are released.

The path-byte case uses a lazy injected generator and confirms that the first
overflowing path immediately produces `partial/path-byte-limit` without
consuming a later candidate.

## Enumeration and invalidation invariants

- Enumeration stops on the first unique count or byte overflow; it never
  collects an unbounded candidate array.
- The default walker uses an explicit directory stack, avoiding recursive JS
  call-stack growth, and closes all remaining handles on normal completion,
  limit early-exit, or I/O failure.
- Any root or nested directory I/O failure is fail-closed as partial rather
  than being mistaken for a complete empty/subtree result.
- `invalidate(root)` discards only that canonical root; its next snapshot has
  a newer revision.
- Watched create/delete updates a cached membership and advances its revision
  only when paths or completeness state actually change.
- Root-dirty discards the old snapshot and forces re-enumeration; the previous
  complete snapshot cannot be returned afterward.
- A partial membership never becomes complete from incremental deletes because
  omitted members remain unknown.

## Verification

```text
pnpm check
node --test --test-concurrency=1 \
  tests/project-file-set-cache.test.mjs \
  tests/workspace-file-change-coordinator.test.mjs \
  tests/lsp-workspace-file-changes.test.mjs
```

Observed: typecheck passed; focused plus B4b regression suites passed `26/26`,
with zero failures, skips, todos, or cancellations.

## Follow-up boundary

R0b must teach the type host/global semantic operations to consume and validate
this membership. Until then, partial snapshots must not be used to claim
complete references or rename results, and those capabilities remain absent.

Remaining risks deliberately retained for later slices:

- The 20,000-path/4-MiB defaults are provisional until large-project
  calibration establishes realistic absolute and relative budgets.
- A cached complete snapshot still depends on watcher/catalog invalidation;
  environments that do not deliver changes require a later reconciliation
  policy.
- The subset retained after a limit is intentionally unspecified because disk
  iteration order is platform-dependent. Any completeness-sensitive consumer
  must reject `partial`, not operate on that subset.
- The iterative walker avoids JS recursion overflow and bounds breadth memory,
  but holds one directory handle per nesting level until that subtree closes;
  pathological filesystem depth remains constrained by OS descriptor limits.
- Revisions are monotonic only within one store lifetime and reset on dispose.
