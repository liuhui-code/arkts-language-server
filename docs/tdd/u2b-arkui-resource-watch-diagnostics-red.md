# U2b ArkUI resource-watch diagnostic refresh RED → GREEN

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

The RED commit changed no production code; the following GREEN commit owns the
production change described below.

## Root cause

The watcher coordinator correctly classified ArkUI resource paths while
accepting an event, but that domain information was discarded when it emitted
the workspace batch. The semantic engine invalidated its resource snapshot,
yet the LSP layer did not schedule diagnostics for already-open documents.
Invalidation therefore only became visible after a later source edit, close,
or reopen.

## Minimal GREEN

- `WorkspaceFileChangeBatch.resourceChanged` preserves the classification made
  once at the watcher boundary, including bounded-overflow batches.
- The semantic engine continues to invalidate only the affected workspace's
  ArkUI resource snapshot.
- After invalidation, the LSP layer reschedules the existing debounced,
  version-checked diagnostic pipeline only for open documents in affected
  workspaces that can contain a direct `$r` reference.
- A count-only structured log records affected workspaces and scheduled open
  documents without emitting source paths or contents.

## GREEN evidence

```text
node --test tests/workspace-file-change-coordinator.test.mjs \
  tests/semantic/arkui-resource-watch-diagnostics.test.mjs
# 14 passed, 0 failed, 0 skipped

node --test --test-concurrency=1 \
  tests/lsp-workspace-global-freshness.test.mjs \
  tests/lsp-workspace-file-changes.test.mjs \
  tests/workspace-file-change-coordinator.test.mjs \
  tests/semantic/arkui-resource-watch-diagnostics.test.mjs
# 24 passed, 0 failed, 0 skipped

node --test --test-concurrency=1 \
  tests/lsp-diagnostics.test.mjs \
  tests/semantic/diagnostic-code-characterization.test.mjs \
  tests/semantic/arkui-diagnostics-depth.test.mjs \
  tests/semantic/arkui-language-features.test.mjs \
  tests/semantic/arkui-builder-tail.test.mjs
# 31 passed, 0 failed, 0 skipped

pnpm check
# exit 0
```

The existing two-workspace unit contract remains the direct evidence that a
resource-only change does not advance the TypeScript engine generation.
