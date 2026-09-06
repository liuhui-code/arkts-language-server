# P1 semantic worker test harness

Status: GREEN infrastructure seam; production responsiveness remains unclaimed.

## Scope

This slice provides a deterministic test-only server and worker for the semantic-worker plan.
It does not alter the production server, capability manifest, package scripts, test-layer manifest,
or release artifacts.

The public test seam is `buildBlockingSemanticTestServer()`. One test process receives one reusable
temporary build containing adjacent CommonJS server and worker bundles. Separate test processes use
separate temporary directories, and neither bundle is written under repository `dist`.

## TDD evidence

Parent revision: `a21cbe1`.

RED 1 — missing build seam:

```sh
node --test tests/semantic-worker-test-harness.test.mjs
```

Failed with `ERR_MODULE_NOT_FOUND` for `tests/support/build-worker-test-server.mjs`.

RED 2 — worker protocol absent:

```sh
node --test tests/semantic-worker-test-harness.test.mjs
```

Failed because the empty worker exited with code 0 before the `entered` message.

RED 3 — stdio barrier absent:

```sh
node --test tests/semantic-worker-test-harness.test.mjs
```

Failed because the empty server exited before the initialize response.

GREEN:

```sh
node --test tests/semantic-worker-test-harness.test.mjs
```

All five focused tests pass with no skipped, todo, or cancelled cases.

## Deterministic blocking contract

- Every blocking request owns a fresh, exactly four-byte `SharedArrayBuffer` cell.
- The worker posts `entered`, then synchronously waits on that request's cell.
- Client cancellation stores state `1`; document replacement stores state `2`; fixture disposal
  stores state `3`. Each transition also calls `Atomics.notify`.
- A 30-second worker failsafe prevents an abandoned test from hanging forever. It emits a distinct
  `failsafe` failure and never masquerades as a successful terminal response.
- The server forwards the entered barrier as the standard LSP `window/logMessage` notification.
  stdout therefore remains exclusively Content-Length framed LSP traffic.
- Cleanup removes one bounded two-bundle directory, unregisters its single process-exit listener,
  and is safe to call repeatedly.

## Deferred proof

This harness proves the test seam only. A later RED must run the real production composition and
show that malformed protocol traffic, `$/cancelRequest`, and `didChange` remain responsive while a
real semantic query is synchronously blocked. Until that test becomes GREEN, this slice makes no
claim that production semantic work is off the stdio event loop.
