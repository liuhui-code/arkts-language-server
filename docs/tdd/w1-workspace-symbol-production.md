# W1a/W1c production workspace-symbol depth

Date: 2026-09-03

Parent revision: `061a46a20f36b0d26000cb2adb0f013b6c40ed74`

## Scope and public boundary

The test starts the production `dist/server.cjs` child process, communicates
over framed stdio LSP, and opens an unsaved `AllKinds.ets` overlay. The sidecar
path is deliberately unavailable so every asserted symbol must cross the
production TypeScript semantic engine and `DefaultWorkspaceSymbolService`
overlay path; the earlier scripted semantic kind fixture is not evidence for
this slice.

The disk source uses the `WorkspaceKind` prefix. The open version replaces it
with `OverlayKind`, which proves that the result is sourced from the unsaved
document rather than disk or persisted index state.

## W1a RED: constructor name range

The first public transcript requested an empty workspace-symbol query and
required all twelve public semantic kinds, stable ordering, exact LSP kinds,
containers, URI, and UTF-16 name ranges. Every declaration follows a non-BMP
emoji on its line.

RED command:

```text
pnpm build
node --test tests/semantic/workspace-symbol-production.test.mjs
```

Stable RED:

```text
0 passed, 1 failed, 0 skipped
constructor expected range 10:13-10:24
constructor actual range   10:13-10:13
```

The other eleven names and all twelve kinds were already correct. TypeScript's
navigation tree supplies a zero-length constructor `nameSpan` at the correct
start position, and the workspace overlay path passed that zero-length range
through unchanged.

## Minimal GREEN

The workspace overlay flattener now preserves every non-empty semantic
selection range. For a zero-length range only, it examines the already-open
document text at that exact line/UTF-16 character. It expands the end by the
UTF-16 length of `symbol.name` only when those source code units match the name
exactly; otherwise it retains the original range. There is no heuristic scan,
cross-line guess, or TypeScript semantic-core change.

Focused GREEN after adding the independent W1c slice:

```text
node --test tests/semantic/workspace-symbol-production.test.mjs
# 2 passed, 0 failed, 0 skipped
```

Workspace regressions:

```text
node --test tests/workspace-symbol-service.test.mjs tests/lsp-workspace-symbol.test.mjs
# 15 passed, 0 failed, 0 skipped
```

## W1c bounded result and resolve decision

A second production transcript replaces the overlay with 120 uniquely named
variables and queries their common prefix. It characterizes the existing
contract as exactly 100 deterministic results. Every returned item contains a
complete URI and exact UTF-16 name range and none contains opaque `data`.

This test was GREEN when introduced. The production request already passes a
hard limit of 100 to the workspace service, and its response uses complete
`SymbolInformation.location` values.

`workspaceSymbol/resolve` is intentionally not implemented or advertised:

- the local index and open-overlay paths already possess name, kind, URI,
  range, and container at query time;
- the bounded 100-item response has no expensive detail or payload that could
  be deferred;
- adding resolve would require opaque identity storage, lifecycle invalidation,
  freshness, cancellation, and installed-artifact coverage without reducing
  the current query work or response contract.

The server therefore keeps `workspaceSymbolProvider: true`, rather than
advertising `{ "resolveProvider": true }`. The existing deterministic protocol
test `maps workspace symbol cancellation and rejects requests after shutdown`
continues to own cancellation evidence.

Reconsider resolve only if a future index deliberately stores name-only hits,
location recovery becomes measurably expensive, or a remote/virtual workspace
cannot provide a complete Location within the bounded query budget.

## Remaining boundary

W1b must run selected struct/property/method kind and range assertions against
the immutable installed command. This slice does not alter the artifact
acceptance, feature matrix, layer manifest, or package scripts.
