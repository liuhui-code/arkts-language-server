# P1 semantic cancellation scope

Date: 2026-09-06

Parent revision: `742a924fa3cca84fb8a659a5b994f64516f5e38b`

## Scope

This tracer bullet adds only the worker-side cancellation scope that a future
per-root semantic worker can inject into a TypeScript language-service host.
It does not connect the scope to `TypeScriptLanguageServiceEngine`,
`SemanticDocumentStore`, a worker endpoint, or the LSP request path.

The public surface is deliberately small:

- `hostToken` is one stable `ts.HostCancellationToken` object;
- `run(cell, operation)` owns exactly one active request cell and clears it in
  `finally` after synchronous or asynchronous completion;
- `checkpoint()` throws TypeScript's real `OperationCanceledException` for any
  terminal state.

The existing worker-protocol decoder remains the single runtime authority for
the exact four-byte `SharedArrayBuffer` shape and the four allowed cell states.
A malformed shape or state therefore fails closed with
`SemanticWorkerProtocolError`.

## RED to GREEN evidence

The first public-interface test was run before the module existed:

```text
node --test tests/semantic-cancellation-scope.test.mjs
not ok 1 - exposes one stable inactive TypeScript host token
ERROR: Could not resolve "./src/semantic/semantic-cancellation-scope.ts"
tests 1; pass 0; fail 1
```

The first minimal implementation exposed only one frozen, inactive host token.
The focused command then passed `1/1`.

The next slice required terminal-state entry rejection. Before `run` existed:

```text
not ok 2 - rejects every terminal request before entering its operation
TypeError: scope.run is not a function
tests 2; pass 1; fail 1
```

`run` then validated the cell, installed it for the request, checked it before
calling the operation, awaited the operation, and cleared the active cell in a
`finally` block. The focused command passed `2/2`.

The nested-request regression was independently RED because a nested `run`
replaced and then cleared the outer cell:

```text
not ok 3 - rejects a nested run without replacing the outer request
AssertionError: Missing expected rejection.
tests 3; pass 2; fail 1
```

An entry guard now rejects nesting before decoding or assigning the candidate
cell, leaving the outer cell authoritative. The focused command passed `3/3`.

The corruption regression changed an active cell to state `99` and returned a
normal value. It was RED because the value escaped without a final check:

```text
not ok 6 - fails closed when the active cancellation cell becomes corrupt
AssertionError: Missing expected rejection.
tests 6; pass 5; fail 1
```

The minimal correction added a post-operation checkpoint before exposing the
result. The remaining focused cases characterize the same public lifecycle:

- all three terminal states are visible through the stable host token;
- no active request means `false`, and an inactive checkpoint is a no-op;
- synchronous throws, asynchronous rejection, and a real TypeScript
  `OperationCanceledException` all clear the cell;
- invalid `ArrayBuffer`, zero/eight-byte shared buffers, and corrupt state are
  rejected without poisoning the next request;
- a cancelled first request retains its terminal state while a fresh second
  cell starts active, proving there is no cross-request cell leak.

Final focused evidence:

```text
node --test tests/semantic-cancellation-scope.test.mjs
tests 8; pass 8; fail 0; skipped 0; todo 0; cancelled 0
```

Type checking:

```text
pnpm check
exit 0
```

The test bundle exports the same bundled TypeScript constructor used by the
scope, so `instanceof TypeScriptOperationCanceledException` proves the thrown
object is TypeScript's class rather than an error with a matching name.

## Deferred integration

This slice is not production cancellation evidence. Follow-up work must still:

- return this stable token from `LanguageServiceHost.getCancellationToken()`;
- checkpoint project enumeration, dependency traversal, provider result
  mapping, and other owned long loops;
- make the worker dispatcher wrap document preparation, TypeScript preparation,
  the query, and response mapping in one `run` call;
- map the first cancellation cause from the request's retained cell and prove
  the real stdio ordering and responsiveness contract.
