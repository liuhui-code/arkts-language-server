# H5a bidirectional JSON-RPC message routing TDD evidence

- Parent revision: `f235d93204b75fd3cb68bdbba187dc0de21655eb`
- Scope: distinguish responses, server requests, and notifications in the real
  child-process LSP driver
- Excluded: progress-token handling, automatic server-request replies, message
  validation, and production language-server behavior

The fixture child writes four valid frames in order: a server request with
`id + method`, a client response with the same id and no method, a notification
with the same method and no id, and a final ready notification. Waiting for the
ready frame guarantees the preceding messages are queued without a timing
sleep. The selectors are then intentionally called in adversarial order:
`response()`, `notification()`, and `serverRequest()`.

## RED

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: H1 through H4 passed, but H5a failed at the first selector. The old
`response(85)` matched only by id and returned the server request:

```text
actual.method: fixture/route
actual.params.kind: server-request
expected.result.kind: client-response
```

The focused run completed in about 1.20 seconds.

## GREEN

The driver now classifies messages by JSON-RPC shape:

- response: owns `id` and does not own `method`;
- server request: owns `id` and has a string `method`;
- notification: does not own `id` and has a string `method`.

`response()` and `notification()` apply their type guard before id, method, or
predicate matching. The new `serverRequest(method, predicate?, timeoutMs?)`
uses the server-request guard for both queued and future messages.

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `6/6` passing. H5a completed in about 130 ms and the full focused run
in about 1.12 seconds.

## Existing progress-request caller migration

Integration review found four callers in three suites that intentionally used
the old, structurally incorrect selector for `window/workDoneProgress/create`.
That method is a server-to-client request with an id, not a notification.

RED commands:

```sh
node --test tests/lsp-production-index.test.mjs
node --test tests/lsp-workspace-symbol.test.mjs
```

The production-index case timed out waiting for an LSP notification. The
workspace-symbol suite was rerun with permission to generate its scripted
server in `dist`; three cases passed and its progress case failed with the same
five-second timeout. The first combined sandboxed attempt also recorded a
separate `dist/scripted-semantic-server.cjs: operation not permitted` build
restriction, which was not a product failure.

The affected calls in `lsp-production-index`, `lsp-workspace-symbol`, and both
cold/warm paths of `release/local-delivery.acceptance` now use
`serverRequest()`.

GREEN commands:

```sh
node --test tests/lsp-workspace-symbol.test.mjs tests/lsp-production-index.test.mjs
node --check tests/release/local-delivery.acceptance.mjs
```

Result: the two real-process suites passed `5/5` in about 3.46 seconds, and the
release acceptance file passed Node syntax validation.
