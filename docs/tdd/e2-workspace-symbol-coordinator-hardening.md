# E2 workspace-symbol coordinator hardening: TDD evidence

- Parent revision: `cb69598`
- Public boundary: exported `DefaultWorkspaceSymbolService`
- Focused command: `node --test tests/workspace-symbol-service.test.mjs`

## RED

The initial seven-scenario suite failed 0/7:

- one 750 ms workspace open blocked every ready root and open overlay (observed
  foreground delay: about 730 ms);
- index and semantic providers that ignored AbortSignal delayed cancellation
  for about 750 ms;
- an index that finished opening after disposal was never closed again;
- a failed workspace root and a failed open-document extraction were both
  reported as complete;
- an empty root set never emitted a terminal progress state;
- filtering an open document after the index limit starved the next valid
  persisted result.

Two follow-up tests also failed: cancellation during a delayed open leaked the
eventually opened session, and catalog failure reset observed 3/1/2 progress
counters to zero.

## GREEN

The focused suite passes 10/10. Search uses only roots that are ready now and
never joins background open operations. Abort is raced at the coordinator
boundary, so cancellation completes promptly even if a dependency is not
cooperative. Delayed opens close after disposal or cancellation.

Completeness is measured against all configured roots, overlay extraction
failure forces `partial`, and open URIs are sent to the index for exclusion
before its result limit. Empty workspaces report an immediate ready 0/0 state,
while degraded workspaces retain the last truthful counters.
