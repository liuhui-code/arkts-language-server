# P1 request-freshness first-cause preservation

## Scope and parent

- Parent revision: `f7042344e1e499caa2fd6d3d59d58b0db615ddcb`.
- Production scope: `src/lsp/request-freshness.ts` only.
- Public boundary: a real scripted language-server child process using
  Content-Length framed stdio.
- Contract: the first abort cause wins. A later event must not rewrite the LSP
  result selected by an earlier `didChange` or client cancellation.

## Deterministic feedback loop

The transcript uses the existing cancellation-resistant rename provider as a
manual gate. A mutation of a different document in the same workspace aborts
the workspace-scoped freshness lane without releasing the rename. A completed
follow-up completion request is the protocol-order barrier. Changing the query
document finally releases the original request.

No timeout or sleep is used to order either scenario.

## RED

The mutation-first scenario failed on the parent implementation:

```text
node --test \
  --test-name-pattern='a client cancel arriving after didChange preserves ContentModified as the first cause' \
  tests/lsp-workspace-global-freshness.test.mjs

expected: { code: -32801, message: 'Rename request is stale' }
actual:   { code: -32800, message: 'Request cancelled by client' }
```

This falsified transport reordering and early provider release. The root cause
was the cancellation-token callback unconditionally changing a mutable
`clientCancelled` boolean after the controller had already been aborted by the
workspace mutation.

## GREEN

Each active request now records a typed `RequestAbortReason` exactly once.
Every abort entry point uses the same first-write-wins helper. The controller's
reason is an exported `RequestAbortError` with a discriminating `kind`, while
remaining an `Error` for existing semantic providers. No caller parses
`Error.message`.

`FreshRequest.clientCancelled()` derives its answer from the typed
`AbortSignal.reason`. The two public result assertions protect classification,
and a focused driver assertion verifies both the exported error type and its
stable `kind` discriminator:

- `didChange` then client cancel remains `ContentModified (-32801)`;
- client cancel then `didChange` remains `RequestCancelled (-32800)`.

```text
node --test --test-name-pattern='first cause' \
  tests/lsp-workspace-global-freshness.test.mjs

3 passed, 0 failed

node --test tests/lsp-workspace-global-freshness.test.mjs

11 passed, 0 failed
```

The global repository gate was deliberately not run because the parallel
semantic-worker protocol slice was still editing uncommitted TypeScript. The
integration owner runs that gate after all slices settle.

## Remaining risk

The LSP classification is now order-correct, but a cancellation-resistant
provider still occupies resources until it cooperatively observes the signal
or otherwise finishes. Provider preemption belongs to the separate semantic
worker supervision work.
