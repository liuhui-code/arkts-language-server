# P1 Call Hierarchy reliability evidence

## Scope

This slice supplies protocol evidence for the three Call Hierarchy requests:

- `textDocument/prepareCallHierarchy`
- `callHierarchy/outgoingCalls`
- `callHierarchy/incomingCalls`

The public boundary is a real bundled child process speaking Content-Length
framed LSP over stdio. The follow-up item is a bounded LSP `CallHierarchyItem`
with a canonical physical `file:` URI and the versioned
`arktsCallHierarchy` route containing the configured canonical root. Reaching
the scripted semantic barrier therefore also proves that source-authority
resolution accepted the item before semantic execution.

## Contract

For every request:

1. a client `$/cancelRequest` received while semantic execution is active
   returns `RequestCancelled` (`-32800`) and no result;
2. a `didChange` received while a cancellation-resistant semantic execution is
   active returns `ContentModified` (`-32801`) and no item/call result;
3. a request sent after an acknowledged `shutdown` returns `InvalidRequest`
   (`-32600`).

The tests register a `window/logMessage` waiter before sending each request and
do not send cancellation or `didChange` until the semantic method announces its
entered barrier. Transport timeouts are failsafes against a hung child, never
ordering primitives.

The scripted result items carry an internal SHA-256 source fingerprint so the
production source-authority boundary can validate their exact source bytes.
That fingerprint is not included in the client-supplied LSP follow-up item and
is never serialized back to the client.

## RED → GREEN record

The branch advanced concurrently while this isolated test slice was developed.
The first two RED observations used parent `7a34e7b`; the remaining RED
observations used parent `5bb65fa`.

### Client cancellation

Each focused test initially timed out waiting for its protocol-visible entered
barrier because the scripted engine did not implement that method. The server
had already completed the request with an internal error.

```text
node --test --test-name-pattern='maps prepareCallHierarchy client cancellation' tests/lsp-call-hierarchy-reliability.test.mjs
RED: 0 pass, 1 fail (missing prepare semantic barrier)

node --test --test-name-pattern='maps outgoingCalls client cancellation' tests/lsp-call-hierarchy-reliability.test.mjs
RED: 0 pass, 1 fail (missing outgoing semantic barrier)

node --test --test-name-pattern='maps incomingCalls client cancellation' tests/lsp-call-hierarchy-reliability.test.mjs
RED: 0 pass, 1 fail (missing incoming semantic barrier)
```

One method at a time gained only an entered notification and an abort-aware
promise. The same commands then passed individually and asserted the exact
`-32800` response with no result.

### Content freshness

Each cancellation-resistant test was added separately. Before its corresponding
barrier/release behavior existed, it timed out waiting for the entered
notification; outgoing and incoming had already leaked a successful result.

```text
node --test --test-name-pattern='rejects cancellation-resistant prepareCallHierarchy' tests/lsp-call-hierarchy-reliability.test.mjs
RED: 0 pass, 1 fail

node --test --test-name-pattern='rejects cancellation-resistant outgoingCalls' tests/lsp-call-hierarchy-reliability.test.mjs
RED: 0 pass, 1 fail

node --test --test-name-pattern='rejects cancellation-resistant incomingCalls' tests/lsp-call-hierarchy-reliability.test.mjs
RED: 0 pass, 1 fail
```

Each method then gained a cancellation-resistant promise released only by the
fixture's document lifecycle. All focused commands passed and proved the real
server discarded the deliberately returned item/call as `-32801` after
`didChange`.

### Shutdown

The post-shutdown test was a characterization of the already-shared lifecycle
guard and was GREEN on first execution. It sends legal parameters for all three
methods after an acknowledged shutdown and asserts exact `-32600` responses.

```text
node --test --test-name-pattern='rejects every call hierarchy request after shutdown' tests/lsp-call-hierarchy-reliability.test.mjs
GREEN: 1 pass, 0 fail
```

## Final verification

```text
node --test tests/lsp-call-hierarchy-reliability.test.mjs
GREEN: 7 pass, 0 fail

node --test tests/lsp-call-hierarchy-reliability.test.mjs tests/lsp-semantic-request-reliability.test.mjs
GREEN: 18 pass, 0 fail

pnpm check
GREEN

pnpm build
GREEN (dist/server.cjs, 10.2 MB reported by esbuild)
```

The new test is intentionally not registered in the layer manifest here; that
registration is owned by the integration slice.

## Explicit limit

This evidence proves LSP cancellation mapping, workspace freshness, response
suppression, and shutdown gating. The scripted engine is asynchronous and can
observe an `AbortSignal`; these tests do **not** claim that a currently
synchronous TypeScript language-service call can be preempted internally.
