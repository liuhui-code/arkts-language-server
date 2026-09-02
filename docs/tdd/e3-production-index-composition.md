# E3 production index composition: TDD evidence

- Parent revision: `d4fae08`
- Public boundaries: production `src/server.ts` LSP process and the protocol-v1
  sidecar child process

## Production composition RED/GREEN

```text
node --test tests/lsp-production-index.test.mjs
```

RED: the real server bundle returned `workspaceSymbolProvider: undefined`.
The persistent index and coordinator existed only in injected test servers.

GREEN: the production composition creates one multi-root resolver, one shared
semantic engine, one sidecar index/catalog adapter, and one workspace-symbol
coordinator. A framed LSP transcript now opens two workspace folders, receives
a terminal WorkDone task, searches both sidecar sessions, and proves that an
unsaved document in root B shadows its persisted row.

## Catalog adapter RED/GREEN

```text
node --test tests/index-catalog-adapter.test.mjs
```

RED: the public child-process driver failed with `index.start is not a
function`. GREEN: cataloging reuses the already initialized sidecar session,
routes `catalog/progress` by canonical workspace identity, buffers events that
arrive before the start acknowledgement, and maps truthful counters into the
editor-neutral progress contract. Two interleaved roots finish with independent
1/1 and 2/2 terminal states.

AbortSignal does not merely abandon the start response. It sends
`catalog/cancel { generation }` and waits for the `cancelled` terminal. A
separate RED showed that a sidecar which acknowledged cancel but omitted the
terminal left the public call pending until the outer test timed out. GREEN
bounds that post-cancel wait and returns a typed `SidecarTimeoutError`.

## Canonical URI identity regression

The strengthened production transcript initially returned three results
instead of two. Its request audit proved both sidecars received the open URI in
`excludedUris`; the client used `/var/...` while the canonical sidecar identity
used `/private/var/...`, so string filtering could not match.

The adapter now rebases changed, removed, and excluded URIs from the client
workspace root to the canonical sidecar identity, then rebases search results
back to the client URI space. The same two-root transcript passes and the root
B overlay appears exactly once at its unsaved line.

## Cold-start versus foreground deadlines

Under concurrent Rust release compilation, healthy child startup exceeded a
short foreground-request test deadline. Initialization now has its own
configurable budget (30 seconds by default); search/status/refresh retain the
15-second request deadline. Timeout tests set each budget explicitly, so they
still fail promptly without classifying a merely cold process as wedged.
