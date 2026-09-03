# H2 LSP waiter timeout cleanup TDD evidence

- Parent revision: `a4abd5b87c724e127850f6e7fe5740e6fa4249f7`
- Scope: unregister a response waiter when its timeout fires
- Excluded: spawn errors, protocol parse failures, close escalation, and
  production language-server behavior

The regression test launches a real Node child process that writes a valid,
Content-Length-framed response after the original response waiter has timed
out. It immediately requests the same response id again. The late response must
reach the second call instead of being consumed by the rejected waiter. This
event ordering avoids a fixed sleep in the test.

## RED

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: H1 remained GREEN, but H2 failed because the second lookup timed out:

```text
Timed out waiting for LSP response 52. stderr:
```

The first timed-out waiter remained in `waiters` and consumed the response when
it arrived.

## GREEN

The timeout callback now removes its own waiter before rejecting. No other
message routing or lifecycle behavior changed.

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `2/2` passing. H1 completed in about 116 ms, H2 in about 198 ms,
and the focused run in about 460 ms. H2 contains no fixed scheduling delay.
