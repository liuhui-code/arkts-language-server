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
- query-by-URI/version requests for the original 18-method allowlist;
- success responses with clone-safe values and error responses selected from a
  fixed code/message table.

The codec rejects extra/accessor/symbol properties, executable values,
`AbortSignal`, non-file or non-canonical URIs, cross-root file changes, invalid
numeric identities and malformed method-specific arguments. Query messages do
not carry document text. Enumerable data properties whose value is `undefined`
are omitted from JSON-like objects; root/array `undefined`, sparse arrays,
functions, symbols, bigint, accessors and non-plain prototypes fail closed
without invoking getters. Returned containers are fresh and deeply frozen; the
four-byte `SharedArrayBuffer` is the intentional exception at the data layer,
because its single `Int32` state remains atomically mutable.

Canonical file URIs must have one lexical identity: the original string must equal
`pathToFileURL(fileURLToPath(new URL(value))).href`. The exported no-throw
`isCanonicalSemanticWorkerFileUri` predicate is the single decoder entry point for this rule.
NUL, malformed percent escapes, encoded aliases of unreserved characters, percent-encoded
slash/backslash, remote authorities, queries and fragments are rejected. Canonical escapes such as
`%20` remain valid. This is lexical validation only; it is not filesystem realpath containment.

Hard limits are part of the exported protocol:

- document text: 4 MiB;
- request args: 256 KiB;
- serialized message: 8 MiB;
- URI: 16 KiB;
- workspace changes per root: 1,024;
- generic value depth/nodes: 32 / 65,536.

JSON-like args/results are canonicalized, deeply frozen and conservatively
measured in one iterative traversal. The envelope reuses the measured inner
wire byte count instead of serializing the full graph again. Text is scanned
once for raw UTF-8 and escaped JSON bytes, and a cancellation SAB contributes
its exact four data bytes. Oversized dense arrays are rejected from their
length before allocating an internal output array.

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

The adversarial follow-up started from `dce6b63c7195dc5b4706bff5192abcd707ac3501`.
REDs captured undefined object-property rejection, the too-small 4,096-node
ceiling and acceptance of encoded NUL/path separators. A pre-refactor
characterization proved sender canonicalization, real `MessageChannel`
structured clone, receiver revalidation and shared cancellation-state identity.

The canonical-identity follow-up started from
`3b12000db1bcba84165cdca573bce888a55d63c4`. Its first RED was `20/21`: the document
decoder accepted `file:///workspace/%41.ets`, even though it resolves to the same local path as
`file:///workspace/A.ets`. After that tracer became GREEN, the exported predicate test produced a
second RED at `21/22` with `TypeError: isCanonicalSemanticWorkerFileUri is not a function`.
The minimal implementation exported the predicate and routed document, request, workspace-root and
workspace-change decoding through it; a root `%77orkspace` alias is now rejected by the workspace
mutation boundary as well.

## GREEN

Focused behavior gate:

```sh
node --test tests/semantic-worker-protocol.test.mjs
```

Result: `22/22` passing, with no skipped, todo, cancelled or failed tests.
The cases include the exact 65,536-node and depth-32 boundaries, pathological
over-limit values, 1,000 inlay hints, 5,000 folding ranges, 4,096 formatting
edits, and representative completion/document-symbol graphs under 8 MiB.

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

The generic success-response codec proves clone safety, immutability and
budgets; it does **not** validate a result schema per semantic method. T5/T6
must add method/result correlation before trusting worker values. Realpath and
symlink containment also remain a T5/T6 filesystem-boundary responsibility.
Call-hierarchy methods were added after the original allowlist; CH/T6 must add
their request/result schemas with a protocol-version decision before routing
them through this worker. None of those follow-ups is claimed complete here.
