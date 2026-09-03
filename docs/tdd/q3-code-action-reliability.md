# Q3 code-action reliability

Date: 2026-09-03

Parent revision: `599b23ac4995ebfba307efef6a542ea4b5dbf0fb`

## Scope

This slice closes the trust, staleness, cancellation, and supersession behavior
around the Q1/Q2 spelling quick-fix tracer. It does not advertise
`codeActionProvider`, add another TypeScript fix family, or change the bounded
resolution-store representation.

All protocol assertions use real Content-Length framed child processes. The
production tracer uses `dist/server.cjs --stdio`; cancellation and
supersession use the production LSP adapter with an injected scripted semantic
port.

## Protocol error evidence

Context7 resolved the official library to
`/microsoft/vscode-languageserver-node`. It confirmed that a per-request
CancellationToken is delivered to the handler and that a thrown
`ResponseError` is preserved in the response, but its documentation search did
not return the exact LSP error-code declarations. The installed, version-locked
protocol 3.17.5 declarations and runtime constants were therefore used as the
exact authority:

- JSON-RPC `InvalidParams`: `-32602`;
- LSP `RequestCancelled`: `-32800`;
- LSP `ContentModified`: `-32801`.

The protocol declaration describes `RequestCancelled` as client cancellation
detected by the server and `ContentModified` as the server detecting that the
document content changed. These meanings define the Q3 error boundary.

## Unknown and forged identifiers

The real-process test sends both a syntactically valid but unissued UUID and a
malformed data object with an extra client field. Both return `InvalidParams`
with `Code action is unknown`, no result, and no edit.

This test was GREEN when introduced because the bounded Q-store and Q2 adapter
already enforced the exact UUID-only shape. It is recorded as a
characterization gate, not as a claimed defect RED.

## Issued but stale identifiers: RED to GREEN

The production test lists a real TS2552 spelling action, then separately:

1. sends `didChange` version 2 and waits for its versioned diagnostic
   publication; or
2. sends `didClose` and waits for the empty diagnostic publication.

It then resolves the previously issued UUID. Initial focused RED was:

```text
6 passed, 1 failed
change: expected -32801, actual -32602
```

The minimum production change preserves `InvalidParams` for unknown data but
maps the store's payload-free `stale` tombstone to
`LSPErrorCodes.ContentModified`. After a fresh bundle, both change and close
branches passed and the real suite was `7/7` GREEN.

## Canonical server output

The happy resolve tracer now replaces the client's title, kind, diagnostics,
edit, and command with forged values while retaining only the issued UUID. It
was GREEN on introduction: resolve returns the registry's original title,
`quickfix` kind, exact TS2552 diagnostic, and versioned server edit, with no
command. This is also a characterization of the already-correct Q2 trust
boundary.

## Client cancellation: fixture RED to GREEN

The cancellation test registers a `window/logMessage` waiter before sending
resolve and waits until the scripted semantic provider reports that it has
entered. Only then does it send `$/cancelRequest`; no sleep or timing race is
used.

The first targeted run was RED at the missing test seam:

```text
-32603: semantic2.codeActions is not a function
```

Minimal GREEN added scripted list and resolve methods. The resolve provider
reports its entered barrier and waits on the real AbortSignal. The final reply
is `RequestCancelled` (`-32800`) with no result or edit; the targeted test
passed `1/1`.

## Stale and same-lane supersession

One scripted test waits for the same entered barrier, sends `didChange`, and
asserts `ContentModified` with no result. A stronger test uses a deferred
provider that deliberately ignores the first request's AbortSignal. The first
resolve emits an entered barrier and remains pending; a second resolve in the
same URI/method lane is the deterministic release command.

Before the deferred behavior existed, the new test was stably RED waiting for
the missing `scripted resistant resolve entered` notification. GREEN proves:

- the second/current resolve returns the version-1 edit;
- the cancellation-resistant late first result is discarded by request
  freshness;
- the first request returns `ContentModified`, never an edit.

The barriers are notifications and deferred release events. There are no fixed
synchronization sleeps; waiter deadlines are failure guards only.

## Lifecycle and verification

Shutdown/exit need no additional unobservable black-box hook. The existing
CodeActionResolutionStore contract proves that `clear()` removes active records
and tombstones, while the server lifecycle already invokes that clear exactly
once through its shared disposal path.

Commands and final results:

```text
node --test tests/code-action-resolution-store.test.mjs
# 8/8 passed, 0 skipped

node --test tests/lsp-reliability.test.mjs
# 11/11 passed, 0 skipped

node --test tests/semantic/diagnostic-code-characterization.test.mjs
# 7/7 passed, 0 skipped

pnpm check
# GREEN, no TypeScript errors
```

The first sandboxed full reliability run could not overwrite the generated
`dist/scripted-semantic-server.cjs`; rerunning the same suite with explicit
fixture-write permission passed. This was an execution-permission boundary,
not a product or test failure.

