# Cached references during automatic diagnostics

Parent revision: `3209adcdeaa7bab10db31d08ca34033aceb149b0`.
This is F6b in the [latency plan](../plans/2026-09-20-references-latency-execution-plan.md).

## RED

The new real-child-process, Content-Length-framed LSP test starts normal
automatic diagnostics with a default-off 1,200 ms test delay. After one
complete references result is cached, a second diagnostic starts. The same
references request must return before that diagnostic settles and must not
prevent versioned diagnostics from publishing. Before the change:

```text
pnpm build && node --test tests/semantic/references-diagnostic-cache.test.mjs
AssertionError: cached references waited for diagnostic quiescence
```

The LSP handler had awaited diagnostic suspension before entering the
semantic request runner, so a valid cache hit paid for unrelated diagnostic
quiescence.

## GREEN

The handler now starts the versioned request first and consults only the
semantic proxy's already-validated complete-result cache. A hit returns a
clone without suspending diagnostics or launching a verifier. On a miss, the
existing diagnostic quiescence barrier still runs before compiler work;
aborted requests do not launch that work. The request runner still checks
workspace freshness, document version, and each client's cancellation before
publishing a result. Normal diagnostics are not disabled.

```text
pnpm check
pnpm build
node --test tests/semantic/references-diagnostic-cache.test.mjs \
  tests/semantic/references-result-cache.test.mjs \
  tests/lsp-diagnostics.test.mjs \
  tests/semantic/references-coalescing.test.mjs \
  tests/semantic/references-scheduling.test.mjs
```

All ten focused tests passed. The new LSP test observes the cached response
before diagnostic settlement, under 500 ms, with the same exact result as the
first query and subsequent versioned diagnostic publication. Existing public
tests retain the cache-miss suspension, edit invalidation, coalescing, and
snapshot-cancellation contracts. The production proxy's existing >500-line
file shrank from 993 to 984 lines by extracting cohesive cache telemetry;
the new source and test files each remain below 500 lines.

The first full `pnpm check:fast` run passed 943/944 tests. Its only failure
was the repository's explicit test-layer audit: the new LSP test was not yet
assigned to `bundle-e2e`. The test was registered, the manifest's asserted
count updated, and the targeted manifest plus F6b tests turned GREEN. The
subsequent full `pnpm check:fast` run passed **945/945** tests.

Real Settings/API-24 smoke results and limitations are recorded in the
[F6b report](../reports/2026-09-21-settings-api24-diagnostic-cache.md).
