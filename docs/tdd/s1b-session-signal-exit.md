# S1b session signal-exit TDD evidence

- Parent revision: `f235d93204b75fd3cb68bdbba187dc0de21655eb`
- Scope: terminal-state recognition when a real LSP child exits by signal

## RED

Command:

```sh
node --test tests/lsp-session.test.mjs
```

The regression test initialized the real `dist/server.cjs --stdio` process,
sent it `SIGTERM`, and waited for the child `exit` event. The child state was
`{ code: null, signal: "SIGTERM" }`, but `LspSession.close()` checked only
`exitCode`. It therefore sent a shutdown request to the terminated process and
failed with:

```text
LSP process exited before LSP response 2 (code=null, signal=SIGTERM)
```

Result: `3/4` passed, `1` failed.

## GREEN

The terminal check now recognizes either a non-null `exitCode` or a non-null
`signalCode`. A signaled child returns immediately without sending shutdown:

```js
{ shutdown: null, exit: { code: null, signal: "SIGTERM" } }
```

Two calls to `session.close()` resolve to the same cached result, preserving
idempotence.

Verification:

```sh
node --test tests/lsp-session.test.mjs
```

Result: `4/4` passed, `0` failed, `0` skipped.
