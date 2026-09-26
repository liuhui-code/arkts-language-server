# References index resynchronization

Parent revision: `4a12f1a`. This slice implements F5 / R-08 without changing
the semantic authority or returning index-only references.

## RED

The production-composition transcript initialized two workspaces, completed
their catalogs, sent `workspace/didChangeWatchedFiles` for a project profile,
and required a third `catalog/start`. It timed out because watched changes did
not refresh the sidecar:

```text
node --test tests/lsp-production-index.test.mjs
not ok - timed out waiting for catalog start
```

A second framed-LSP transcript ran indexed references, changed an ETS source,
allowed the safe legacy fallback, waited for catalog generation 2, and queried
again. It observed only one `references.index.accepted` event instead of two:

```text
pnpm build && node --test tests/semantic/references-index-resync.test.mjs
AssertionError: 1 !== 2
```

This proved the previous dirty-root set made fallback permanent even after the
sidecar had committed newer data.

## GREEN

`DefaultWorkspaceSymbolService` now schedules catalog refreshes and coalesces
changes that arrive during an active catalog. `ReferenceIndexFreshness` owns
the last accepted generation and mutation baseline. It clears dirty state only
for a ready `committedGeneration` strictly greater than the baseline; status
errors and non-advancing generations remain conservative.

The public transcript verifies:

```text
indexed generation 1
→ watched ETS mutation
→ complete legacy fallback
→ catalog generation 2 commits
→ indexed recovery
→ exact pre/post Location equality
```

Focused verification:

```text
pnpm check
pnpm build
node --test tests/lsp-production-index.test.mjs \
  tests/semantic/references-index-resync.test.mjs \
  tests/semantic/references-batching.test.mjs \
  tests/test-layer-manifest.test.mjs
```

All 20 focused tests passed. The new handwritten test is 136 lines. The
existing over-limit `run-language-server.ts` remains 838 lines and
`semantic-worker-proxy.ts` decreases from 998 to 996 lines; neither debt file
grew.
