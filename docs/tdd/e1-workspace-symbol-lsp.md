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

## Progress slice

RED: the third transcript timed out waiting for
`window/workDoneProgress/create`; indexing started during initialize and had no
protocol-native status channel.

GREEN: indexing starts only after `initialized`. Unknown discovery totals use
an indeterminate begin event with no `percentage`; a known 1/3 update reports
33, ready reports 100, and the task ends. Percentages never decrease, a client
cancel signal reaches the editor-neutral service, and degraded/empty scans also
terminate instead of leaving a permanent 0% task.

## Default service and overlay authority

RED: after replacing the scripted all-in-one service with the production
coordinator, the public transcript could not build because the coordinator did
not exist. GREEN: the coordinator opens persisted indexes in the background,
starts catalog work without making search wait, queries every ready root, and
re-ranks/deduplicates the merged result. An opened snapshot shadows every
persisted row for its URI; its semantic document symbols remain searchable
while a deliberately delayed catalog is still running. Close removes only the
ephemeral overlay.

During this gate, three otherwise healthy child processes exceeded the old
two-second cold-process timeout while concurrent Rust/WASM work saturated the
machine; all were killed before `server.started`. The harness timeout is now
five seconds. The product latency assertion starts after initialize and still
requires the workspace query to finish in under 400 ms while the scripted
catalog remains busy, separating load-tolerant startup from foreground latency.

The focused uppercase-acronym transcript then failed because the initial
overlay ranker treated digits as uppercase characters (`Chat2BaseViewModel`
became `C2BVM`). GREEN excludes uncased characters, so `CBVM` matches the same
way as the Rust index ranker.
