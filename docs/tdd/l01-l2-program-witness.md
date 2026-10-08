# L01 L2 re-arm: compiler-build witness

Date: 2026-10-07. Parent revision: `72a2fa897659fa0c44d9aeaf1a7b721c74f06a86`.
The worktree already contained uncommitted L01 changes. This slice changes only
the double-gated `ARKTS_BENCHMARK_CONTROL=1` plus `ARKTS_L01_REARM_TRIM=1`
experiment; the production default remains unchanged.

## Public RED

`node --test tests/semantic/semantic-l2-rearm-witness.test.mjs` launches a real
`dist/server.cjs` LSP child with normal diagnostics. After a valid definition
and an explicit L2 trim, it sends an invalid `textDocument/rename` and verifies
the public `-32602` response. That request reaches the resident context but
returns before TypeScript `getRenameInfo()` and produced no observed
`createProgram` event in its compiler-query window.
The old unconditional `withLease` finally block incorrectly re-armed L2:
the second pressure request emitted a second trim (`2 !== 1`).

## Minimal GREEN and its limit

The lease boundary now marks semantic work only after a successful synchronous
query with a positive `createProgram` event from the compiler's
`PerformanceDotting` collector. Nested query tracing also contributes to that
positive signal. A zero event, unavailable collector, or thrown query does not
re-arm. No `LanguageService.getProgram()` call was added: that getter invokes
`synchronizeHostData()` and can itself trigger the cold build being measured.

The public transcript now keeps one trim after invalid rename and observes a
second trim only after a valid post-trim definition. The existing real-LSP
registry trim transcript remains GREEN. Focused command:

```bash
pnpm build
node --test tests/semantic/semantic-l2-rearm-witness.test.mjs \
  tests/semantic/semantic-registry-trim.test.mjs \
  tests/semantic/semantic-context-lifecycle.test.mjs
```

The compiler collector groups records: a positive event proves at least one
completed `createProgram()` within the query window, **not** the new Program's
strict resident-LanguageService identity or the number of constructions. This
is an experimental conservative admission witness, not a product resource
gate. The real Settings L2/L3 feedback loop and L3 transient timeout
falsification remain open; L01 stays BLOCKED and L02 is not admitted.
