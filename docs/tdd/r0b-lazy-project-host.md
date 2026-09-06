# R0b — Lazy project-membership TypeScript host

## Scope

This slice makes a truthful, complete `ProjectMembershipSnapshot` visible to the
TypeScript language-service host without copying every project file into the
resident `ScriptRecord` cache. It does not enable references or rename.

The initial production parent used for the real stdio RED was
`c4debfe44438b1a532b2bd4a17f625f8963aaca0`. Unrelated integration commits
advanced `HEAD` while the uncommitted slice was in progress.

## RED evidence

All failures were observed with:

```sh
node --test tests/semantic/project-membership-language-service.test.mjs
```

The vertical failures were:

1. After a fresh `pnpm build`, a workspace containing 300 filler `.ets` files
   returned `[]` instead of the exported `ZzzRemoteTarget` outside the
   256-document resident window.
2. The controlled lazy-cache contract failed with
   `engine.cacheState is not a function`.
3. A real stdio definition into a lazy target containing an emoji before an
   ArkTS `struct` returned columns `13..28` instead of the exact source columns
   `14..29`.
4. After a real `workspace/didChangeWatchedFiles` `changed` event for that lazy
   target, completion returned zero entries for the new exported class because
   TypeScript retained the old program snapshot.
5. A complete membership replacing an earlier resident-only view still offered
   a class absent from the new membership (`true !== false`).
6. Stable host-file-name reuse failed with
   `engine.scriptFileNames is not a function`.
7. The partial-state contract omitted the fail-closed
   `path-count-limit` reason.
8. A deleted-path delta removed the path from the membership `Set` but left it
   in the stable `getScriptFileNames()` array (`true !== false`).

No sleeps or timing guesses are used. Each stdio request/response is the event
barrier, and `LspSession.close()` performs bounded `shutdown` then `exit`.

## GREEN design

- `getScriptFileNames()` consumes only a `complete` membership. A `partial`
  membership discards the previous global view and its lazy snapshots.
- Complete membership and SDK file names are materialized once per membership
  revision. Repeated preparation with the same revision returns the identical
  stable array. Only resident paths absent from membership are merged, and that
  set is bounded by the existing 512-script/16-MiB resident limits.
- Unopened sources are read only when TypeScript requests their snapshots.
  `.ets` sources use the same ArkTS virtual transform as resident documents.
- The lazy LRU is hard-bounded to 128 files and 8 MiB by default. Tests inject a
  two-file/256-byte bound. Hits refresh `Map` insertion order and eviction takes
  the oldest key without sorting the cache on the hot path.
- Cache byte accounting conservatively includes both source and generated text.
  An individual oversize snapshot is returned for the active request but is not
  retained.
- Lazy records retain their `ArktsVirtualDocument`, so generated TypeScript spans
  map back to exact UTF-16 source ranges for unopened ArkTS definitions.
- Workspace membership revision continues to mean file-set truth only. Watched
  content changes advance a separate per-root `contentRevision` and expose a
  bounded, one-shot `changedPaths` delta. The host invalidates only those paths
  and assigns path-local content versions; unchanged members keep stable script
  versions.
- Removed paths and complete-membership replacements clear resident scripts,
  lazy snapshots, per-path content versions, and the stable host file-name
  view. Batched removals rebuild that array once. A changed-path overflow causes
  the existing one-shot type-engine reset rather than silently keeping stale
  state.

## Verification

Focused and regression commands:

```sh
pnpm build
node --test tests/semantic/project-membership-language-service.test.mjs
node --test tests/project-file-set-cache.test.mjs tests/workspace-file-change-coordinator.test.mjs
pnpm check
```

The project-membership suite covers the real 300+ file stdio tracer, exact
completion replacement, exact lazy UTF-16 definition range, watched content
replacement, injected lazy bounds, stable file-name identity, membership
replacement, and partial fail-closed behavior.

## Explicit remaining risks

- The TypeScript language-service API is synchronous. First semantic use can
  still read many project files and build a TypeScript Program; the program's
  AST memory is managed by TypeScript and is not bounded by this snapshot LRU.
- Default limits (128 lazy snapshots / 8 MiB) need calibration against a checked
  in large-workspace corpus and installed-artifact telemetry.
- Correctness depends on editor watched-file events after the initial catalog.
  Filesystem watcher ownership, missed-event reconciliation, and background
  catalog deltas remain separate work.
- `contentRevision` invalidates named paths; a root-dirty overflow deliberately
  resets the whole type engine. No TTL or periodic full rescan is introduced.
- References and rename remain disabled until their own complete/partial,
  cancellation, stale-version, memory, and installed E2E contracts are green.
