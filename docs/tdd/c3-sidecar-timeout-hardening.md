# C3 sidecar timeout and event hardening: TDD evidence

Parent revision: `cb69598`

## Delivered boundary

Every Node-to-sidecar request now has a deadline. Foreground requests default
to 15 seconds; cold initialization has an independent 30-second budget. Tests
and embedding callers can set `requestTimeoutMs` and `initializeTimeoutMs`.
A timeout is fatal to
that workspace session: every pending request receives the same typed
`SidecarTimeoutError`, the last committed generation remains observable as
`degraded`, and the wedged child is terminated.

All request settlement paths clear both their deadline timer and AbortSignal
listener. Client abort remains request-local: its ID is reserved until a late
response is drained and the session stays usable.

Close is idempotent and bounded. It first requests graceful shutdown. If the
request times out, the child does not exit after acknowledging shutdown, or it
ignores SIGTERM, the adapter waits the configurable termination grace (default
one second) and sends SIGKILL. Cleanup timeouts are not surfaced to LSP callers.

The id-less event lane now recognizes only the Rust contract's
`catalog/progress` envelope with string `workspaceIdentity` and object
`status`. The exported event type remains the extension point for future
recognized event variants; arbitrary id-less messages are protocol errors.

## RED/GREEN slices

### Silent initialize

```text
node --test --test-name-pattern='silent initialize' tests/index-adapter.test.mjs
```

RED: the outer driver timed out because initialize remained pending forever.
GREEN: initialize rejected with `SidecarTimeoutError`; when the deliberately
silent child had begun executing it recorded SIGTERM before the outer boundary.
The separate initialization budget prevents foreground timeout tests from
misclassifying a healthy but CPU-starved process startup.

### Silent search and pending status

```text
node --test --test-name-pattern='silent search' tests/index-adapter.test.mjs
```

After a successful generation-7 refresh, search and an in-flight status request
were both rejected by the search deadline. A subsequent status call returned
`degraded`, generation 7, without contacting the terminated process.

### Bounded idempotent close

```text
node --test --test-name-pattern='bounds silent shutdown' tests/index-adapter.test.mjs
```

RED: both close callers received the shutdown timeout while the child ignored
SIGTERM. GREEN: both shared one successful close promise; the adapter escalated
to SIGKILL and the recorded PID no longer existed.

### Timer cleanup

```text
node --test --test-name-pattern='maps one workspace|aborted request|business error' tests/index-adapter.test.mjs
```

Successful response, AbortError, and typed sidecar business-error paths each
closed the workspace and let the adapter driver exit naturally within two
seconds. Any retained five-second request timer would keep that public process
alive and fail the test.

### Recognized event envelope

```text
node --test --test-name-pattern='unknown-event|id-less sidecar event' tests/index-adapter.test.mjs
```

RED: `catalog/unknown` was accepted and search succeeded. GREEN: it degrades
the session as `SidecarProtocolError`, while a valid `catalog/progress` event is
routed to the hook without consuming the pending search response ID.
