# U2b ArkUI resource-watch diagnostic refresh RED

Date: 2026-09-03

Parent revision: `2d7a496c7459fcac86f7df40d4d8f418cce27822`

## Public contract

For an already-open ArkTS document that references a missing
`app.string.live_title` key:

1. the server publishes `arkui.resource.not-found` at the exact UTF-16 suffix
   range;
2. creating a matching watched `resources/<qualifier>/element/string.json`
   file republishes diagnostics for the unchanged document version and clears
   that diagnostic;
3. deleting the same watched resource file republishes the unchanged document
   version and restores the diagnostic.

The transcript sends no `textDocument/didChange`, close, or reopen between
these states. File mutation and `workspace/didChangeWatchedFiles` are the only
refresh inputs.

## Test topology

`tests/semantic/arkui-resource-watch-diagnostics.test.mjs` copies the immutable
fixture to a temporary workspace, bundles the real production server, and uses
framed stdio LSP through `LspProcess`. The initial base resource keeps discovery
complete while a second qualifier file is created and deleted. Notification
predicates, rather than sleeps, form the diagnostic barriers.

The fixture places a non-BMP emoji before the resource key and the assertion
protects its 0-based UTF-16 range. Every publication must retain document
version `1`, proving the refresh does not depend on a source edit.

## Stable RED

```text
node --test tests/semantic/arkui-resource-watch-diagnostics.test.mjs
# 0 passed, 1 failed
# Timed out waiting for LSP notification textDocument/publishDiagnostics
```

The initial missing-resource publication passes. After the resource file is
created and its type-1 watched event is delivered, the server never publishes
the expected cleared diagnostics (`await clearedDiagnostics`, line 95). The
delete/restoration assertions are present in the same lifecycle contract but
cannot yet be reached.

The failing layer is `bundle-e2e`; its explicit manifest registration is green:

```text
node --test tests/test-layer-manifest.test.mjs
# 2 passed, 0 failed
```

## Deliberate boundary

This RED does not add a timing assertion or infer TypeScript rebuilds from
latency. The LSP surface has no stable project-generation signal. The nearest
unit contract already verifies `invalidateArkUIResources(workspace)` changes
only the selected resource snapshot while preserving both workspaces'
TypeScript generations. A future production fix must keep that contract green.

No production code is changed in this slice.
