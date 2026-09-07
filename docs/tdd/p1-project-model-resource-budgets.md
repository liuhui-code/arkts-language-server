# P1 project-model and resource-directory budgets

Parent revision: `ed069cf5075992b7afd8821ffd12328a9a4fd7ea`, with the current
uncommitted P1 module/target model and resource-scope integration as the parent
implementation. This slice does not replace the real stdio module-resource
acceptance tests.

## Public contracts

`tests/harmony-project-model-budget.test.mjs` bundles the public
`HarmonyProjectModel` and `ArkUIResourceIndex` APIs through an independent driver.
Filesystem instrumentation observes resource admission without inspecting private
caches. Each contract was added and run separately.

- After a ready scope is loaded, 100 queries perform no profile reads or directory
  enumeration. Physical source ownership may still be checked.
- A project profile larger than 64 KiB is unavailable before content reads.
- More than 256 module declarations are unavailable before physical path probes.
- Invalidating after removing/restoring a module gives the same scope as a fresh
  model, including empty resource roots for an unavailable scope. Watcher/rootDirty
  production wiring is covered separately by stdio tests.
- Resource directory enumeration retains at most the configured directory-entry
  limit plus one overflow sentinel; overflow preserves `partial` and no results.
- A resource-root symlink to the immediate module parent is rejected before
  directory enumeration.
- A directory read failure closes the opened handle and returns `unavailable`.

## RED → GREEN

Command for each cycle:

```sh
node --test tests/harmony-project-model-budget.test.mjs
```

Directory admission RED: with `maxDirectoryEntries: 3` and 40 actual files, the
public query returned `partial` but had materialized 40 directory entries. The
assertion allowed at most four. Production now uses `opendirSync`/`readSync`, stops
at the limit plus one, and closes in `finally`. Node's internal buffer is separately
bounded to `min(32, limit + 1)`. Admitted entries retain the prior deterministic
sorting and total traversal/file/resource budgets.

Physical containment RED: the immediate-parent symlink returned `ready` instead
of `unavailable`. `isInside` now explicitly excludes the exact `..` relative path.

Final GREEN: seven tests passed, zero failed/skipped/todo. `pnpm check` passed.
No production server bundle or full test gate was run by this slice.

## Boundaries and remaining risks

These are deterministic admission and cache contracts, not elapsed-time or RSS
benchmarks. The profile/module limits do not establish a workspace-wide root-string
or heap budget. The current per-workspace resource provider may still lose its warm
snapshot when switching module scopes. Resource content reads still use a
stat-then-read path; the directory fix does not address files growing between those
operations. Those require separately scoped evidence before further changes.
