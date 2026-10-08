# L01 diagnostic priority: public-LSP RED

Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
The worktree already contained unrelated uncommitted L01 work; it was preserved.

## Contract and setup

The regression test starts the real bundled server as a child process through
`LspSession` and Content-Length framed stdio. It first completes normal v1
diagnostics for two opened documents and a complete references request. It then
opens two more real ArkTS documents together. A **default-off test-only** Worker
hook holds the first admitted `diagnose` for `DiagnosticA.ets` for 1,800 ms;
`DiagnosticB.ets` completes the normal LSP diagnostic debounce and submits its
own semantic diagnosis while the first is held. An uncached definition request
from `Jump.ets` to `Navigation.ets` follows. The target declaration has an emoji
before it on the same line so the test compares an exact URI and zero-based UTF-16
range, not merely a non-empty answer.

Both documents are opened **before** the first diagnosis is admitted. Opening
the second later would advance the workspace revision and legitimately suppress
the first v1 publication; that would test freshness instead of scheduling.
The test does not disable diagnostics, reduce semantic scope, or inspect a
private response as its correctness oracle. It requires both version-1
`publishDiagnostics` notifications to contain computed diagnostics and requires
the definition response to precede the second publication.

## RED and verification

An initial test-before-hook run (`node --test
tests/semantic/references-diagnostic-scheduling.test.mjs`) exited 1 because
the test-only admission marker did not yet exist; this was not counted as a
scheduler RED. After adding the default-off hook, `pnpm build` exited 0. The
public test then exited 1 on three independent child processes, each at the
same intended assertion:

```text
AssertionError: definition waited for the queued second diagnostic
true !== false
```

Reproduce with:

```bash
pnpm build
node --test tests/semantic/references-diagnostic-scheduling.test.mjs
```

Before that assertion, the definition is an exact one-location result and both
normal v1 diagnostic publications have arrived with non-empty diagnostic lists.
The failure is neither an LSP timeout nor a process-memory sampler failure.
`node --test tests/test-layer-manifest.test.mjs` passed 4/4 after the new public
test was registered in the fast `bundle-e2e` layer. Source and test files remain
below the repository's 500-line limit; `git diff --check` passed.

This small fixture establishes the missing scheduler ordering contract. It is
not a Settings/API24 latency or memory result, and it does not prove that an
already-running synchronous compiler diagnosis can be preempted. The current
expected state is RED until the supervisor chooses an interactive request over
the queued second background diagnosis without violating mutation order.

## Mutation / freshness safety after the priority change

With the scheduler GREEN, a second public-LSP test holds `DiagnosticA.ets`,
lets `DiagnosticB.ets` pass its normal debounce, then submits a definition for
the open `Jump.ets` document followed immediately by `didChange` to version 2.
The edit appends a definite type error without moving the definition position.
The old request must return no stale location, version-2 diagnostics must
publish the new error, and a fresh definition must return the exact
`NavigationTarget` URI and UTF-16 range. This checks mutation/freshness across
the reordered pending diagnostic and interactive request, not a private
scheduler queue implementation.

Parent revision remains `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
`pnpm build` passed, and the focused public test file passed 2/2 on three
independent runs:

```bash
pnpm build
node --test tests/semantic/references-diagnostic-scheduling.test.mjs
```

The new case is a safety characterization, not a fresh RED proving that the
priority change itself was necessary; the preceding queued-diagnostic test
provides that RED. It does not establish a Settings/API24 or 500 ms latency
result.

## GREEN and real-project control

The supervisor now selects the earliest definition/hover behind only a
contiguous diagnostic prefix. It remembers the oldest bypassed diagnostic so
the next selection must run it; mutations still have first priority. The
previously failing public ordering test passed, and the combined public test
file passed 2/2. Type-check/build, the 48-test supervisor/diagnostic/manifest
focus, and `git diff --check` also passed. The supervisor dropped from 925 to
923 lines by extracting the queue choice; the new helper is 48 lines and the
test-hook runtime is 462 lines. The final tree's `pnpm check:fast` passed
**1297/1297**, including both new real-LSP tests.

The [Settings/API24 result](../reports/2026-10-06-resident-l01-diagnostic-priority.md)
is 3/3 exact with normal v1 diagnostics, but definition takes
824.4/703.9/691.0 ms. The second diagnostic follows each definition response;
the 500 ms target remains FAIL. The real replay does not set the test hold
variables and does not use a diagnostic barrier.
