# References queue and candidate-selection timing

Parent revision: `e76f47a95edec1c05609727fc49f27a3c4727c32`.
Public boundary: real `dist/server.cjs --stdio` LSP requests with
`ARKTS_REFERENCES_TRACE=1`.

Two vertical RED→GREEN cycles in `tests/semantic/references-batching.test.mjs`:

1. The batched real-LSP test failed because no `references.queue.start` event
   existed. After the change, each reference request records nonnegative
   `queueWaitMs` between arrival at the persistent semantic Worker and actual
   dispatch from its serial queue.
2. The indexed real-LSP test failed because no
   `references.candidate-selection.complete` event existed. After the change,
   it records accepted/fallback outcome, candidate count and duration.

Commands:

```text
pnpm build
node --test --test-name-pattern='batched references preserve the legacy Location set' tests/semantic/references-batching.test.mjs
node --test --test-name-pattern='indexed batching narrows compiler batches but keeps the exact references result' tests/semantic/references-batching.test.mjs
pnpm check
pnpm check:fast
```

These fields are emitted only with opt-in trace. Candidate-selection duration
includes index querying and, for usage-site fallback, any separate compiler
definition anchor; it is **not** a pure SQLite duration. No source text or
absolute path is logged. The LSP results remain exact against the existing
goldens. F1 still lacks a separately measured compiler-internal
`createProgram`/`getTypeChecker` split and a request-wide correlation key.
The full local `check:fast` run passed: 931 tests, zero failures or skips.
