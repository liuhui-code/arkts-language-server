# H1 LSP process exit propagation TDD evidence

- Plan parent revision: `134e8ba8ad7b3b4783c83d6b7bb44ba78ed20159`
- Runtime behavior baseline: `ef8ab953`
- Scope: make the real-child-process LSP test driver fail fast when a child
  exits while a response is pending
- Excluded: spawn-error handling, protocol parse failures, close escalation,
  and production language-server behavior

The regression test launches a real Node child process, captures a deterministic
stderr marker, and makes it exit with code 23 while response 41 is pending.
The expected rejection includes the response description, exit code, signal,
and captured stderr so a CI failure is actionable without waiting for the normal
five-second response timeout.

## RED

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: failed after the one-second guard because the pending response was not
rejected when the child exited. The reported error was:

```text
pending response did not reject after the child exited
```

The orphaned response timeout also kept the test process alive for about five
seconds.

## GREEN

The driver now listens for the child's `close` event, clears every pending
waiter's timeout, and rejects it with the exit code, signal, and stderr.

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `1/1` passing; the regression case completed in about 119 ms and the
entire test process in about 265 ms.
