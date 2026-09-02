# A2 push diagnostics evidence

- Parent revision: `035750f`
- Public boundary: real Content-Length framed LSP child process
- Capability note: this is LSP push diagnostics; the server does not advertise
  the unrelated pull-diagnostics `diagnosticProvider` capability.

## RED

All three focused transcripts timed out waiting for
`textDocument/publishDiagnostics` because the server never invoked its existing
TypeScript diagnostic engine:

```text
node --test tests/lsp-diagnostics.test.mjs
3 failed: Timed out waiting for LSP notification textDocument/publishDiagnostics
```

## GREEN slices

1. Opening an invalid ArkTS snapshot publishes an error with the captured
   document version, ArkTS source, and a non-empty source-mapped range.
2. A v1 invalid snapshot immediately superseded by valid v2 content publishes
   only the v2 empty replacement; no stale v1 notification may arrive later.
3. Closing a document cancels its delayed lane and publishes an unversioned
   empty list immediately; no late diagnostic may resurrect afterward.

The 75 ms lane coalesces typing bursts before invoking the synchronous semantic
engine. Publication additionally checks task identity, open-document version,
provider result version, and cancellation state.

Focused result: `3/3` passed.

## Integration-gate finding

The first `pnpm check:fast` attempt reached 28/29 and exposed an independent
gate-composition defect: the newly merged clean-install acceptance test ran two
full pnpm/Cargo builds concurrently with the fast LSP suite, causing a 2-second
initialize timeout. The release-only build test was then separated from the
fast semantic gate; the diagnostics tests themselves remained GREEN in that
run. After integrating the independent gate fix, `pnpm check:fast` completed
`27/27` with all three diagnostics transcripts GREEN.
