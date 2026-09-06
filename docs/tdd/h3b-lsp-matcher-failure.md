# H3b LSP matcher failure TDD evidence

- Parent revision: `c757f2c3686397e0de2dd7e96aca8dd29a0528dc`
- Scope: contain a public notification matcher's exception at the stdout
  acceptance boundary and reject every pending waiter
- Excluded: malformed-header diagnostics, spawn failures, close escalation,
  and production language-server behavior

The fixture child emits one valid, Content-Length-framed JSON notification.
The registered public `notification()` predicate throws an error whose message
contains a start marker, 400 padding characters, and a distant end marker. A
separate response waiter is pending at the same time. Both promises must reject
with the same terminal transport error; its message contains the start marker,
omits the end marker, remains bounded, and retains the original exception as
`cause`.

## RED

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: H1 through H3a passed, but H3b failed as an `uncaughtException`. The
matcher's original long message escaped directly from `accept()` and neither
waiter received a transport rejection. The focused run took about 1.66 seconds
because the one-second guard was needed to release the pending promises.

## GREEN

The stdout callback now invokes `accept()` through one exception boundary.
An escaped failure is converted to a transport error whose cause excerpt is
limited to 160 characters while the original exception remains available in
`error.cause`. The existing one-shot `failTransport()` path rejects all pending
waiters with that same error and terminates the child.

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `4/4` passing. H1 completed in about 124 ms, H2 in about 196 ms,
H3a in about 182 ms, H3b in about 180 ms, and the focused run in about 834 ms.
