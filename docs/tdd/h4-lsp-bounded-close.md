# H4 bounded and idempotent LSP close TDD evidence

- Parent revision: `8452e0e9afdb6e133958d27f1a03263467b680ac`
- Scope: make concurrent test-driver close calls share one bounded two-stage
  termination result
- Excluded: message-type handling, progress requests, transcript changes,
  spawn failures, and production language-server behavior

The real fixture child installs a `SIGTERM` handler that deliberately keeps the
process alive, then emits a framed `fixture/ready` notification. Waiting for
that notification proves the handler is installed without a scheduling sleep.
Two concurrent `close()` calls use different grace values; the first owns the
shutdown and both calls must return the same promise. Its short grace deadline
must escalate from `SIGTERM` to `SIGKILL` and resolve with the observed exit
result. A third call after completion must return the same promise again.

The existing H1 case continues to characterize the normal already-exited path:
its `finally` block calls `close()` after an exit-code-23 child has completed,
and that call returns immediately.

## RED

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: H1 through H3b passed, but H4 hit its one-second outer guard:

```text
close did not escalate after its grace deadline
```

The old implementation sent only `SIGTERM`; the test's `finally` cleanup had to
send `SIGKILL` to reap the fixture. The focused run took about 1.96 seconds.

## GREEN

`close({ graceMs })` now caches one promise. It subscribes to `exit` before
sending `SIGTERM`, schedules one escalation timer, sends `SIGKILL` if the child
is still alive at the deadline, clears the timer on exit, and resolves every
caller with the same `{ code, signal }` result. Already-exited children receive
a cached resolved result without installing an event listener or timer.

Command:

```sh
node --test tests/lsp-process.test.mjs
```

Result: `5/5` passing. H4 completed in about 157 ms and the complete focused run
in about 986 ms, with no fixed sleep in the H4 test.
