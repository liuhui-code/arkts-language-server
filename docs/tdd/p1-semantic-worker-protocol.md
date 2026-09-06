# P1 semantic worker protocol TDD evidence

- Parent revision: `a21cbe1fbcc6a47e00d0f675fd3e67621318a897`
- Scope: versioned, bounded, data-only messages shared by a future semantic
  worker and supervisor
- Production integration: deliberately excluded from T2

## Contract

`src/semantic/worker-protocol.ts` owns one protocol version and validates
`unknown` before either thread may trust it. It exposes these immutable message
families:

- document `open`/`change`/`close` and per-root `workspaceFilesChanged`
  mutations;
- mutation acknowledgements carrying the exact applied revision;
- query-by-URI/version requests for all 18 `SemanticEnginePort` query methods;
- success responses with clone-safe values and error responses selected from a
  fixed code/message table.

The codec rejects extra/accessor/symbol properties, executable values,
`AbortSignal`, non-file or non-canonical URIs, cross-root file changes, invalid
numeric identities and malformed method-specific arguments. Query messages do
not carry document text. Returned containers are fresh and deeply frozen; the
four-byte `SharedArrayBuffer` is the intentional exception at the data layer,
because its single `Int32` state remains atomically mutable.

Hard limits are part of the exported protocol:

- document text: 4 MiB;
- request args: 256 KiB;
- serialized message: 8 MiB;
- URI: 16 KiB;
- workspace changes per root: 1,024;
- generic value depth/nodes: 32 / 4,096.

Cancellation states are `active`, `clientCancelled`, `contentModified` and
`supervisorDisposing`. Each request owns one exact four-byte shared cell. The
first terminal reason wins through `Atomics.compareExchange`; cells are never
reset or reused.

## RED

Initial tracer command:

```sh
node --test tests/semantic-worker-protocol.test.mjs
```

At the parent revision, esbuild failed with:

```text
Could not resolve "src/semantic/worker-protocol.ts"
```

Subsequent vertical REDs proved missing strict mutation validation, independent
text/message budgets, cancellation-cell semantics, the method allowlist,
executable/accessor rejection, the args budget, success/error response codecs,
response-boundary errors, mutation ACKs, and bounded workspace invalidation.
Each RED was made GREEN before the next behavior was introduced.

## GREEN

Focused behavior gate:

```sh
node --test tests/semantic-worker-protocol.test.mjs
```

Result: `14/14` passing, with no skipped, todo, cancelled or failed tests.

Type gate:

```sh
pnpm exec tsc --noEmit -p tsconfig.json --pretty false
```

Result: exit `0`.

## Deferred ownership

This slice does not allocate revisions, coalesce queued mutations, enforce
revision-gap ordering or release queries after an ACK. T3 must allocate a
mutation revision only when dispatching the canonical/coalesced mutation, then
wait for the matching epoch/appliedRevision ACK before dispatching a request
whose `requiredRevision` depends on it.

Restore begin/chunk/commit, overlay replay and non-replayable state remain T7.
The codec provides workspace source/resource invalidation, but T5 still owns
mapping `SemanticWorkspaceFileChangeBatch` to the per-root wire mutation and
applying it inside the worker.
