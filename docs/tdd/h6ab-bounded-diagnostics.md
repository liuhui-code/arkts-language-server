# H6a/H6b bounded LSP diagnostics TDD evidence

- Parent revision: `11b52f2e8d4c09b3806813450b7e25b3fa1658dd`
- Scope: bounded stderr/error diagnostics, redacted bidirectional message
  envelopes, and immutable in-memory diagnostic snapshots
- Excluded: evidence filesystem persistence, CI integration, production
  language-server behavior, and payload logging

The H6 fixtures use stdin triggers, stderr write callbacks, framed messages,
stdout completion, and process exit as causal barriers. Timers are used only for
the timeout behavior under test; no fixture uses a scheduling sleep.

## H6a1: bounded stderr head and tail

Two real children wrote a head marker, a large filler-separated sensitive
middle marker, and a tail marker through nested stderr write callbacks, then
exited with code 23. The cases exercise an injected 96-byte limit and the
64-KiB default.

RED:

```sh
node --test tests/lsp-process.test.mjs
```

The first case exposed missing byte accounting (`stderrTotalBytes` was
undefined); stderr was still accumulated without a bound (`12/13` passing,
about 2.36 s).

GREEN: the collector retains the first and last halves of its byte budget,
tracks `totalBytes`, `retainedBytes`, and `droppedBytes`, and renders an omission
marker between them. The sensitive middle is absent while both head and tail
remain available. Storage defaults to 64 KiB. Exit diagnostics use a UTF-8
head/tail formatter with a configurable 4-KiB default hard limit. Both cases
passed (`13/13`, about 2.42 s).

## H6a2: bounded timeout text

A waiter used a method name longer than 2 KiB and a 128-byte diagnostic limit.

RED: the normal 20-ms timeout embedded the entire description and exceeded the
limit (`13/14` passing, about 2.61 s).

GREEN: timeout errors pass through the same byte-aware formatter and retain the
diagnostic prefix (`14/14`, about 2.47 s).

## H6a3: bounded protocol failure text

The child emitted a long invalid Content-Length field with a 96-byte diagnostic
limit.

RED: `LSP_INVALID_HEADER` remained structured, but its message exceeded the
limit (`14/15` passing, about 2.64 s).

GREEN: the first terminal error has its message bounded in place before it is
stored or distributed. Error identity, `code`, details, and `cause` remain
unchanged (`15/15`, about 2.70 s).

## H6b1: redacted bidirectional envelope transcript

A real request carried `params.source`; the child returned a response carrying
`result.source` and a notification carrying `params.source`.

RED: send/receive completed, but `diagnosticSnapshot()` did not exist (`15/16`
passing, about 2.73 s).

GREEN: send and receive now append only these envelope fields:

- `direction` and monotonic `sequence`;
- JSON-RPC `kind`, `method`, and `id`;
- raw JSON body `byteSize`.

No params, result, or source content is retained. The first snapshot also added
PID, running/closing/exited/failed terminal state, pending waiter descriptions,
parser byte state, stderr metadata, and transcript counters (`16/16`, about
2.72 s).

## H6b2: bounded transcript retention

Two real-process cases queued six notifications after one outbound request.
One configured a three-entry cap; the other configured a 220-byte cap.

RED: all seven envelopes remained despite the three-entry setting (`16/17`
passing, about 3.00 s).

GREEN: transcript retention defaults to 128 entries and 64 KiB. Oldest entries
are evicted until both configured limits hold; absolute sequence and total entry
count remain monotonic, while retained bytes and dropped entries are reported
(`17/17`, about 3.05 s).

## H6b3: immutable state snapshots

A response waiter was snapshotted while pending, then an stdin-triggered invalid
header moved the transport to failed state.

RED: the snapshot contained the state but its root and nested objects were
mutable. The test was hardened to attach `allSettled` before early assertions,
so the stable RED had no leaked rejection (`17/18`, about 3.11 s).

GREEN: every call constructs fresh objects and recursively freezes the complete
snapshot, including terminal/parser/stderr objects, pending descriptions,
transcript metadata, its entry array, and individual envelopes. The later
snapshot independently reports `failed`, `LSP_INVALID_HEADER`, and no pending
waiters.

Final focused verification:

```sh
node --check tests/support/lsp-process.mjs
node --check tests/lsp-process.test.mjs
node --test tests/lsp-process.test.mjs
```

Result: `18/18` passing in about 3.06 seconds after removing fixture keepalive
timers in favor of `process.stdin.resume()`.

Shared-driver integration verification:

```sh
node --test --test-concurrency=1 tests/lsp-reliability.test.mjs tests/lsp-transcript.test.mjs
```

Result: `10/10` passing in about 6.78 seconds. This covers existing stderr
inspection, request lifecycle, framed send/receive, shutdown, and exit behavior.
