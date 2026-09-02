# E1 workspace-symbol LSP boundary: TDD evidence

- Parent revision: `e5697ca`
- Public boundary: real Content-Length framed `workspace/symbol` requests

## RED

`node --test tests/lsp-workspace-symbol.test.mjs` failed 0/2: the server did
not advertise `workspaceSymbolProvider`, and the protocol returned method-not-
found (`-32601`) instead of mapping cancellation.

## GREEN

The same command passed 2/2 and `pnpm check` passed after introducing the
editor-neutral workspace-symbol service boundary. The LSP adapter now:

- starts the service from initialize roots without waiting for indexing;
- keeps opened/changed snapshots authoritative and removes overlays on close;
- maps symbols to protocol-native kinds without inserting synthetic status
  rows into search results;
- implements latest-wins, client cancellation, shutdown rejection, bounded
  result count, and source-free request logging;
- disposes the service exactly once with the semantic engine.
