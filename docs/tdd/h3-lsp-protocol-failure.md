# H3a LSP invalid-JSON protocol failure TDD evidence

- Parent revision: `d4fbf6b1980ad41dfb3b280600c470e9e9e9799b`
- Scope: convert an invalid JSON body from a real child process into a bounded,
  actionable transport failure
- Excluded: waiter predicate exceptions, spawn failures, malformed headers,
  close escalation, and production language-server behavior

The fixture child writes a syntactically valid Content-Length header followed
by a deliberately invalid JSON body containing a start marker, more than 400
padding characters, and an end marker. A public `response()` is already pending.
The expected rejection identifies a protocol failure, includes the start of the
raw body, excludes the distant end marker, and remains shorter than 350
characters.

## RED

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: H1 and H2 passed, but H3a failed as an `uncaughtException` from
`JSON.parse` in the stdout callback:

```text
Unexpected token 'I', ...","result":INVALID-ST"... is not valid JSON
```

The pending response did not receive a transport rejection; its one-second
guard remained necessary before the focused process could finish.

## GREEN

JSON decoding now has a narrow failure boundary. The driver records the first
transport failure, rejects and clears all pending waiters, bounds the raw body
excerpt to 160 characters, stops accepting further stdout, and terminates the
fixture child. `close()` also recognizes signal termination and subscribes to
`exit` before sending its own signal so cleanup cannot miss that event.

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `3/3` passing. H1 completed in about 124 ms, H2 in about 202 ms,
H3a in about 178 ms, and the focused run in about 660 ms.
